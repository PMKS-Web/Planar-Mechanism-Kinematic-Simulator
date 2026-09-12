import '../../app/model/joint';
import { buildMechanism } from '../../test-utils/verification/fixture';
import {
  COMPOUND_GEAR_TRAIN,
  COMPOUND_GEAR_FOUR_BAR,
} from '../../test-utils/verification/compound-gear-fixtures';
import { GEAR_PAIR, gearNetworkFixture } from '../../test-utils/verification/gear-fixtures';
import { compileGearDrive, gearBodyFor, gearMotionAt } from '../../app/model/mechanism/gear-drive';
import { mobilityFromGeometry } from '../../app/model/mechanism/mobility';
import { assignBodies } from '../../app/model/mechanism/bodies';
import { KinematicsSolver } from '../../app/model/mechanism/kinematic-solver';
import { Mechanism } from '../../app/model/mechanism/mechanism';

function rates(m: Mechanism, step: number) {
  m.prepareSolvers();
  KinematicsSolver.resetVariables();
  KinematicsSolver.determineKinematics(
    m.joints[step],
    m.links[step],
    m.inputAngularVelocities[step]
  );
  return {
    v: new Map(KinematicsSolver.jointVelMap),
    a: new Map(KinematicsSolver.jointAccMap),
    omega: new Map(KinematicsSolver.linkAngVelMap),
    alpha: new Map(KinematicsSolver.linkAngAccMap),
  };
}

