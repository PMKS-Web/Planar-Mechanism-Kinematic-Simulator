import { buildMechanism } from '../../test-utils/verification/fixture';
import {
  GEAR_PAIR,
  GEAR_FOUR_BAR,
  GEAR_FIVE_TURNS,
  DIRECT_GEAR_FOUR_BAR,
  gearNetworkFixture,
} from '../../test-utils/verification/gear-fixtures';
import { PositionSolver } from '../../app/model/mechanism/position-solver';
import { KinematicsSolver } from '../../app/model/mechanism/kinematic-solver';
import { Mechanism } from '../../app/model/mechanism/mechanism';
import { partitionMechanisms } from '../../app/model/mechanism/mechanism-partition';
import { RealJoint } from '../../app/model/joint';
import { compileGearDrive } from '../../app/model/mechanism/gear-drive';
import { ForceSolver } from '../../app/model/mechanism/force-solver';
import { driveProfileOf } from '../../app/model/mechanism/drive-profile';

function rates(mechanism: Mechanism, index: number) {
  mechanism.prepareSolvers();
  KinematicsSolver.resetVariables();
  KinematicsSolver.requiredLoops = mechanism.requiredLoops;
  KinematicsSolver.determineKinematics(
    mechanism.joints[index],
    mechanism.links[index],
    mechanism.inputAngularVelocities[index]
  );
  return {
    velocity: new Map(KinematicsSolver.jointVelMap),
    acceleration: new Map(KinematicsSolver.jointAccMap),
    omega: new Map(KinematicsSolver.linkAngVelMap),
    alpha: new Map(KinematicsSolver.linkAngAccMap),
  };
}

