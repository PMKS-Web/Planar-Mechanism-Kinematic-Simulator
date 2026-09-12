import { buildMechanism } from '../../../test-utils/verification/fixture';
import {
  structuralCrankFixture,
  structuralBeamFixture,
} from '../../../test-utils/verification/structural-fixtures';
import { teachingLabFourBarFixture } from '../../../test-utils/verification/fixtures';
import { punchPressFixture } from '../../../test-utils/verification/force-fixtures';
import { Joint, RevJoint } from '../joint';
import { RealLink } from '../link';
import { Mechanism } from '../mechanism/mechanism';
import { LengthUnit } from '../unit-enums';
import { MODEL_SCALE } from '../render-scale';
import { NEWTONS_PER_LBF } from '../unit-conversions';
import {
  analyzePmksFrame,
  loadCaseFromPmksForces,
  PmksStructuralFrame,
  snapshotPmksConfiguration,
} from './pmks-configuration';
import { ForceSolver } from '../mechanism/force-solver';
import { createMechanismHarness } from '../../../test-utils/mechanism-harness';

function frameOf(built: ReturnType<typeof buildMechanism>): PmksStructuralFrame {
  return {
    joints: built.joints,
    links: built.links,
    lengthUnit: LengthUnit.METER,
    coordinateSpace: 'project',
  };
}