describe('compound gear body ownership and solver', () => {
  it('compiles the 20/40 + 10/30 train into three physical motions and the exact +1/6 ratio', () => {
    const m = buildMechanism(COMPOUND_GEAR_TRAIN).mechanism,
      plan = m.gearDrive!;
    expect(m.isMechanismValid(), m.failure).toBe(true);
    expect(plan.bodies).toHaveLength(3);
    expect(plan.gears).toHaveLength(4);
    expect(gearBodyFor(plan, 'GB')).toBe(gearBodyFor(plan, 'GC'));
    expect(gearBodyFor(plan, 'GD')!.ratio).toEqual({ numerator: 1n, denominator: 6n });
    expect(plan.periodTurns).toBe(6);
    expect(m.joints).toHaveLength(2161);
    expect(m.cyclePeriod).toBeCloseTo(6, 9);
    expect(m.gearTravel.at(-1)).toBeCloseTo(12 * Math.PI, 9);
    for (const q of [0, 0.2, Math.PI, 12 * Math.PI]) {
      const motion = gearMotionAt(plan, q, 3, -1.25)!;
      expect(motion.angles.get('GB')).toEqual(motion.angles.get('GC'));
      expect(motion.positions.size).toBe(6);
      expect(motion.angles.get('GD')!.velocity).toBeCloseTo(0.5, 12);
      expect(motion.angles.get('GD')!.acceleration).toBeCloseTo(-1.25 / 6, 12);
    }
  });
  it('adds no mobility for another attachment; each mesh constrains physical hosts', () => {
    const { joints, links } = buildMechanism({ ...COMPOUND_GEAR_TRAIN, transmission: undefined });
    const assignment = assignBodies(joints, links),
      transmission = COMPOUND_GEAR_TRAIN.transmission;
    expect(assignment.movingBodies.size).toBe(3);
    expect(mobilityFromGeometry(joints, links, assignment)).toBe(3);
    expect(mobilityFromGeometry(joints, links, assignment, { ...transmission, meshes: [] })).toBe(
      3
    );
    expect(
      mobilityFromGeometry(joints, links, assignment, {
        ...transmission,
        meshes: transmission.meshes.slice(0, 1),
      })
    ).toBe(2);
    expect(mobilityFromGeometry(joints, links, assignment, transmission)).toBe(1);
    expect(buildMechanism(COMPOUND_GEAR_TRAIN).mechanism.dof).toBe(1);
  });
  it('admits multiple root attachments without another input or another period', () => {
    const f = COMPOUND_GEAR_TRAIN;
    const m = buildMechanism({
      ...f,
      transmission: {
        ...f.transmission,
        gears: [
          ...f.transmission.gears,
          { ...f.transmission.gears[0], id: 'GE', teeth: 17, plane: 2 },
        ],
      },
    }).mechanism;
    expect(m.isMechanismValid()).toBe(true);
    expect(m.gearDrive!.bodies).toHaveLength(3);
    expect(gearBodyFor(m.gearDrive, 'GE')!.multiplier).toBe(1);
    expect(m.gearDrive!.periodTurns).toBe(6);
  });
  it('keeps exact consistency checks across different gear pairs on the same two bodies', () => {
    const f = GEAR_PAIR,
      [a, b] = f.transmission.gears;
    const transmission = {
      gears: [
        a,
        b,
        { ...a, id: 'G3', teeth: 10, module: 0.2, plane: 1 },
        { ...b, id: 'G4', teeth: 20, module: 0.2, plane: 1 },
      ],
      meshes: [
        ...f.transmission.meshes,
        { id: 'GM2', gearAId: 'G3', gearBId: 'G4', kind: 'external' as const },
      ],
    };
    const valid = buildMechanism({ ...f, transmission }).mechanism;
    expect(valid.isMechanismValid(), valid.failure).toBe(true);
    expect(valid.dof).toBe(1);
    const { joints, links } = buildMechanism({ ...f, transmission: undefined });
    const locking = compileGearDrive(
      {
        ...transmission,
        gears: transmission.gears.map((g, i) => (i < 2 ? g : { ...g, teeth: 20, module: 0.15 })),
      },
      joints,
      links
    );
    expect(locking.ok).toBe(false);
    if (!locking.ok) expect(locking.diagnostics.some((d) => d.code === 'locking-cycle')).toBe(true);
  });
  it('does not treat coincident independent hosts as a compound shaft', () => {
    const f = gearNetworkFixture(
      [
        { center: [0, 0], teeth: 20 },
        { center: [0, 0], teeth: 10 },
      ],
      []
    );
    const m = buildMechanism(f).mechanism;
    expect(m.isMechanismValid()).toBe(false);
    expect(m.gearDiagnostics.some((d) => d.code === 'unreachable')).toBe(true);
  });
  for (const direction of [-1, 1]) {
    it(`drives a complete ordinary four-bar with direction ${direction}`, () => {
      const f = { ...COMPOUND_GEAR_FOUR_BAR, inputAngVel: direction * 2 * Math.PI };
      const m = buildMechanism(f).mechanism;
      expect(m.isMechanismValid(), m.failure).toBe(true);
      expect(m.dof).toBe(1);
      expect(m.usesCoupledPositionSolve).toBe(true);
      for (const step of [0, 147, 720, 1400, 2160]) {
        const actual = rates(m, step);
        const direct = buildMechanism({
          inputAngVel: (direction * Math.PI) / 3,
          joints: f.joints
            .filter((j) => 'EFGH'.includes(j.id))
            .map((j) => {
              const p = m.joints[step].find((p) => p.id === j.id)!;
              return { ...j, x: p.x, y: p.y, input: j.id === 'E' };
            }),
          links: f.links.filter((l) => ['EF', 'FG', 'GH'].includes(l.joints)),
        }).mechanism;
        expect(direct.isMechanismValid(), direct.failure).toBe(true);
        const expected = rates(direct, 0);
        for (const id of ['F', 'G'])
          for (const axis of [0, 1]) {
            expect(actual.v.get(id)![axis]).toBeCloseTo(expected.v.get(id)![axis], 8);
            expect(actual.a.get(id)![axis]).toBeCloseTo(expected.a.get(id)![axis], 8);
          }
        const motion = m.gearMotionAtSample(step)!;
        expect(motion.angles.get('GB')).toEqual(motion.angles.get('GC'));
        expect(actual.omega.get('EF')).toBeCloseTo((direction * Math.PI) / 3, 10);
      }
      const last = m.gearMotionAtSample(m.joints.length - 1)!.angles.get('GD')!;
      expect(last.angle - Math.PI / 3).toBeCloseTo(direction * 2 * Math.PI, 8);
    });
  }
});
