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
 * Both rate checks below were red when a slider first became one joint, for
 * two different reasons, and both are fixed here: see the comments on each.
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

  // The shape a slider becoming one joint creates, and the gap in the loop walk
  // it walked into. Before the fold this bar ran guide, A, bar, B, guide, with
  // two non-ground joints in the middle for `findGround` to walk; after it, it
  // is one edge between two ground joints, and `determineLoops` handed the
  // first neighbor straight to `findGround` without asking whether that
  // neighbor was itself a ground. Two ground *pins* joined by one bar are
  // frame, so the gap never showed; two ground *guides* joined by one bar are
  // this mechanism. With no loop recorded the rates fell to
  // `determineLooplessKinematics`, which models the drive as a rotation about
  // the input joint: B was handed a large velocity across its own slot and
  // driven A was left at exactly zero.
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

  // The other rate fault a slider becoming one joint introduced, and the one
  // `scissor-lift.spec.ts` asks the same question about. The position system
  // for this lift has two unknowns and the drive's mounts are not among them,
  // so the drive row was dropped from it -- correctly, since it controls no
  // unknown there -- and the rate solve reused that same system. The command
  // reaches `commandDerivative` through that row and nowhere else, so the
  // right-hand side was zero and all eight travelling joints graphed flat.
  it('moves a scissor lift at the rate its positions imply', () => {
    const agreement = velocityAgreesWithPositions(buildMechanism(scissorLiftFixture(MODEL_SCALE)));

    expect(agreement.unsolved).toEqual([]);
    expect(agreement.stationary).toEqual([]);
    expect(agreement.compared).toBeGreaterThan(1000);
    expect(agreement.worst).toBeLessThan(RATE_TOLERANCE);
  });
});
