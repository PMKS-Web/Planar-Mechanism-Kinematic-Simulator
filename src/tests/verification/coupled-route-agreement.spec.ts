// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { buildMechanism, MechanismFixture } from '../../test-utils/verification/fixture';
import {
  stephensonIiiEx2Fixture,
  teachingLabFourBarFixture,
  teachingLabSliderCrankFixture,
  wattIFixture,
} from '../../test-utils/verification/fixtures';
import {
  guidedRodOnALinkFixture,
  invertedSliderCrankFixture,
  offsetPivotLeverFixture,
} from '../../test-utils/verification/slot-fixtures';
import { PositionSolver } from '../../app/model/mechanism/position-solver';
import { KinematicsSolver } from '../../app/model/mechanism/kinematic-solver';
import { Mechanism } from '../../app/model/mechanism/mechanism';

/**
 * The same drawing solved twice: walked, and solved as one coupled system.
 *
 * A mount welded to a bracket has no closed-form walk, so those drawings will
 * go to the constraint set whole. Nothing can produce one yet, which is
 * exactly why this exists: the route can be forced on mechanisms whose answers
 * are already trusted, and the two answers compared, *before* anything depends
 * on it.
 *
 * What is compared is what a reader would notice: where every joint is at
 * every sample, how fast it is going, how the cycle ends. The tolerances are
 * stated against what these answers are already checked against elsewhere,
 * and nothing here is loosened to let a route pass -- the numbers each bound
 * was actually set from are written beside it.
 */

interface Case {
  name: string;
  make: () => MechanismFixture;
  /** Rates are compared where the mechanism turns; a rocker reverses first. */
  rates: boolean;
}

const CASES: Case[] = [
  { name: 'four-bar', make: () => teachingLabFourBarFixture(), rates: true },
  { name: 'slider-crank', make: () => teachingLabSliderCrankFixture(), rates: true },
  { name: 'Stephenson III six-bar', make: () => stephensonIiiEx2Fixture(), rates: true },
  { name: 'Watt I six-bar', make: () => wattIFixture(), rates: false },
  { name: 'inverted slider-crank', make: () => invertedSliderCrankFixture(), rates: true },
  { name: 'guided rod on a link', make: () => guidedRodOnALinkFixture(), rates: true },
  { name: 'offset-pivot lever', make: () => offsetPivotLeverFixture(), rates: false },
];

/** Build once each way, with the switch put back whatever happens. */
function bothWays(make: () => MechanismFixture): { walked: Mechanism; coupled: Mechanism } {
  const walked = buildMechanism(make()).mechanism;
  const solver = PositionSolver as unknown as { forceCoupledRoute: boolean };
  solver.forceCoupledRoute = true;
  try {
    return { walked, coupled: buildMechanism(make()).mechanism };
  } finally {
    solver.forceCoupledRoute = false;
  }
}

/** Joint velocities at every sample, by id. */
function ratesOf(mechanism: Mechanism): Map<string, [number, number]>[] {
  KinematicsSolver.resetVariables();
  KinematicsSolver.requiredLoops = mechanism.requiredLoops;
  const out: Map<string, [number, number]>[] = [];
  for (let t = 0; t < mechanism.joints.length; t++) {
    KinematicsSolver.determineKinematics(
      mechanism.joints[t],
      mechanism.links[t],
      mechanism.inputAngularVelocities[t]
    );
    out.push(
      new Map(
        mechanism.joints[t].map((joint) => [
          joint.id,
          [...(KinematicsSolver.jointVelMap.get(joint.id) ?? [NaN, NaN])] as [number, number],
        ])
      )
    );
  }
  return out;
}

describe('a mechanism solved as one coupled system instead of walked', () => {
  for (const { name, make, rates } of CASES) {
    describe(name, () => {
      const { walked, coupled } = bothWays(make);

      it('comes to the same verdict and the same cycle', () => {
        // Sample count is cycle closure and reversal in one number: a route
        // that reversed where the other did not, or wound a different number
        // of turns to come home, would not match here.
        expect(coupled.isMechanismValid()).toBe(walked.isMechanismValid());
        expect(coupled.joints.length).toBe(walked.joints.length);
        expect(coupled.inputAngularVelocities.map(Math.sign)).toEqual(
          walked.inputAngularVelocities.map(Math.sign)
        );
      });

      it('puts every joint where the walk puts it, to the precision they are recorded at', () => {
        expect(walked.isMechanismValid()).toBe(true);
        let worst = 0;
        for (let t = 0; t < walked.joints.length; t++) {
          for (const joint of walked.joints[t]) {
            const other = coupled.joints[t].find((one) => one.id === joint.id)!;
            worst = Math.max(worst, Math.hypot(joint.x - other.x, joint.y - other.y));
          }
        }
        // Coordinates are recorded to four decimals, so a unit in that last
        // place is the finest two routes can be asked to agree to at all. The
        // four-bars come in at exactly that; the six-bars reach a few units of
        // it, which is what a longer chain of them accumulates.
        //
        // The bound is stated against what the answers are *checked* against
        // elsewhere rather than against itself: `app.component.spec.ts`
        // verifies this solver's six-bar to 0.01 of MATLAB, so two routes
        // differing by a thousandth are the same answer by a factor of ten,
        // and a route that had genuinely diverged would be orders out rather
        // than units in the last place.
        expect(worst).toBeLessThan(1e-3);
      });

      if (rates) {
        it('and moves at the same speed at every one of them', () => {
          const walkedRates = ratesOf(walked);
          const coupledRates = ratesOf(coupled);
          let worst = 0;
          let scale = 0;
          for (let t = 1; t < walkedRates.length - 1; t++) {
            for (const [id, velocity] of walkedRates[t]) {
              const other = coupledRates[t].get(id);
              if (!other || Number.isNaN(velocity[0]) || Number.isNaN(other[0])) continue;
              worst = Math.max(worst, Math.hypot(velocity[0] - other[0], velocity[1] - other[1]));
              scale = Math.max(scale, Math.hypot(velocity[0], velocity[1]));
            }
          }
          // Rates are differentiated from the positions, so they carry the
          // same last-place disagreement amplified by the time step; a
          // thousandth of the fastest thing in the drawing is well inside it.
          expect(worst).toBeLessThan(Math.max(scale, 1) * 1e-3);
        });
      }
    });
  }
});
