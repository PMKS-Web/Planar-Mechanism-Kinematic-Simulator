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
 * go to the constraint set whole -- positions *and* rates, since the loop
 * formulation cannot express their shape any better than the walk can place
 * it. Nothing can produce one yet, which is exactly why this exists: both
 * routes can be forced on mechanisms whose answers are already trusted, and
 * the two compared, *before* anything depends on it.
 *
 * What is compared is what a reader would notice: where every joint is at
 * every sample, how fast it is going, how hard it is accelerating, how the
 * cycle ends. The tolerances are stated against what these answers are already
 * checked against elsewhere, and nothing here is loosened to let a route pass
 * -- the numbers each bound was actually set from are written beside it.
 *
 * The order matters and is not incidental. `PositionSolver`'s record of how it
 * solved a mechanism is static and belongs to whichever one was built last, so
 * each mechanism is measured *while it is still the one the solver is
 * describing*. Built both and then measured both, the walked mechanism's rates
 * would come back out of the coupled route as well -- and the comparison would
 * be of one answer with itself.
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

const solver = PositionSolver as unknown as {
  forceCoupledRoute: boolean;
  coupledRoute: boolean;
  jointNumOrderSolverMap: Map<number, string[]>;
  desiredAnalysisJointMap: Map<string, string>;
};

/** Joint rates at every sample, by id. */
type Rates = { velocity: [number, number]; acceleration: [number, number] };
function ratesOf(mechanism: Mechanism): Map<string, Rates>[] {
  KinematicsSolver.resetVariables();
  KinematicsSolver.requiredLoops = mechanism.requiredLoops;
  const out: Map<string, Rates>[] = [];
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
          {
            velocity: [...(KinematicsSolver.jointVelMap.get(joint.id) ?? [NaN, NaN])] as [
              number,
              number,
            ],
            acceleration: [...(KinematicsSolver.jointAccMap.get(joint.id) ?? [NaN, NaN])] as [
              number,
              number,
            ],
          },
        ])
      )
    );
  }
  return out;
}

interface Measured {
  mechanism: Mechanism;
  rates: Map<string, Rates>[];
  /** The steps the ordering planned, as `how` for each target set. */
  steps: string[];
  /** Whether the solver says it took the coupled route. */
  coupled: boolean;
}

/** Build and measure one way, while the solver is still describing it. */
function measure(make: () => MechanismFixture): Measured {
  const mechanism = buildMechanism(make()).mechanism;
  const steps = [...solver.jointNumOrderSolverMap].map(
    ([, ids]) => solver.desiredAnalysisJointMap.get(ids[0]) ?? '?'
  );
  const coupled = solver.coupledRoute;
  return { mechanism, rates: ratesOf(mechanism), steps, coupled };
}

function bothWays(make: () => MechanismFixture): { walked: Measured; coupled: Measured } {
  const walked = measure(make);
  solver.forceCoupledRoute = true;
  try {
    return { walked, coupled: measure(make) };
  } finally {
    solver.forceCoupledRoute = false;
  }
}

describe('a mechanism solved as one coupled system instead of walked', () => {
  for (const { name, make, rates } of CASES) {
    describe(name, () => {
      const both = bothWays(make);
      const walked = both.walked.mechanism;
      const coupled = both.coupled.mechanism;

      it('was actually solved the two different ways it is being compared as', () => {
        // Without this the whole file can pass while measuring one route
        // twice, which is precisely what it is here to rule out.
        expect(both.walked.coupled).toBe(false);
        expect(both.walked.steps).not.toContain('simultaneousSystem');
        expect(both.coupled.coupled).toBe(true);
        expect(both.coupled.steps.filter((how) => how === 'simultaneousSystem')).toHaveLength(1);
      });

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
        /**
         * Compare one rate at every joint of every interior sample.
         *
         * Nothing is skipped. A joint the loop solver answered for and the
         * constraint set did not is the failure this is looking for, so an
         * absent or non-finite entry has to read as one rather than as a
         * sample quietly passed over -- which is how a route that answered for
         * half the drawing once looked like agreement.
         */
        const compare = (which: 'velocity' | 'acceleration', bound: number) => {
          let worst = 0;
          let scale = 0;
          let compared = 0;
          for (let t = 1; t < both.walked.rates.length - 1; t++) {
            for (const [id, value] of both.walked.rates[t]) {
              const other = both.coupled.rates[t].get(id);
              expect(other, `${which} missing for ${id} at sample ${t}`).toBeDefined();
              const mine = value[which];
              const theirs = other![which];
              expect(
                mine.every(Number.isFinite) && theirs.every(Number.isFinite),
                `${which} not a number for ${id} at sample ${t}`
              ).toBe(true);
              worst = Math.max(worst, Math.hypot(mine[0] - theirs[0], mine[1] - theirs[1]));
              scale = Math.max(scale, Math.hypot(mine[0], mine[1]));
              compared++;
            }
          }
          expect(compared).toBeGreaterThan(0);
          expect(worst).toBeLessThan(Math.max(scale, 1) * bound);
        };

        it('and moves at the same speed at every one of them', () => {
          // Rates are differentiated from the positions, so they carry the
          // same last-place disagreement amplified by the time step; a
          // thousandth of the fastest thing in the drawing is well inside it.
          compare('velocity', 1e-3);
        });

        it('and accelerates the same way at every one of them', () => {
          // A second derivative of the same positions, so the same
          // disagreement again: the bound is loosened by the one factor that
          // differencing twice rather than once actually costs.
          compare('acceleration', 1e-2);
        });
      }
    });
  }
});
