import '../../app/model/joint';
import { buildMechanism } from '../../test-utils/verification/fixture';
import {
  GEAR_FOUR_BAR,
  GEAR_PAIR,
  gearNetworkFixture,
  GearFixture,
} from '../../test-utils/verification/gear-fixtures';
import { createMechanismHarness } from '../../test-utils/mechanism-harness';
import { urlGeneratorFor } from '../../test-utils/url-encoding';
import { StringTranscoder } from '../../app/services/transcoding/string-transcoder';
import { MechanismBuilder } from '../../app/services/transcoding/mechanism-builder';
import { Checksum } from '../../app/services/transcoding/checksum';
import { LengthUnit } from '../../app/model/utils';
import { MODEL_SCALE } from '../../app/model/render-scale';
import { RealJoint } from '../../app/model/joint';

function loaded(fixture: GearFixture = GEAR_PAIR, unit = LengthUnit.CM, scale = MODEL_SCALE) {
  const harness = createMechanismHarness();
  const source = buildMechanism(fixture);
  source.joints.forEach((j) => {
    j.x *= scale;
    j.y *= scale;
  });
  harness.service.joints = source.joints;
  harness.service.links = source.links;
  harness.service.gears = fixture.transmission.gears.map((g) => ({
    ...g,
    module: g.module * scale,
  }));
  harness.service.gearMeshes = [...fixture.transmission.meshes];
  harness.settings.lengthUnit.next(unit);
  harness.settings.inputSpeed.next(60);
  harness.settings.isInputCW.next(false);
  harness.service.updateMechanism();
  return harness;
}

function encode(h: ReturnType<typeof loaded>) {
  return urlGeneratorFor(h.service, h.settings).generateUrlQuery();
}

function reopen(url: string, h = createMechanismHarness()) {
  const decoder = new StringTranscoder();
  decoder.decodeURL(url);
  new MechanismBuilder(h.service, decoder, h.settings, h.active).build(true);
  h.service.updateMechanism();
  return h;
}

function changedPayload(url: string, mutate: (payload: Record<string, unknown>) => void) {
  const body = new Checksum().strip(url);
  const altered = body.replace(/G1~([A-Za-z0-9_-]+)/, (_, token: string) => {
    const payload = JSON.parse(atob(token.replace(/-/g, '+').replace(/_/g, '/')));
    mutate(payload);
    return (
      'G1~' +
      btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    );
  });
  return new Checksum().stamp(altered);
}

describe('production gear documents', () => {
  for (const [unit, scale] of [
    [LengthUnit.CM, 200],
    [LengthUnit.METER, 2],
    [LengthUnit.INCH, 200 / 2.54],
  ] as const) {
    for (const diagonal of [false, true]) {
      it(`stabilizes precise ${diagonal ? 'diagonal' : 'axis-aligned'} geometry in ${unit}`, () => {
        const fixture = gearNetworkFixture(
          [
            { center: [0, 0], teeth: 20, heading: 0.721 },
            { center: diagonal ? [1.8, 2.4] : [3, 0], teeth: 40, heading: 1.234 },
          ],
          [[0, 1]]
        );
        // A reference arm smaller than the legacy .001 project-unit quantum.
        fixture.joints[3].x = fixture.joints[2].x + 0.0008 * Math.cos(1.234);
        fixture.joints[3].y = fixture.joints[2].y + 0.0008 * Math.sin(1.234);
        const initial = loaded(fixture, unit, scale);
        const url = encode(initial);
        let next = reopen(url);
        for (let i = 0; i < 5; i++) {
          expect(encode(next)).toBe(url);
          expect(next.service.mechanisms[0].isMechanismValid()).toBe(true);
          expect(next.service.mechanisms[0].gearTravel.at(-1)).toBeCloseTo(4 * Math.PI, 8);
          next = reopen(encode(next));
        }
        initial.service.joints.forEach((joint, i) => {
          expect(next.service.joints[i].x).toBeCloseTo(joint.x, 10);
          expect(next.service.joints[i].y).toBeCloseTo(joint.y, 10);
        });
      });
    }
  }

  it('round-trips a closed linkage through the production service and solver', () => {
    const initial = loaded(GEAR_FOUR_BAR);
    const next = reopen(encode(initial));
    const mechanism = next.service.mechanisms[0];
    expect(mechanism.isMechanismValid()).toBe(true);
    expect(next.service.partitions).toHaveLength(1);
    expect(next.service.joints.filter((j) => (j as RealJoint).input)).toHaveLength(1);
    expect(mechanism.gearTravel.at(-1)).toBeCloseTo(4 * Math.PI, 8);
    expect(mechanism.gearDiagnostics).toEqual([]);
  });

  it('loads physical incompatibility as editable data with the shared diagnostic', () => {
    const initial = loaded();
    initial.service.gears[1] = { ...initial.service.gears[1], module: 30 };
    const next = reopen(encode(initial));
    expect(next.service.gears[1].module).toBe(30);
    expect(next.service.mechanisms[0].isMechanismValid()).toBe(false);
    expect(
      next.service.mechanisms[0].gearDiagnostics.some((d) => d.code === 'incompatible-module')
    ).toBe(true);
  });

  it('rejects malformed gear records before the builder can replace the drawing', () => {
    const initial = loaded();
    const url = encode(initial);
    const before = initial.service.joints;
    const mutations = [
      (p: Record<string, unknown>) => {
        p['gears'] = [{ id: 'bad' }];
      },
      (p: Record<string, unknown>) => {
        p['meshes'] = [{ id: 'M1', gearAId: 'missing', gearBId: 'G2', kind: 'external' }];
      },
      (p: Record<string, unknown>) => {
        p['points'] = [];
      },
      (p: Record<string, unknown>) => {
        p['gears'] = [...(p['gears'] as object[]), ...(p['gears'] as object[])];
      },
    ];
    for (const mutate of mutations)
      expect(() => reopen(changedPayload(url, mutate), initial)).toThrow();
    expect(initial.service.joints).toBe(before);
    expect(() =>
      reopen(new Checksum().stamp(new Checksum().strip(url).replace('G1~', 'G2~')), initial)
    ).toThrow();
  });

  it('rejects multiple actuators before reconciliation can discard either input', () => {
    const initial = loaded();
    (initial.service.joints[2] as RealJoint).input = true;
    expect(() => reopen(encode(initial))).toThrowError(/one independent input/);
  });

  it('rescales canonical module with project units and retains the ratio', () => {
    const h = loaded();
    const diameter = h.service.gears[0].module * 20;
    h.service.updateLinkageUnits(LengthUnit.CM, LengthUnit.METER);
    h.settings.lengthUnit.next(LengthUnit.METER);
    expect(h.service.gears[0].module * 20).toBeCloseTo(diameter / 100, 10);
    expect(reopen(encode(h)).service.mechanisms[0].isMechanismValid()).toBe(true);
  });

  it('leaves gear-free encoding unchanged', () => {
    const h = loaded();
    h.service.gears = [];
    h.service.gearMeshes = [];
    const url = encode(h);
    expect(url).not.toContain('G1~');
    expect(encode(reopen(url))).toBe(url);
  });
});
