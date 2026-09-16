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
 * **Both rate checks are skipped, and both reproduce a real defect.** They are
 * written out rather than deleted because the expensive half of fixing this is
 * having a reproduction at all, and because a skip with its diagnosis beside it
 * is what `scissor-lift.spec.ts` already does with the same fault.
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

  // Skipped: a defect this branch exposes and does not fix, because fixing it
  // moves rate numbers -- which Stage 1 of `docs/joint-type-and-cylinder-plan.md`
  // is expressly not allowed to do -- and because it is solver work with its own
  // verification rather than a consequence of a slider becoming one joint.
  //
  // What it is. A trammel's bar stands on two grounded guides and no pin, and
  // `requiredLoops` comes back **empty** for it: there is no ground-to-ground
  // chain to walk, so `determineArrays` iterates nothing, no column is
  // registered for either guide, and every `guideEnds` call -- all three sit
  // inside `requiredLoops.forEach` -- is unreachable. The rates then come from
  // the other route entirely and do not respect the slots: B rides a guide at
  // 90 degrees and is handed a velocity with a large X component, which its own
  // constraint forbids, while driven A is left at exactly zero.
  //
  // `e2e/template-graphs.mjs` is where this shows: Elliptical_Trammel/A, B and
  // T, ten checks, against 3978 that pass.
  it.skip('moves an elliptical trammel at the rate its positions imply', () => {
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

  // Skipped, and the same fault seen from the other side -- the one
  // `scissor-lift.spec.ts` carries the long diagnosis for: a driven *floating*
  // sealed slider's commanded rate never enters the loop velocity system, so
  // the system is homogeneous and every rate solves to zero. Eight joints of
  // this lift travel and graph as standing still. It reproduces with this
  // branch's solver changes reverted.
  it.skip('moves a scissor lift at the rate its positions imply', () => {
    const agreement = velocityAgreesWithPositions(buildMechanism(scissorLiftFixture(MODEL_SCALE)));

    expect(agreement.unsolved).toEqual([]);
    expect(agreement.stationary).toEqual([]);
    expect(agreement.compared).toBeGreaterThan(1000);
    expect(agreement.worst).toBeLessThan(RATE_TOLERANCE);
  });
});
