import { buildMechanism, MechanismFixture } from '../../../test-utils/verification/fixture';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import {
  structuralCrankFixture,
  structuralDynamicCrankFixture,
  structuralToggleFixture,
} from '../../../test-utils/verification/structural-fixtures';
import {
  teachingLabFourBarFixture,
  teachingLabSliderCrankFixture,
  stephensonIiiEx2Fixture,
  equalSidedFourBarFixture,
} from '../../../test-utils/verification/fixtures';
import { bellCrankFixture } from '../../../test-utils/verification/workshop-fixtures';
import { motionGenGripperFixture } from '../../../test-utils/verification/slot-fixtures';
import {
  memberAB,
  uniformAB,
  noMemberLoad,
} from '../../../test-utils/verification/member-verification';
import { RealLink } from '../link';
import { LengthUnit } from '../unit-enums';
import { MODEL_SCALE } from '../render-scale';
import { siUnitFactorsForLength } from '../unit-conversions';
import { snapshotPmksMemberMotion } from '../structural/pmks-dynamic-state';
import { analyzeDynamic } from '../structural/dynamic-force-solver';
import { recoverDynamicMemberLoads } from '../structural/member-load-recovery';
import { Mechanism } from './mechanism';
import { PositionSolver } from './position-solver';

// Existing published fixtures, parameterized by units/size, not new mechanisms.
const phase = process.env['PMKS_PRECISION_PHASE'];
const before = phase === 'before';
const baselinePath = 'artifacts/s45-precision-before.json';
type Point = { x: number; y: number };
const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

/** All pin pairs, including compound leaves, plus independent CoM distances. */
function geometry(mechanism: Mechanism) {
  let lengthDrift = 0,
    comTransportDrift = 0,
    coincidence = 0;
  const flatten = (links: RealLink[]): RealLink[] =>
    links.flatMap((link) => [
      link,
      ...flatten(link.subset.filter((l): l is RealLink => l instanceof RealLink)),
    ]);
  const roots = (i: number) =>
    flatten(mechanism.links[i].filter((l): l is RealLink => l instanceof RealLink));
  const reference = roots(0);
  for (let i = 0; i < mechanism.joints.length; i++) {
    const joints = new Map(mechanism.joints[i].map((j) => [j.id, j]));
    roots(i).forEach((link, index) => {
      const initial = reference[index];
      expect(link.mass).toBe(initial.mass);
      expect(link.massMoI).toBe(initial.massMoI);
      link.joints.forEach((a, ai) => {
        coincidence = Math.max(coincidence, distance(a, joints.get(a.id)!));
        comTransportDrift = Math.max(
          comTransportDrift,
          Math.abs(distance(a, link.CoM) - distance(initial.joints[ai], initial.CoM))
        );
        link.joints.slice(ai + 1).forEach((b, bi) => {
          lengthDrift = Math.max(
            lengthDrift,
            Math.abs(distance(a, b) - distance(initial.joints[ai], initial.joints[ai + bi + 1]))
          );
        });
      });
    });
  }
  // Pin-linked loops close when their distance constraints hold and shared pins
  // coincide. This is a constraint residual, not a tautological vector sum.
  return {
    lengthDrift,
    comTransportDrift,
    coincidence,
    loopClosureResidual: Math.max(lengthDrift, coincidence),
  };
}

function uniformCrank(
  unit: LengthUnit,
  space: 'project' | 'model',
  size: number
): MechanismFixture {
  const fixture = structuralCrankFixture();
  const factors = siUnitFactorsForLength(unit);
  const scale = (size * (space === 'model' ? MODEL_SCALE : 1)) / factors.distanceToM;
  fixture.load = undefined;
  fixture.inputAngVel = 2;
  fixture.joints.forEach((j) => {
    j.x *= scale;
    j.y *= scale;
  });
  fixture.links[0] = {
    ...fixture.links[0],
    mass: 2 / factors.massToKg,
    moi: ((2 / 3) * size ** 2) / factors.inertiaToKgM2,
    com: [scale, 0],
  };
  return fixture;
}

