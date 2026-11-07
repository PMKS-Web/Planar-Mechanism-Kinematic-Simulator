// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { KinematicsSolver } from '../../app/model/mechanism/kinematic-solver';
import { buildMechanism, MechanismFixture } from '../../test-utils/verification/fixture';
import { teachingLabSliderCrankFixture } from '../../test-utils/verification/fixtures';
import { twoInputsFixture } from '../../test-utils/verification/student-mistake-fixtures';

// A drawing can flag a second input, which PMKS+ ignores with a warning and
// runs from the first. Ignored has to mean ignored: every rate must come out
// exactly as it does with the second flag taken off.
//
// Issue #78: the rate solve gave no unknown to any link touching a flagged
// joint, while only the first input's link was put on the known side. A link
// the second flag touched got neither, so its rate was never solved and the
// loop around it was solved one unknown short: the four-bar's coupler turned at
// 0.1625 rad/s at the drawn pose where its own joint velocities say 0.1745.

interface Rates {
  omega: Map<string, number>;
  alpha: Map<string, number>;
  velocity: Map<string, [number, number]>;
}

/** The analytic rates at every sample, as the solver leaves them. */
function analyticRates(fixture: MechanismFixture): Rates[] {
  const { mechanism } = buildMechanism(fixture);
  expect(mechanism.isMechanismValid()).toBe(true);
  KinematicsSolver.resetVariables();
  KinematicsSolver.requiredLoops = mechanism.requiredLoops;
  return mechanism.joints.map((joints, t) => {
    KinematicsSolver.determineKinematics(
      joints,
      mechanism.links[t],
      mechanism.inputAngularVelocities[t]
    );
    return {
      omega: new Map(KinematicsSolver.linkAngVelMap),
      alpha: new Map(KinematicsSolver.linkAngAccMap),
      velocity: new Map(KinematicsSolver.jointVelMap),
    };
  });
}

function withoutSecondInput(fixture: MechanismFixture, id: string): MechanismFixture {
  return {
    ...fixture,
    joints: fixture.joints.map((joint) => (joint.id === id ? { ...joint, input: false } : joint)),
  };
}

function expectSameRates(flagged: Rates[], plain: Rates[]): void {
  expect(flagged.length).toBe(plain.length);
  expect(plain.length).toBeGreaterThan(1);
  const close = (a: number | undefined, b: number | undefined, what: string): void => {
    expect(a, what).toBeDefined();
    expect(Number.isFinite(a!), what).toBe(true);
    expect(b, `${what}, without the second input`).toBeDefined();
    expect(Math.abs(a! - b!), what).toBeLessThan(1e-9 * Math.max(1, Math.abs(b!)));
  };
  plain.forEach((expected, t) => {
    for (const [id, omega] of expected.omega)
      close(flagged[t].omega.get(id), omega, `ω ${id} @${t}`);
    for (const [id, alpha] of expected.alpha)
      close(flagged[t].alpha.get(id), alpha, `α ${id} @${t}`);
    for (const [id, velocity] of expected.velocity) {
      close(flagged[t].velocity.get(id)?.[0], velocity?.[0], `vx ${id} @${t}`);
      close(flagged[t].velocity.get(id)?.[1], velocity?.[1], `vy ${id} @${t}`);
    }
  });
}

describe('a second input the solve ignores', () => {
  it('leaves a four-bar turning as it does with one input', () => {
    const flagged = analyticRates(twoInputsFixture());
    const plain = analyticRates(withoutSecondInput(twoInputsFixture(), 'D'));
    // The rocker CD, which the second flag touches, is solved at all.
    expect(plain[0].omega.has('CD')).toBe(true);
    expectSameRates(flagged, plain);
  });

  it("leaves a slider-crank's block sliding as it does with one input", () => {
    // The second flag on the slider: a driven guide's rate is commanded, and
    // only the drive the solve uses has a command to give.
    const slider = teachingLabSliderCrankFixture();
    const flagged = analyticRates({
      ...slider,
      joints: slider.joints.map((joint) => (joint.id === 'C' ? { ...joint, input: true } : joint)),
    });
    expectSameRates(flagged, analyticRates(slider));
  });
});
