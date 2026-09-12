import '../../app/model/joint';
import { TestBed } from '@angular/core/testing';
import { COMPOUND_GEAR_TRAIN } from '../../test-utils/verification/compound-gear-fixtures';
import { fixturePayload } from '../../test-utils/verification/fixture-gallery';
import { MechanismService } from '../../app/services/mechanism.service';
import { UrlProcessorService } from '../../app/services/url-processor.service';
import { UrlGenerationService } from '../../app/services/url-generation.service';
import { Checksum } from '../../app/services/transcoding/checksum';

describe('compound G1 ownership', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    TestBed.inject(UrlProcessorService).updateFromURL(
      fixturePayload(COMPOUND_GEAR_TRAIN),
      false,
      true,
      true
    );
  });
  it('round-trips individual identities, two planes and one shared host without shaft state', () => {
    const s = TestBed.inject(MechanismService),
      urls = TestBed.inject(UrlProcessorService),
      encoder = TestBed.inject(UrlGenerationService);
    const first = encoder.generateUrlQuery();
    for (let n = 0; n < 5; n++) {
      urls.updateFromURL(encoder.generateUrlQuery(), false, true, false);
      expect(encoder.generateUrlQuery()).toBe(first);
      expect(s.gears).toHaveLength(4);
      expect(s.links).toHaveLength(3);
      expect(s.gears.find((g) => g.id === 'GB')!.hostLinkId).toBe(
        s.gears.find((g) => g.id === 'GC')!.hostLinkId
      );
      expect(s.gears.find((g) => g.id === 'GC')!.plane).toBe(1);
      expect(s.gearMeshes.map((m) => [m.gearAId, m.gearBId])).toEqual([
        ['GA', 'GB'],
        ['GC', 'GD'],
      ]);
      expect(s.mechanisms[0].isMechanismValid()).toBe(true);
    }
    const token = new Checksum().strip(first).match(/G1~([A-Za-z0-9_-]+)/)![1];
    const json = JSON.parse(atob(token.replace(/-/g, '+').replace(/_/g, '/')));
    expect(Object.keys(json.gears.find((g: { id: string }) => g.id === 'GC')).sort()).toEqual(
      [
        'centerJointId',
        'hostLinkId',
        'id',
        'module',
        'name',
        'plane',
        'referenceJointId',
        'teeth',
      ].sort()
    );
  });
  it('keeps physically overlapping planes editable through reload', () => {
    const s = TestBed.inject(MechanismService);
    s.gears = s.gears.map((g) => (g.id === 'GC' ? { ...g, plane: 0 } : g));
    s.updateMechanism(true);
    const url = TestBed.inject(UrlGenerationService).generateUrlQuery();
    TestBed.inject(UrlProcessorService).updateFromURL(url, false, true, false);
    expect(s.gears).toHaveLength(4);
    expect(s.mechanisms[0].gearDiagnostics.some((d) => d.code === 'overlapping-plane')).toBe(true);
  });
  for (const plane of [-1, 1.5, 128, null, '2']) {
    it(`rejects malformed authored plane ${String(plane)} atomically`, () => {
      const encoder = TestBed.inject(UrlGenerationService),
        before = encoder.generateUrlQuery();
      const checksum = new Checksum();
      const bad = checksum.stamp(
        checksum.strip(before).replace(/G1~([A-Za-z0-9_-]+)/, (_, token: string) => {
          const value = JSON.parse(atob(token.replace(/-/g, '+').replace(/_/g, '/')));
          value.gears[2].plane = plane;
          return (
            'G1~' +
            btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
          );
        })
      );
      vi.spyOn(console, 'error').mockImplementation(() => {});
      TestBed.inject(UrlProcessorService).updateFromURL(bad, false, true, false);
      expect(encoder.generateUrlQuery()).toBe(before);
    });
  }
});