function measureCycle(unit: LengthUnit, space: 'project' | 'model', size: number) {
  const mechanism = buildMechanism(uniformCrank(unit, space, size)).mechanism;
  let accepted = 0,
    lengthDriftM = 0,
    midpointErrorM = 0,
    inertiaErrorKgM2 = 0;
  let maxCoordinateErrorM = 0,
    closureResidual = 0;
  let sample30 = { midpointErrorM: 0, inertiaErrorKgM2: 0 };
  const statuses: Record<string, number> = {};
  for (let sampleIndex = 0; sampleIndex < mechanism.joints.length; sampleIndex++) {
    const snap = snapshotPmksMemberMotion({
      mechanism,
      sampleIndex,
      lengthUnit: unit,
      coordinateSpace: space,
    });
    if (snap.status !== 'ok') throw new Error(snap.message);
    const [a, b] = snap.configuration.joints.map((j) => j.positionM);
    const mass = snap.configuration.bodies[0].massProperties!;
    const length = distance(a, b);
    const midpointError = distance(mass.centerOfMassM, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const inertiaError = Math.abs(mass.inertiaKgM2 - (mass.massKg * length ** 2) / 12);
    lengthDriftM = Math.max(lengthDriftM, Math.abs(length - 2 * size));
    midpointErrorM = Math.max(midpointErrorM, midpointError);
    inertiaErrorKgM2 = Math.max(inertiaErrorKgM2, inertiaError);
    const angle = mechanism.timeNum[sampleIndex] * 2;
    maxCoordinateErrorM = Math.max(
      maxCoordinateErrorM,
      distance(b, { x: 2 * size * Math.cos(angle), y: 2 * size * Math.sin(angle) })
    );
    if (sampleIndex === 30)
      sample30 = { midpointErrorM: midpointError, inertiaErrorKgM2: inertiaError };
    const eq = analyzeDynamic(snap.configuration, snap.states, noMemberLoad);
    const recovered = recoverDynamicMemberLoads(
      snap.configuration,
      memberAB,
      noMemberLoad,
      eq,
      snap.states[0],
      { massDistribution: uniformAB }
    );
    statuses[recovered.status] = (statuses[recovered.status] ?? 0) + 1;
    if (recovered.status === 'ok') {
      accepted++;
      closureResidual = Math.max(closureResidual, recovered.diagnostics.normalizedClosureResidual);
    }
  }
  return {
    unit,
    space,
    size,
    samples: mechanism.joints.length,
    accepted,
    statuses,
    lengthDriftM,
    midpointErrorM,
    inertiaErrorKgM2,
    maxCoordinateErrorM,
    closureResidual,
    sample30,
  };
}

const motionFixtures = {
  crank: structuralCrankFixture,
  fourBar: teachingLabFourBarFixture,
  sixBar: stephensonIiiEx2Fixture,
  compound: bellCrankFixture,
  eccentricDynamic: structuralDynamicCrankFixture,
  slider: teachingLabSliderCrankFixture,
  motionGen: () => motionGenGripperFixture(MODEL_SCALE),
  toggle: equalSidedFourBarFixture,
};
function motionReport() {
  return Object.entries(motionFixtures).map(([name, fixture]) => {
    const mechanism = buildMechanism(fixture()).mechanism;
    const positions = mechanism.joints.map((frame) => frame.map((j) => [j.x, j.y]));
    return {
      name,
      samples: positions.length,
      positions,
      times: mechanism.timeNum,
      jointIds: mechanism.joints[0].map((j) => j.id),
      ...geometry(mechanism),
    };
  });
}

describe('solved geometry precision', () => {
  it('preserves unquantized reference pivots and angular continuation at coincident pivots', () => {
    const fixture = structuralCrankFixture();
    fixture.load = undefined;
    for (const joint of fixture.joints) {
      joint.x += 1.23456789;
      joint.y += 0.987654321;
    }
    fixture.links[0].com = [2.23456789, 0.987654321];
    const mechanism = buildMechanism(fixture).mechanism;
    if (!before) {
      for (const frame of mechanism.joints) {
        expect(frame[0].x).toBe(fixture.joints[0].x);
        expect(frame[0].y).toBe(fixture.joints[0].y);
      }
      expect(geometry(mechanism).lengthDrift).toBeLessThan(1e-12);
    }
    for (const scale of [1, MODEL_SCALE]) {
      const square = equalSidedFourBarFixture();
      square.joints.forEach((joint) => {
        joint.x *= scale;
        joint.y *= scale;
      });
      const solved = buildMechanism(square).mechanism;
      expect(solved.joints.length).toBe(361);
      if (!before)
        for (const [a, b, c, d] of solved.joints) {
          expect(Math.hypot(c.x - b.x - (d.x - a.x), c.y - b.y - (d.y - a.y)) / scale).toBeLessThan(
            1e-10
          );
        }
    }
  });
  it('retains rigid geometry and exact analytical crank motion across units, spaces and sizes', () => {
    const cycles = [];
    for (const unit of [LengthUnit.METER, LengthUnit.CM, LengthUnit.INCH])
      for (const space of ['project', 'model'] as const)
        for (const size of [0.01, 1, 100]) {
          const cycle = measureCycle(unit, space, size);
          cycles.push(cycle);
          expect(cycle.samples).toBe(361);
          if (!before) {
            expect(cycle.accepted, JSON.stringify(cycle)).toBe(cycle.samples);
            expect(cycle.lengthDriftM / size).toBeLessThan(2e-12);
            expect(cycle.midpointErrorM / size).toBeLessThan(1e-12);
            expect(cycle.inertiaErrorKgM2 / size ** 2).toBeLessThan(2e-12);
            expect(cycle.maxCoordinateErrorM / size).toBeLessThan(2e-12);
            expect(cycle.closureResidual).toBeLessThan(1e-10);
          }
        }
    const motion = motionReport();
    if (!before) {
      expect(motion.map((row) => row.samples)).toEqual([361, 361, 199, 361, 361, 361, 1, 361]);
      for (const row of motion) {
        expect(row.lengthDrift, row.name).toBeLessThan(1e-10);
        expect(row.comTransportDrift, row.name).toBeLessThan(1e-10);
        expect(row.coincidence, row.name).toBe(0);
        expect(
          row.times.every((time, i) => i === 0 || time > row.times[i - 1]),
          row.name
        ).toBe(true);
      }
    }
    if (phase)
      writeFileSync(
        `artifacts/s45-precision-${phase}.json`,
        JSON.stringify({ cycles, motion }, null, 2) + '\n'
      );
      if (phase === 'after' && existsSync(baselinePath)) {
      const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as {
        motion: ReturnType<typeof motionReport>;
      };
      const comparison = motion.map((now, index) => {
        const old = baseline.motion[index];
        expect(now.jointIds).toEqual(old.jointIds);
        expect(now.times, now.name).toEqual(old.times);
        expect(now.samples, now.name).toBe(old.samples);
        let maxCoordinateDifference = 0;
        now.positions.slice(0, old.samples).forEach((frame, i) =>
          frame.forEach((p, j) => {
            maxCoordinateDifference = Math.max(
              maxCoordinateDifference,
              Math.hypot(p[0] - old.positions[i][j][0], p[1] - old.positions[i][j][1])
            );
          })
        );
        expect(maxCoordinateDifference, now.name).toBeLessThan(0.004);
        return {
          name: now.name,
          beforeSamples: old.samples,
          afterSamples: now.samples,
          sameTimes: JSON.stringify(now.times) === JSON.stringify(old.times),
          maxCoordinateDifference,
          beforeLengthDrift: old.lengthDrift,
          afterLengthDrift: now.lengthDrift,
          beforeLoopClosure: old.loopClosureResidual,
          afterLoopClosure: now.loopClosureResidual,
          beforeComTransport: old.comTransportDrift,
          afterComTransport: now.comTransportDrift,
        };
      });
      if (phase)
        writeFileSync(
          'artifacts/s45-motion-comparison.json',
          JSON.stringify(comparison, null, 2) + '\n'
        );
    }
  }, 120000);

  it('is deterministic, preserves authored input, and retains genuinely inconsistent mass refusals', () => {
    const fixture = structuralDynamicCrankFixture();
    const original = structuredClone(fixture);
    const built = buildMechanism(fixture);
    const repeat = buildMechanism(fixture).mechanism;
    expect(fixture).toEqual(original);
    expect(built.joints.map((j) => [j.x, j.y])).toEqual(fixture.joints.map((j) => [j.x, j.y]));
    expect(repeat.joints.map((frame) => frame.map((j) => [j.x, j.y]))).toEqual(
      built.mechanism.joints.map((frame) => frame.map((j) => [j.x, j.y]))
    );
    expect(repeat.timeNum).toEqual(built.mechanism.timeNum);
    const metrics = geometry(repeat);
    if (!before) expect(metrics.comTransportDrift).toBeLessThan(1e-12);
    const snap = snapshotPmksMemberMotion({
      mechanism: repeat,
      sampleIndex: 30,
      lengthUnit: LengthUnit.METER,
      coordinateSpace: 'project',
    });
    if (snap.status !== 'ok') throw new Error(snap.message);
    const eq = analyzeDynamic(snap.configuration, snap.states, noMemberLoad);
    expect(
      recoverDynamicMemberLoads(snap.configuration, memberAB, noMemberLoad, eq, snap.states[0], {
        massDistribution: uniformAB,
      }).status
    ).toBe('mass-distribution-mismatch');
    const singular = snapshotPmksMemberMotion({
      mechanism: buildMechanism(structuralToggleFixture()).mechanism,
      sampleIndex: 0,
      lengthUnit: LengthUnit.METER,
      coordinateSpace: 'project',
    });
    if (singular.status === 'ok')
      expect(analyzeDynamic(singular.configuration, singular.states, noMemberLoad).status).not.toBe(
        'ok'
      );
  });

  it('measures sample generation and analytical/structural snapshots separately', () => {
    const built = buildMechanism(structuralCrankFixture());
    const sample = {
      mechanism: built.mechanism,
      sampleIndex: 0,
      lengthUnit: LengthUnit.METER,
      coordinateSpace: 'project' as const,
    };
    const snap = snapshotPmksMemberMotion(sample);
    if (snap.status !== 'ok') throw new Error(snap.message);
    const eq = analyzeDynamic(snap.configuration, snap.states, noMemberLoad);
    built.mechanism.prepareSolvers();
    PositionSolver.setUpInitialJointLocations(built.mechanism.joints[0]);
    const initialPose = PositionSolver.capturePose();
    const operations = {
      positionStep: () => {
        PositionSolver.restorePose(initialPose);
        return PositionSolver.determinePositionAnalysis(
          built.mechanism.joints[0],
          built.mechanism.links[0],
          built.mechanism.forces[0],
          true
        );
      },
      solveAndGenerateCrank: () => buildMechanism(structuralCrankFixture()),
      solveAndGenerateSixBar: () => buildMechanism(stephensonIiiEx2Fixture()),
      kinematicSnapshot: () => built.mechanism.snapshotAccelerations(30),
      structuralSnapshot: () => snapshotPmksMemberMotion({ ...sample, sampleIndex: 30 }),
      dynamicEquilibrium: () => analyzeDynamic(snap.configuration, snap.states, noMemberLoad),
      memberRecovery: () =>
        recoverDynamicMemberLoads(snap.configuration, memberAB, noMemberLoad, eq, snap.states[0], {
          massDistribution: uniformAB,
        }),
    };
    const timing = Object.entries(operations).map(([operation, run]) => {
      for (let i = 0; i < 5; i++) run();
      const batches = Array.from({ length: 7 }, () => {
        const start = performance.now();
        for (let i = 0; i < 20; i++) run();
        return (performance.now() - start) / 20;
      }).sort((a, b) => a - b);
      return { operation, medianMs: batches[3], minMs: batches[0], maxMs: batches[6] };
    });
    if (phase)
      writeFileSync(`artifacts/s45-timing-${phase}.json`, JSON.stringify(timing, null, 2) + '\n');
    expect(timing.every((item) => Number.isFinite(item.medianMs))).toBe(true);
  }, 120000);
});
