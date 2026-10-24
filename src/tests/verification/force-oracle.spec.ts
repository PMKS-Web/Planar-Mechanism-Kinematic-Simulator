// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { TestBed } from '@angular/core/testing';
import { ForceAnalysisMode } from '../../app/model/mechanism/force-solver';
import { Mechanism } from '../../app/model/mechanism/mechanism';
import { MODEL_SCALE } from '../../app/model/render-scale';
import { MechanismService } from '../../app/services/mechanism.service';
import { UrlProcessorService } from '../../app/services/url-processor.service';
import { buildMechanism, inModelUnits } from '../../test-utils/verification/fixture';
import { fixturePayload } from '../../test-utils/verification/fixture-payload';
import { auditForces, DrawingUnit, drawnIn } from '../../test-utils/verification/force-oracle';
import { oracleSixBar } from '../../test-utils/verification/oracle-fixtures';

// Force analysis checked by an oracle that shares nothing with the solver: not
// its unit factors, not its kinematics, not its copy of the masses. See
// force-oracle.ts for what it reads and why, and docs/short-notes.md for what
// it cannot see.
//
// It exists because of a scale error. The solver once took a model unit for a
// meter and reported forces two hundred times too large; two PRs then fixed
// that independently and merged cleanly on top of each other, which would
// have made them two hundred times too small. Both are drawn below, and both
// have to be rejected.

const UNITS: DrawingUnit[] = ['m', 'cm', 'in'];
const MODES: ForceAnalysisMode[] = ['static', 'dynamic'];

/**
 * How far the solver's answers may sit from Newton–Euler, as a fraction of the
 * frame's largest term.
 *
 * Measured, then given room: the worst body residual is 9e-4 and the worst
 * power residual 4e-3, both in meters, where the URL's thousandth-of-a-unit
 * grain is coarsest and a model unit is largest against the noise the
 * positions carry. A scale error either way puts both above 0.5.
 */
const BODY_TOLERANCE = 5e-3;
const POWER_TOLERANCE = 2e-2;

/** What a scale error has to produce at least, to count as caught loudly. */
const CAUGHT = 0.25;

/** The mechanism a reader gets by opening its link, in the unit the link names. */
function opened(unit: DrawingUnit): Mechanism {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  const service = TestBed.inject(MechanismService);
  TestBed.inject(UrlProcessorService).updateFromURL(
    fixturePayload(drawnIn(oracleSixBar(), unit)),
    false,
    true
  );
  expect(service.mechanisms.length).toBe(1);
  return service.mechanisms[0];
}

describe('force analysis against an independent Newton–Euler oracle', () => {
  for (const unit of UNITS) {
    describe(`the six-bar opened from its link in ${unit}`, () => {
      let mechanism: Mechanism;
      beforeAll(() => {
        mechanism = opened(unit);
      });

      for (const mode of MODES) {
        it(`holds every body to Newton and Euler, ${mode}`, () => {
          const report = auditForces(
            oracleSixBar(),
            unit,
            mechanism,
            mechanism.getForceAnalysis(mode),
            mode
          );
          expect(report.checked).toBeGreaterThan(0.9 * report.frames);
          expect(report.worstBody, report.where).toBeLessThan(BODY_TOLERANCE);
          expect(report.worstPower).toBeLessThan(POWER_TOLERANCE);
        });
      }
    });
  }

  // A solver that mistakes its length unit by a factor k gives exactly the
  // answers a correct one gives for the drawing k times larger: every moment
  // arm and every m·a scale by k, while g, the masses and the loads do not.
  // So the stretched drawing's analysis *is* the broken solver's, and the
  // oracle, still watching the true drawing move, has to refuse it.
  const ERRORS = [
    { stretch: MODEL_SCALE, what: 'model units read as meters (the error #38 fixed)' },
    { stretch: 1 / MODEL_SCALE, what: 'MODEL_SCALE divided out twice (#38 and #42 together)' },
  ];
  for (const unit of UNITS) {
    describe(`refuses a length scale error in ${unit}`, () => {
      for (const { stretch, what } of ERRORS) {
        for (const mode of MODES) {
          it(`${what}, ${mode}`, () => {
            const truth = buildMechanism(inModelUnits(drawnIn(oracleSixBar(), unit))).mechanism;
            const wrong = buildMechanism(
              inModelUnits(drawnIn(oracleSixBar(), unit, stretch))
            ).mechanism;
            // The same samples at the same crank angles, so frame t of one is
            // frame t of the other.
            expect(wrong.timeNum).toEqual(truth.timeNum);

            const physical = oracleSixBar();
            const honest = auditForces(physical, unit, truth, truth.getForceAnalysis(mode), mode);
            const broken = auditForces(physical, unit, truth, wrong.getForceAnalysis(mode), mode);
            expect(honest.worstBody).toBeLessThan(BODY_TOLERANCE);
            expect(broken.checked).toBe(honest.checked);
            expect(broken.worstBody).toBeGreaterThan(CAUGHT);
            expect(broken.worstPower).toBeGreaterThan(CAUGHT);
          });
        }
      }
    });
  }
});
