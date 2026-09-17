// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { PrisJoint } from '../../app/model/joint';
import { buildMechanism } from '../../test-utils/verification/fixture';
import { RATE_TOLERANCE, velocityAgreesWithPositions } from '../../test-utils/verification/rates';
import { scissorLiftFixture } from '../../test-utils/verification/library-fixtures';
import { MODEL_SCALE } from '../../app/model/render-scale';
import { TEMPLATE_LINKAGES } from '../../app/component/MODALS/templates/template-linkages';
import { buildMechanismFixture } from '../fixtures/mechanism-fixtures';
import { solveKinematics } from '../../test-utils/verification/solve';

/**
 * Rates on the two mechanisms carried entirely on sliding joints.
 *
 * `e2e/template-graphs.mjs` differences every plotted series against the
 * position it derives from, and it was the only thing in the suite asking
 * these two that question: 3978 checks there, 2572 in the unit tables, and the
 * overlap on a mechanism standing on nothing but guides was empty. That is how
 * a rate defect here could cost a browser run to find and go unnoticed in a
 * green unit suite -- so the reproduction lives here now, where it takes a
 * second rather than two minutes.
 *
 * Both rate checks below started life skipped, each reproducing a real defect
 * with its diagnosis beside it -- the expensive half of fixing either was
 * having a reproduction at all. They run now; the diagnoses stay as the record
 * of what each one guards.
 */
describe('a mechanism whose ends all slide', () => {
  it('draws an elliptical trammel that solves, whatever its rates say', () => {
    // The part that does work, and the harness note that matters: the
    // *fixture* -- `ellipticalTrammelFixture(true, 1)` -- comes back
    // `dead-position` with one sample at every object scale from a quarter of
    // MODEL_SCALE to four times it, so a spec reaching for it measures nothing.
    // The template payload encoded from that same fixture solves. Anything
    // asking this mechanism a question has to come in this way.
    const { mechanism } = buildMechanismFixture(TEMPLATE_LINKAGES['Elliptical_Trammel']);

    expect(mechanism.isMechanismValid()).toBe(true);
    expect(mechanism.dof).toBe(1);
    expect(mechanism.joints.length).toBeGreaterThan(300);
    expect(mechanism.joints[0].map((joint) => joint.id).sort()).toEqual(['A', 'B', 'T']);
  });

  // A trammel's bar stands on two grounded guides and no pin: a single link
  // straight from one ground to the next, which the loop walk used to step
  // over -- `findGround` only asks about the neighbors *of* the joint it is
  // given, so starting on one ground and landing on the other closed nothing
  // and `requiredLoops` came back empty. The rates then came from the loopless
  // route, which spins the bar rigidly about the drive: B rides a guide at 90
  // degrees and was handed a velocity with a large X component, which its own
  // constraint forbids, while driven A sat at exactly zero.
  //
  // `e2e/template-graphs.mjs` is where this showed: Elliptical_Trammel/A, B
  // and T, ten checks, against 3978 that passed.
  it('moves an elliptical trammel at the rate its positions imply', () => {
    const { mechanism } = buildMechanismFixture(TEMPLATE_LINKAGES['Elliptical_Trammel']);
    const trace = solveKinematics({ mechanism } as never);
    const mid = Math.floor(trace.steps / 2);
    const sliders = mechanism.joints[0].filter(
      (joint): joint is PrisJoint => joint instanceof PrisJoint
    );

    // Each joint's velocity lies along its own slot. The cross product against
    // the slot direction is the whole constraint, and it is what a rate solved
    // without the slot in the system cannot satisfy by accident.
    for (const slider of sliders) {
      const [vx, vy] = trace.jointVel[mid][slider.id] ?? [NaN, NaN];
      const across = Math.abs(-Math.sin(slider.slotAngle) * vx + Math.cos(slider.slotAngle) * vy);
      expect(across, `${slider.id} off its slot`).toBeLessThan(1e-6 * Math.hypot(vx, vy) + 1e-6);
    }
  });

  // The same fault seen from the other side -- the one `scissor-lift.spec.ts`
  // carries the long diagnosis for: the rates were differentiated through the
  // two-joint constraint set the position walk left behind, whose rows the
  // ram's command never reaches. Eight joints of this lift travel and graphed
  // as standing still.
  it('moves a scissor lift at the rate its positions imply', () => {
    const agreement = velocityAgreesWithPositions(buildMechanism(scissorLiftFixture(MODEL_SCALE)));

    expect(agreement.unsolved).toEqual([]);
    expect(agreement.stationary).toEqual([]);
    expect(agreement.compared).toBeGreaterThan(1000);
    expect(agreement.worst).toBeLessThan(RATE_TOLERANCE);
  });
});