describe('PMKS structural configuration adapter', () => {
  it('refreshes cached sample metadata after an undoable structural edit without changing motion', () => {
    const built = buildMechanism(structuralCrankFixture());
    const { service, settings, saveCount } = createMechanismHarness();
    settings.lengthUnit.next(LengthUnit.METER);
    service.joints = built.joints;
    service.links = built.links;
    service.forces = built.forces;
    service.updateMechanism();
    const original = service.mechanisms[0];
    const positions = original.joints.map((js) => js.map((j) => [j.id, j.x, j.y]));
    service.links[0].structural = { material: { name: 'Steel', densityKgM3: 7850 } };
    const saved = saveCount();
    service.updateMechanism(true);
    expect(saveCount()).toBe(saved + 1);
    expect(service.mechanisms[0]).not.toBe(original);
    expect(service.mechanisms[0].links[1][0].structural).toEqual(service.links[0].structural);
    expect(service.mechanisms[0].joints.map((js) => js.map((j) => [j.id, j.x, j.y]))).toEqual(
      positions
    );
  });

  it('solves loads already attached at arbitrary PMKS force coordinates', () => {
    const built = buildMechanism(structuralCrankFixture());
    const frame = frameOf(built);
    const result = analyzePmksFrame(
      frame,
      loadCaseFromPmksForces(frame, built.forces, 'Existing force')
    );
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.driverReactions[0].momentNm).toBeCloseTo(200, 9);
  });

  for (const [lengthUnit, metersPerUnit, coordinateSpace] of [
    [LengthUnit.METER, 1, 'project'],
    [LengthUnit.CM, 0.01, 'project'],
    [LengthUnit.INCH, 0.0254, 'project'],
    [LengthUnit.METER, 1, 'model'],
    [LengthUnit.CM, 0.01, 'model'],
    [LengthUnit.INCH, 0.0254, 'model'],
  ] as const) {
    it(
      'converts physical length for unit ' + lengthUnit + ' in ' + coordinateSpace + ' space',
      () => {
        const built = buildMechanism(structuralCrankFixture());
        const scale = (coordinateSpace === 'model' ? MODEL_SCALE : 1) / metersPerUnit;
        built.joints.forEach((j) => {
          j.x *= scale;
          j.y *= scale;
        });
        const result = analyzePmksFrame(
          { ...frameOf(built), lengthUnit, coordinateSpace },
          {
            name: 'SI tip load',
            loads: [
              {
                kind: 'point-force',
                linkId: 'AB',
                at: { frame: 'link', positionM: { x: 2, y: 0 } },
                forceN: { x: 0, y: -100 },
                directionFrame: 'global',
              },
            ],
          }
        );
        expect(result.status).toBe('ok');
        if (result.status === 'ok') expect(result.driverReactions[0].momentNm).toBeCloseTo(200, 9);
      }
    );
  }

  it('converts stored English forces to newtons', () => {
    const built = buildMechanism(structuralCrankFixture());
    const frame = { ...frameOf(built), lengthUnit: LengthUnit.INCH };
    const load = loadCaseFromPmksForces(frame, built.forces, 'English').loads[0];
    expect(load.kind).toBe('point-force');
    if (load.kind === 'point-force') {
      expect(load.forceN.y).toBeCloseTo(-100 * NEWTONS_PER_LBF, 9);
      expect(load.at.positionM.x).toBeCloseTo(2 * 0.0254, 12);
    }
  });

  it('does not require structural properties or change existing solved kinematics', () => {
    const built = buildMechanism(teachingLabFourBarFixture());
    const mechanism = built.mechanism;
    const before = mechanism.joints.map((joints) => joints.map((j) => [j.id, j.x, j.y]));
    for (const index of [0, 30, 90]) {
      const frame = {
        ...frameOf(built),
        joints: mechanism.joints[index],
        links: mechanism.links[index],
      };
      const result = analyzePmksFrame(frame, {
        name: 'Coupler couple',
        loads: [{ kind: 'moment', linkId: 'BCFG', momentNm: 5 }],
      });
      expect(result.status).toBe('ok');
      expect(result.diagnostics.normalizedResidual!).toBeLessThan(1e-10);
    }
    expect(mechanism.joints.map((js) => js.map((j) => [j.id, j.x, j.y]))).toEqual(before);
    expect(built.links.every((link) => link.structural === undefined)).toBe(true);
  });

  it('agrees with the existing strict force solver on the supported beam fixture', () => {
    const built = buildMechanism(structuralBeamFixture());
    const frame = frameOf(built);
    const actual = analyzePmksFrame(frame, loadCaseFromPmksForces(frame, built.forces, 'Beam'));
    const existing = ForceSolver.analyzeFrame(built.joints, built.links, 'static', false, 'm');
    expect(actual.status).toBe('ok');
    expect(existing.status).toBe('ok');
    if (actual.status !== 'ok') return;
    for (const reaction of actual.jointReactions) {
      const old = existing.jointReactionsByLink.get(reaction.jointId)!.get(reaction.linkId)!;
      expect(reaction.forceN.x).toBeCloseTo(old[0], 8);
      expect(reaction.forceN.y).toBeCloseTo(old[1], 8);
    }
  });

  it('rejects prismatic joints explicitly before solving', () => {
    const frame = frameOf(buildMechanism(punchPressFixture()));
    expect(analyzePmksFrame(frame, { name: 'Empty', loads: [] }).status).toBe(
      'unsupported-joint-type'
    );
  });

  it('rejects unspecified coordinate units and nonrevolute base joints', () => {
    const built = buildMechanism(structuralCrankFixture());
    expect(
      snapshotPmksConfiguration({ ...frameOf(built), lengthUnit: LengthUnit.NULL }).status
    ).toBe('invalid-geometry');
    expect(
      snapshotPmksConfiguration({
        ...frameOf(built),
        joints: [new Joint('A', 0, 0), built.joints[1]],
      }).status
    ).toBe('unsupported-joint-type');
  });

  it('copies metadata into solved samples and snapshots without aliasing the drawing', () => {
    const built = buildMechanism(structuralCrankFixture());
    built.links[0].structural = { material: { name: 'Steel', elasticModulusPa: 200e9 } };
    const solved = new Mechanism(built.joints, built.links, built.forces, [], false, 'm', 1);
    expect(solved.links[10][0].structural).toEqual(built.links[0].structural);
    expect(solved.links[10][0].structural).not.toBe(built.links[0].structural);
    const snapshot = snapshotPmksConfiguration({
      ...frameOf(built),
      joints: solved.joints[10],
      links: solved.links[10],
    });
    expect(snapshot.status).toBe('ok');
    if (snapshot.status !== 'ok') return;
    expect(snapshot.configuration.bodies[0].structural).not.toBe(solved.links[10][0].structural);
  });

  it('excludes a frame body and treats every pin on it as a support', () => {
    const built = buildMechanism(structuralCrankFixture());
    const a = built.joints[0] as RevJoint;
    const c = new RevJoint('C', -1, -1, false, true);
    const d = new RevJoint('D', 1, -1, false, true);
    a.ground = false;
    const bracket = new RealLink('ACD', [a, c, d], 0, 0);
    const frame = {
      ...frameOf(built),
      joints: [...built.joints, c, d],
      links: [...built.links, bracket],
    };
    const snapshot = snapshotPmksConfiguration(frame);
    expect(snapshot.status).toBe('ok');
    if (snapshot.status !== 'ok') return;
    expect(snapshot.configuration.bodies.map((b) => b.id)).toEqual(['AB']);
    expect(snapshot.configuration.joints.find((j) => j.id === 'A')!.grounded).toBe(true);
    expect(
      analyzePmksFrame(frame, {
        name: 'Frame load',
        loads: [{ kind: 'moment', linkId: 'ACD', momentNm: 10 }],
      }).status
    ).toBe('invalid-load');
  });

  it('refuses drivers whose reaction body is ambiguous', () => {
    const built = buildMechanism(structuralCrankFixture());
    const second = new RealLink('AX', [built.joints[0], new RevJoint('X', 0, 2)], 0, 0);
    const frame = {
      ...frameOf(built),
      joints: [...built.joints, second.joints[1]],
      links: [...built.links, second],
    };
    expect(snapshotPmksConfiguration(frame).status).toBe('unsupported-topology');
  });

  it('treats an assembled compound as one body and preserves its multi-joint geometry', () => {
    const built = buildMechanism(structuralCrankFixture());
    const c = new RevJoint('C', 2, 1);
    const leaf = new RealLink('BC', [built.joints[1], c], 0, 0);
    const compound = new RealLink('ABC', [...built.joints, c], 2, 1, undefined, [
      built.links[0],
      leaf,
    ]);
    const frame = { ...frameOf(built), joints: [...built.joints, c], links: [compound] };
    const result = analyzePmksFrame(frame, {
      name: 'Compound',
      loads: [
        {
          kind: 'point-force',
          linkId: 'ABC',
          at: { frame: 'global', positionM: { x: 2, y: 1 } },
          forceN: { x: 10, y: -100 },
          directionFrame: 'global',
        },
      ],
    });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.driverReactions[0].momentNm).toBeCloseTo(210, 9);
  });
});
