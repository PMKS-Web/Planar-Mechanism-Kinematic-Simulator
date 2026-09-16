// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Joint } from '../../app/model/joint';
import { KinematicsSolver } from '../../app/model/mechanism/kinematic-solver';
import { buildMechanism, BuiltMechanism } from '../../test-utils/verification/fixture';
import {
  ellipticalCrankFixture,
  scotchYokeFixture,
} from '../../test-utils/verification/slot-fixtures';

// `ground` means two different things, and the velocity analysis used to read
// only one of them. On a RevJoint it says the point is fixed in the world; on a
// PrisJoint it says only that the *guide* is fixed, and the joint itself is the
// block's coordinate traveling along that guide. The initializer seeds every
// grounded joint with zero rates, so a grounded guide was reported stationary.
//
// It used to be caught by comparing the guide against the pin welded through
// it -- the same point, drawn as two joints, reported moving at two different
// speeds. That comparison has no two sides any more: a slider is one joint
// (Stage 1 of `docs/joint-type-and-cylinder-plan.md`), so the block and the pin
// are the same object and cannot disagree. What is asked instead is the
// question the comparison was standing in for: the rates the solver reports for
// a grounded slider have to be ones it worked out, and they have to be what
// differentiating the joint's own drawn path gives.
//
// That is the failure worth a spec of its own: it is invisible. Nothing goes
// singular and no picture goes wrong, because the animation comes from the
// position solver and the force analysis already reads the rider. Only the
// velocity and acceleration a student is shown for the block are wrong, and
// they are wrong by being plausible -- zero is what a grounded thing does.
//
// Both solver routes are covered. The elliptical crank is settled by the
// simultaneous constraint set; the Scotch yoke by the loop matrix. They seeded
// the same zero for different reasons, so one fixture would not have caught it.

/** Every timestep, in an array indexed the way the fixture's frames are. */
interface Trace {
  velocity: [number, number][];
  acceleration: [number, number][];
}

function traceJoints(built: BuiltMechanism, ids: string[]): Map<string, Trace> {
  const traces = new Map<string, Trace>(ids.map((id) => [id, { velocity: [], acceleration: [] }]));
  KinematicsSolver.resetVariables();
  KinematicsSolver.requiredLoops = built.mechanism.requiredLoops;
  for (let step = 0; step < built.mechanism.joints.length; step++) {
    KinematicsSolver.determineKinematics(
      built.mechanism.joints[step],
      built.mechanism.links[step],
      built.mechanism.inputAngularVelocities[step]
    );
    for (const id of ids) {
      traces.get(id)!.velocity.push(KinematicsSolver.jointVelMap.get(id) ?? [NaN, NaN]);
      traces.get(id)!.acceleration.push(KinematicsSolver.jointAccMap.get(id) ?? [NaN, NaN]);
    }
  }
  return traces;
}

// The joint that slides, which is the block and the pin it carries at once.
const CASES = [
  { name: 'the elliptical crank', build: ellipticalCrankFixture, slider: 'E' },
  { name: 'a Scotch yoke', build: scotchYokeFixture, slider: 'C' },
] as const;

describe('a block on a grounded guide', () => {
  for (const { name, build, slider } of CASES) {
    const built = buildMechanism(build());
    const traces = traceJoints(built, [slider]);
    const steps = built.mechanism.joints.length;

    it(`is not held still by its own guide, in ${name}`, () => {
      // The seed is the failure. Every sample has to carry a rate the solver
      // worked out rather than the zero it started from, so a grounded slider
      // the initializer never revisited shows up here as an absent entry --
      // `traceJoints` records a missing joint as NaN precisely so that a rate
      // nobody wrote reads as a failure rather than as a plausible number.
      const rows = traces.get(slider)!;
      for (let step = 0; step < steps; step++) {
        for (const axis of [0, 1]) {
          expect(
            Number.isFinite(rows.velocity[step][axis]),
            `${slider} v[${axis}] at step ${step}`
          ).toBe(true);
          expect(
            Number.isFinite(rows.acceleration[step][axis]),
            `${slider} a[${axis}] at step ${step}`
          ).toBe(true);
        }
      }
    });

    it(`has something to report in the first place, in ${name}`, () => {
      // Without this the file passes on a solver that answers zero everywhere,
      // which is the defect itself: zero is what a grounded thing does, so it
      // reads as an answer rather than as the absence of one.
      const rows = traces.get(slider)!;
      const largest = (samples: [number, number][]) =>
        Math.max(...samples.map(([x, y]) => Math.hypot(x, y)));
      expect(largest(rows.velocity), `${slider} peak speed`).toBeGreaterThan(0.1);
      expect(largest(rows.acceleration), `${slider} peak acceleration`).toBeGreaterThan(0.1);
    });

    it(`reports a speed its own positions confirm, in ${name}`, () => {
      // Anchored outside the solver: differentiate the positions the mechanism
      // was actually drawn at. Everything above would hold just as well on a
      // solver that was wrong consistently -- it says the joint was given a
      // number and that the number is not zero, not that it is the right one.
      //
      // The tolerance is proportional with a floor rather than a fixed number
      // of decimals, because a central difference over one degree of crank has
      // two error sources that scale differently. Curvature costs a fraction of
      // the speed -- E accelerates fourfold over ten samples here -- while the
      // four decimals the solved coordinates are kept to cost a fixed amount of
      // travel, which only matters where the joint has nearly stopped. Both
      // terms are still small enough that a block reported stationary, the
      // defect this file exists for, misses by two orders of magnitude.
      const frames = built.mechanism.joints;
      const times = built.mechanism.timeNum;
      const at = (step: number): Joint => frames[step].find((j) => j.id === slider)!;
      const rows = traces.get(slider)!;
      for (let step = 1; step < frames.length - 1; step++) {
        const span = times[step + 1] - times[step - 1];
        const measured = [
          (at(step + 1).x - at(step - 1).x) / span,
          (at(step + 1).y - at(step - 1).y) / span,
        ];
        const tolerance = 0.02 * Math.hypot(...rows.velocity[step]) + 0.01;
        for (const axis of [0, 1]) {
          expect(
            Math.abs(rows.velocity[step][axis] - measured[axis]),
            `${slider} v[${axis}] vs finite difference at step ${step}`
          ).toBeLessThan(tolerance);
        }
      }
    });
  }
});