describe('geared mechanism architecture gate', () => {
  it('measures a redundant even mesh cycle as one freedom and bounds a speed-up train', () => {
    const square = gearNetworkFixture(
      [
        { center: [0, 0], teeth: 20 },
        { center: [2, 0], teeth: 20 },
        { center: [2, 2], teeth: 20 },
        { center: [0, 2], teeth: 20 },
      ],
      [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 0],
      ]
    );
    const redundant = buildMechanism(square).mechanism;
    expect(redundant.isMechanismValid(), redundant.failure).toBe(true);
    expect(redundant.dof).toBe(1);
    const faster = gearNetworkFixture(
      [
        { center: [0, 0], teeth: 40 },
        { center: [3, 0], teeth: 20 },
      ],
      [[0, 1]]
    );
    const speedUp = buildMechanism(faster).mechanism;
    expect(speedUp.isMechanismValid()).toBe(true);
    expect(speedUp.joints.length).toBe(721);
    expect(speedUp.gearDrive!.step).toBeCloseTo(Math.PI / 360, 12);
    expect(speedUp.gearTravel.at(-1)).toBeCloseTo(2 * Math.PI, 10);
  });
  it('refuses two independent inputs before any reconciliation and isolates an unrelated partition', () => {
    const twoInputs = {
      ...GEAR_PAIR,
      joints: GEAR_PAIR.joints.map((joint) => ({
        ...joint,
        input: joint.id === 'A' || joint.id === 'C',
      })),
    };
    const invalid = buildMechanism(twoInputs).mechanism;
    expect(invalid.isMechanismValid()).toBe(false);
    expect(invalid.gearDiagnostics[0].code).toBe('input');
    const mixed = buildMechanism({
      ...GEAR_PAIR,
      joints: [
        ...GEAR_PAIR.joints,
        { id: 'X', x: 8, y: 0, ground: true, input: true },
        { id: 'Y', x: 9, y: 0 },
      ],
      links: [...GEAR_PAIR.links, { joints: 'XY' }],
      transmission: undefined,
    });
    const partitions = partitionMechanisms(
      mixed.joints,
      mixed.links,
      [],
      GEAR_PAIR.transmission
    ).mechanisms;
    expect(partitions.length).toBe(2);
    expect(partitions.filter((partition) => partition.transmission).length).toBe(1);
    for (const partition of partitions) {
      const mechanism = new Mechanism(
        partition.joints,
        partition.links,
        [],
        [],
        false,
        'm',
        2 * Math.PI,
        'degree',
        new Set(partition.ownJoints.map((joint) => joint.id)),
        partition.transmission
      );
      expect(mechanism.isMechanismValid()).toBe(true);
    }
  });
  for (const direction of [-1, 1]) {
    it(`solves an all-prescribed pair with direction ${direction}`, () => {
      const { mechanism } = buildMechanism({ ...GEAR_PAIR, inputAngVel: direction * 2 * Math.PI });
      expect(mechanism.gearDiagnostics).toEqual([]);
      expect(mechanism.isMechanismValid(), mechanism.failure).toBe(true);
      expect(mechanism.dof).toBe(1);
      expect(mechanism.joints.length).toBe(721);
      expect(mechanism.cyclePeriod).toBeCloseTo(2, 10);
      expect(mechanism.gearTravel.at(-1)).toBeCloseTo(direction * 4 * Math.PI, 10);
      for (const index of [0, 360, 17, 720, 101]) {
        const state = rates(mechanism, index);
        const q = mechanism.gearTravel[index];
        const d = mechanism.joints[index].find((joint) => joint.id === 'D')!;
        const theta = Math.PI / 3 - q / 2;
        expect(d.x).toBeCloseTo(Math.cos(theta), 10);
        expect(d.y).toBeCloseTo(Math.sin(theta), 10);
        expect(state.omega.get('CD')).toBeCloseTo(-direction * Math.PI, 10);
        expect(state.alpha.get('CD')).toBeCloseTo(0, 10);
        expect(state.velocity.get('D')![0]).toBeCloseTo(direction * Math.PI * d.y, 10);
        expect(state.acceleration.get('D')![0]).toBeCloseTo(-(Math.PI ** 2) * d.x, 10);
      }
    });
  }
  it('solves a five-turn pair beyond the ordinary three-turn limit', () => {
    const { mechanism } = buildMechanism(GEAR_FIVE_TURNS);
    expect(mechanism.isMechanismValid(), mechanism.failure).toBe(true);
    expect(mechanism.joints.length).toBe(1801);
    expect(mechanism.cyclePeriod).toBeCloseTo(5, 10);
  });
  it('joins mesh-connected bodies into one partition without adding input flags', () => {
    const built = buildMechanism(GEAR_FOUR_BAR);
    const split = partitionMechanisms(built.joints, built.links, [], GEAR_FOUR_BAR.transmission);
    expect(split.mechanisms.length).toBe(1);
    expect(split.mechanisms[0].transmission?.meshes.length).toBe(1);
    expect(built.joints.filter((joint) => joint instanceof RealJoint && joint.input).length).toBe(
      1
    );
  });
  for (const direction of [-1, 1]) {
    it(`solves the closed four-bar with direction ${direction} and agrees with its ordinary drive`, () => {
      const { mechanism } = buildMechanism({
        ...GEAR_FOUR_BAR,
        inputAngVel: direction * 2 * Math.PI,
      });
      expect(mechanism.isMechanismValid(), mechanism.failure).toBe(true);
      expect(mechanism.dof).toBe(1);
      expect(mechanism.usesCoupledPositionSolve).toBe(true);
      expect(mechanism.joints.length).toBe(721);
      const direct = buildMechanism({
        ...DIRECT_GEAR_FOUR_BAR,
        inputAngVel: -direction * Math.PI,
      }).mechanism;
      expect(direct.isMechanismValid()).toBe(true);
      for (const index of [0, 90, 720, 360, 18, 600]) {
        const actual = rates(mechanism, index);
        // Compare derivative formulations at identical geometry. The legacy
        // geometric walk rounds each step, so its accumulated phase is not an
        // exact reference for the new continuous gear coordinate.
        const directAtPose = buildMechanism({
          ...DIRECT_GEAR_FOUR_BAR,
          inputAngVel: -direction * Math.PI,
          joints: DIRECT_GEAR_FOUR_BAR.joints.map((joint) => {
            const posed = mechanism.joints[index].find((point) => point.id === joint.id)!;
            return { ...joint, x: posed.x, y: posed.y };
          }),
        }).mechanism;
        const expected = rates(directAtPose, 0);
        for (const joint of direct.joints[index / 2]) {
          const geared = mechanism.joints[index].find((point) => point.id === joint.id)!;
          expect(geared.x).toBeCloseTo(joint.x, 2);
          expect(geared.y).toBeCloseTo(joint.y, 2);
          for (const coordinate of [0, 1]) {
            expect(actual.velocity.get(joint.id)![coordinate]).toBeCloseTo(
              expected.velocity.get(joint.id)![coordinate],
              8
            );
            expect(actual.acceleration.get(joint.id)![coordinate]).toBeCloseTo(
              expected.acceleration.get(joint.id)![coordinate],
              8
            );
          }
        }
        for (const id of ['CD', 'DE', 'EF']) {
          expect(actual.omega.get(id)).toBeCloseTo(expected.omega.get(id)!, 8);
          expect(actual.alpha.get(id)).toBeCloseTo(expected.alpha.get(id)!, 8);
        }
      }
    });
  }
  it('preserves every bar and its differentiated constraints throughout the complete four-bar cycle', () => {
    const mechanism = buildMechanism(GEAR_FOUR_BAR).mechanism;
    let maximumGap = 0;
    for (let index = 0; index < mechanism.joints.length; index++) {
      const state = rates(mechanism, index);
      for (const link of mechanism.links[index]) {
        const [a, b] = link.joints;
        const [startA, startB] = mechanism.links[0].find(
          (original) => original.id === link.id
        )!.joints;
        const r = [b.x - a.x, b.y - a.y];
        const v = [0, 1].map((k) => state.velocity.get(b.id)![k] - state.velocity.get(a.id)![k]);
        const acc = [0, 1].map(
          (k) => state.acceleration.get(b.id)![k] - state.acceleration.get(a.id)![k]
        );
        maximumGap = Math.max(
          maximumGap,
          Math.abs(Math.hypot(...r) - Math.hypot(startB.x - startA.x, startB.y - startA.y))
        );
        expect(r[0] * v[0] + r[1] * v[1]).toBeCloseTo(0, 7);
        expect(r[0] * acc[0] + r[1] * acc[1] + v[0] ** 2 + v[1] ** 2).toBeCloseTo(0, 6);
      }
      const [c, d, e, f] = ['C', 'D', 'E', 'F'].map((id) =>
        mechanism.joints[index].find((joint) => joint.id === id)!
      );
      expect((f.x - d.x) * (e.y - d.y) - (f.y - d.y) * (e.x - d.x)).toBeGreaterThan(0);
      expect(Math.hypot(d.x - c.x, d.y - c.y)).toBeCloseTo(1, 10);
      if (index > 0) {
        const previous = mechanism.joints[index - 1].find((joint) => joint.id === 'E')!;
        expect(Math.hypot(e.x - previous.x, e.y - previous.y)).toBeLessThan(0.04);
      }
    }
    // The existing nonlinear kernel converges to a 1e-6 length residual.
    expect(maximumGap).toBeLessThan(1e-6);
  });
  it('checks velocity and acceleration against refined centered finite differences', () => {
    const mechanism = buildMechanism(GEAR_FOUR_BAR).mechanism;
    const index = 123;
    const actual = rates(mechanism, index);
    const errors = [2, 1].map((step) => {
      const point = (i: number) => mechanism.joints[i].find((joint) => joint.id === 'E')!;
      const a = point(index - step),
        b = point(index),
        c = point(index + step);
      const dt = mechanism.timeNum[index + step] - mechanism.timeNum[index];
      return [
        Math.abs((c.x - a.x) / (2 * dt) - actual.velocity.get('E')![0]),
        Math.abs((c.x - 2 * b.x + a.x) / dt ** 2 - actual.acceleration.get('E')![0]),
      ];
    });
    expect(errors[1][0]).toBeLessThan(errors[0][0] * 0.3);
    expect(errors[1][1]).toBeLessThan(errors[0][1] * 0.3);
    expect(errors[1][0]).toBeLessThan(0.001);
    expect(errors[1][1]).toBeLessThan(0.01);
  });
  it('rejects a rigid bar between incompatible prescribed pins and rolls back q and every position', () => {
    const contradiction = { ...GEAR_PAIR, links: [...GEAR_PAIR.links, { joints: 'BD' }] };
    const built = buildMechanism({ ...contradiction, transmission: undefined });
    expect(buildMechanism(contradiction).mechanism.isMechanismValid()).toBe(false);
    const compiled = compileGearDrive(GEAR_PAIR.transmission, built.joints, built.links);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    PositionSolver.resetStaticVariables();
    PositionSolver.gearDrive = compiled.drive;
    PositionSolver.determineJointOrder(built.joints, built.links);
    const before = PositionSolver.capturePose();
    expect(PositionSolver.determinePositionAnalysis(built.joints, built.links, [], true)).toBe(
      false
    );
    expect(PositionSolver.capturePose()).toEqual(before);
    expect(PositionSolver.gearTravel).toBe(0);
  });
  it('restores gear snapshots after another machine and leaves reversal positions anchored', () => {
    const pair = buildMechanism(GEAR_PAIR).mechanism;
    const fourBar = buildMechanism(GEAR_FOUR_BAR).mechanism;
    const before = rates(pair, 271);
    rates(fourBar, 514);
    expect(rates(pair, 271)).toEqual(before);
    const reversed = pair.withReversedDrive()!;
    const after = rates(reversed, 271);
    expect(after.omega.get('CD')).toBeCloseTo(-before.omega.get('CD')!, 12);
    expect(after.acceleration).toEqual(before.acceleration);
    expect(driveProfileOf(pair)!.span).toBeCloseTo(4 * Math.PI, 10);
    expect(driveProfileOf(reversed)!.along).toEqual(driveProfileOf(pair)!.along);
  });
  it('refuses geared force analysis through mechanism and explicit low-level context', () => {
    const mechanism = buildMechanism(GEAR_PAIR).mechanism;
    for (const mode of ['static', 'dynamic'] as const) {
      expect(mechanism.getForceAnalysis(mode).successfulFrames).toBe(0);
      const result = ForceSolver.analyzeFrame(
        mechanism.joints[0],
        mechanism.links[0],
        mode,
        false,
        'm',
        0,
        undefined,
        false,
        false,
        mechanism.transmission
      );
      expect(result.status).toBe('unsupported-topology');
      expect(result.message).toContain('gears');
    }
  });
});
