import '../../app/model/joint';
import { TestBed } from '@angular/core/testing';
import { COMPOUND_GEAR_TRAIN } from '../../test-utils/verification/compound-gear-fixtures';
import { fixturePayload } from '../../test-utils/verification/fixture-gallery';
import { TEMPLATE_LINKAGES } from '../../app/component/MODALS/templates/template-linkages';
import { MechanismService } from '../../app/services/mechanism.service';
import { GearEditorService } from '../../app/services/gear-editor.service';
import { UrlProcessorService } from '../../app/services/url-processor.service';
import { UrlGenerationService } from '../../app/services/url-generation.service';
import { SaveHistoryService } from '../../app/services/save-history.service';
import { SelectionBatchService } from '../../app/services/selection-batch.service';
import { validateGearAssembly } from '../../app/model/mechanism/gear-validation';
import { RealLink } from '../../app/model/link';
import { RealJoint } from '../../app/model/joint';
import { Coord } from '../../app/model/coord';
import { MODEL_SCALE as S } from '../../app/model/render-scale';

function context() {
  return {
    s: TestBed.inject(MechanismService),
    editor: TestBed.inject(GearEditorService),
    history: TestBed.inject(SaveHistoryService),
    batch: TestBed.inject(SelectionBatchService),
    encode: () => TestBed.inject(UrlGenerationService).generateUrlQuery(),
  };
}
type Context = ReturnType<typeof context>;
describe('compound production lifecycle', () => {
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
  it('attaches another gear to the existing shaft with no new joint, body, input or DOF', () => {
    TestBed.inject(UrlProcessorService).updateFromURL(
      TEMPLATE_LINKAGES.Simple_Gear_Pair,
      false,
      true,
      true
    );
    const h = context(),
      before = h.encode(),
      host = h.s.links.find((l) => l.id === h.s.gears[1].hostLinkId) as RealLink;
    const counts = [
      h.s.joints.length,
      h.s.links.length,
      h.s.joints.filter((j) => (j as RealJoint).input).length,
    ];
    const added = h.editor.attach(host)!;
    expect(added.hostLinkId).toBe(host.id);
    expect(added.plane).toBe(1);
    expect([
      h.s.joints.length,
      h.s.links.length,
      h.s.joints.filter((j) => (j as RealJoint).input).length,
    ]).toEqual(counts);
    expect(h.s.mechanisms[0].dof).toBe(1);
    expect(h.s.mechanisms[0].isMechanismValid()).toBe(true);
    h.history.undo();
    expect(h.encode()).toBe(before);
    h.history.redo();
    expect(h.s.gears).toHaveLength(3);
  });
  for (const id of ['GB', 'GC']) {
    it(`deletes only ${id} and its incident edge, with undo/redo`, () => {
      const h = context(),
        before = h.encode(),
        other = id === 'GB' ? 'GC' : 'GB',
        kept = id === 'GB' ? 'GMCD' : 'GMAB';
      h.editor.removeGear(id);
      expect(h.s.gears.some((g) => g.id === other)).toBe(true);
      expect(h.s.gearMeshes.map((m) => m.id)).toEqual([kept]);
      expect(h.s.links.some((l) => l.id === 'CD')).toBe(true);
      expect(validateGearAssembly(h.s.transmission, h.s.joints, h.s.links)).toEqual([]);
      if (id === 'GC') expect(h.s.mechanismForId('GB')!.isMechanismValid()).toBe(true);
      else
        expect(h.s.mechanismForId('GC')!.gearDiagnostics.some((d) => d.code === 'input')).toBe(
          true
        );
      expect(h.s.joints.filter((j) => (j as RealJoint).input)).toHaveLength(1);
      const after = h.encode();
      h.history.undo();
      expect(h.encode()).toBe(before);
      h.history.redo();
      expect(h.encode()).toBe(after);
    });
  }
  const cascades: [string, (h: Context) => void][] = [
    [
      'host',
      ({ s }) => {
        s.activeObjService.updateSelectedObj(s.links.find((l) => l.id === 'CD'));
        s.deleteLink();
      },
    ],
    [
      'center',
      ({ s }) => {
        s.activeObjService.updateSelectedObj(s.joints.find((j) => j.id === 'C'));
        s.deleteJoint();
      },
    ],
    [
      'reference',
      ({ s }) => {
        s.activeObjService.updateSelectedObj(s.joints.find((j) => j.id === 'D'));
        s.deleteJoint();
      },
    ],
  ];
  for (const [name, remove] of cascades)
    it(`cascades both attachments when deleting their ${name}`, () => {
      const h = context(),
        before = h.encode();
      remove(h);
      expect(h.s.gears.map((g) => g.id)).toEqual(['GA', 'GD']);
      expect(h.s.gearMeshes).toHaveLength(0);
      const after = h.encode();
      h.history.undo();
      expect(h.encode()).toBe(before);
      h.history.redo();
      expect(h.encode()).toBe(after);
    });
  for (const full of [false, true])
    it(`duplicates ${full ? 'the entire train' : 'the shared shaft only'} without connecting copies to originals`, () => {
      const h = context(),
        before = h.encode();
      const selected = full ? h.s.links : h.s.links.filter((l) => l.id === 'CD');
      expect(
        h.batch.duplicateSelected(
          selected.map((l) => ({ kind: 'link' as const, id: l.id })),
          { x: 0, y: 8 * S }
        ).ok
      ).toBe(true);
      const copies = h.s.gears.slice(4),
        ids = new Set(copies.map((g) => g.id));
      expect(copies).toHaveLength(full ? 4 : 2);
      expect(copies.every((g) => !['GA', 'GB', 'GC', 'GD'].includes(g.id))).toBe(true);
      const b = copies.find((g) => g.name === 'Gear B')!,
        c = copies.find((g) => g.name === 'Gear C')!;
      expect(b.hostLinkId).toBe(c.hostLinkId);
      expect(b.hostLinkId).not.toBe('CD');
      expect(c.plane).toBe(1);
      expect(h.s.gearMeshes).toHaveLength(full ? 4 : 2);
      expect(h.s.gearMeshes.slice(2).every((m) => ids.has(m.gearAId) && ids.has(m.gearBId))).toBe(
        true
      );
      const after = h.encode();
      h.history.undo();
      expect(h.encode()).toBe(before);
      h.history.redo();
      expect(h.encode()).toBe(after);
    });
  it('remaps both attachments when a tracer changes the shared host ID', () => {
    const h = context(),
      before = h.encode(),
      host = h.s.links.find((l) => l.id === 'CD')!;
    h.s.activeObjService.updateSelectedObj(host);
    h.s.addJointAt(new Coord(S, S));
    const peers = h.s.gears.filter((g) => ['GB', 'GC'].includes(g.id));
    expect(peers.every((g) => g.hostLinkId === host.id)).toBe(true);
    expect(h.s.gearMeshes).toHaveLength(2);
    h.s.activeObjService.updateSelectedObj(h.s.joints.at(-1));
    h.s.deleteJoint();
    expect(
      h.s.gears.filter((g) => ['GB', 'GC'].includes(g.id)).every((g) => g.hostLinkId === 'CD')
    ).toBe(true);
    h.history.undo();
    h.history.undo();
    expect(h.encode()).toBe(before);
  });
  it('refuses host rewrites before mutation while any attachment remains', () => {
    const h = context();
    h.editor.removeGear('GB');
    const before = h.encode();
    const c = h.s.joints.find((j) => j.id === 'C') as RealJoint,
      a = h.s.joints.find((j) => j.id === 'A') as RealJoint;
    expect(h.s.mergeJoints(c, a)).toBe('gear-host');
    h.s.weldJoint(c);
    expect(h.encode()).toBe(before);
  });
  it('edits paused metadata without redefining shared-shaft phase', () => {
    const h = context();
    h.s.seekMechanismTo(0, 0.63);
    const step = h.s.currentSampleOf(0);
    const before = h.s.mechanisms[0].gearMotionAtSample(step)!.angles.get('GC');
    expect(h.editor.edit('GC', { name: 'Secondary pinion' })).toBe(true);
    expect(h.s.currentSampleOf(0)).toBe(step);
    expect(h.s.mechanisms[0].gearTravel[0]).toBe(0);
    expect(h.s.mechanisms[0].gearMotionAtSample(step)!.angles.get('GC')).toEqual(before);
  });
});
