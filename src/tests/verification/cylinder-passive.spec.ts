// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { buildMechanismAtScale } from '../../test-utils/verification/fixture';
import { followAdvice, readDrawing } from '../../test-utils/verification/follow-advice';
import { read } from '../../test-utils/verification/issue-text';
import {
  cylinderCouplerFixture,
  cylinderTriangleFixture,
  followerCylinderFixture,
  mixedCylinderFixture,
  ramGroundedAtItsFreeEndFixture,
  ramWithAFreeEndFixture,
} from '../../test-utils/verification/passive-cylinder-fixtures';
import { cylinderBoomFixture } from '../../test-utils/verification/slot-fixtures';
import { MODEL_SCALE } from '../../app/model/render-scale';
import { MechanismFixture } from '../../test-utils/verification/fixture';

/**
 * A cylinder is a sliding joint, and nothing drives it but an input.
 *
 * A cylinder nothing drives adds its freedom like any Prismatic joint: the
 * count is Gruebler's, and a drawing that relies on a ram to stay one length
 * is refused and told so. The one exception is a cylinder with both ends on one
 * rigid body, which cannot slide at all (S25, `cylinder-frozen-body.spec.ts`).
 * These drawings once ran because a passive ram held its length; now they say
 * where the freedom is.
 */

const S = MODEL_SCALE;

function built(fixture: MechanismFixture) {
  return buildMechanismAtScale(fixture, 1 * S);
}

/** The first blocker the drawer shows, as read. */
function blockerOf(fixture: MechanismFixture) {
  const [machine] = readDrawing(fixture).machines;
  const blocker = machine.readiness.checks.find((check) => check.severity === 'blocker');
  return { ready: machine.readiness.ready, checks: machine.readiness.checks, blocker };
}

describe('a cylinder nothing drives', () => {
  it('adds a freedom to a four-bar whose coupler it is', () => {
    const { mechanism } = built(cylinderCouplerFixture(S));
    expect(mechanism.dof).toBe(2);
    expect(mechanism.isMechanismValid()).toBe(false);
  });

  it('adds one each to a triangle of three', () => {
    const { mechanism } = built(cylinderTriangleFixture(S));
    expect(mechanism.dof).toBe(3);
    expect(mechanism.isMechanismValid()).toBe(false);
  });

  it('adds one to a ram grounded at both ends of a four-bar', () => {
    // Four moving bodies, five one-freedom joints: 3 * 4 - 2 * 5 = 2.
    const { mechanism } = built(ramGroundedAtItsFreeEndFixture(S));
    expect(mechanism.dof).toBe(2);
    expect(mechanism.isMechanismValid()).toBe(false);
  });

  it('counts the one it leaves free beside one the machine moves', () => {
    const { mechanism } = built(mixedCylinderFixture(S));
    expect(mechanism.dof).toBe(2);
    expect(mechanism.isMechanismValid()).toBe(false);
  });

  it('still follows where the machine decides its length', () => {
    const { mechanism } = built(followerCylinderFixture(S));
    expect(mechanism.dof).toBe(1);
    expect(mechanism.isMechanismValid()).toBe(true);
    const along = (frame: number) => {
      const at = (id: string) => mechanism.joints[frame].find((joint) => joint.id === id)!;
      return Math.hypot(at('P').x - at('G').x, at('P').y - at('G').y);
    };
    const spans = mechanism.joints.map((_, frame) => along(frame));
    expect(Math.max(...spans) - Math.min(...spans)).toBeGreaterThan(0.2 * S);
  });

  it('leaves a driven cylinder running', () => {
    expect(built(cylinderBoomFixture(S)).mechanism.isMechanismValid()).toBe(true);
  });
});

describe('what the drawer says about it', () => {
  it('names the cylinder, and says a cylinder nothing drives adds a freedom', () => {
    const { blocker, checks } = blockerOf(cylinderCouplerFixture());
    const said = read(blocker!);
    expect(said.title).toBe('2 degrees of freedom, needs 1');
    expect(said.summary).toBe('With the input held still, cylinder BC and link CD can still move.');
    expect(said.explain).toBe(
      'One input drives one motion. A cylinder that nothing drives can change length on its own, and that adds a degree of freedom.'
    );
    expect(said.fixes).toEqual([
      'Set joint C to Welded',
      'Ground joint C',
      'Set joint B to Welded',
    ]);
    // Nothing is holding anything, so nothing says so.
    expect(checks.some((check) => check.severity === 'note')).toBe(false);
  });

  it('lists the steps for a ram hanging by a free end, grounding it among them', () => {
    const { blocker } = blockerOf(ramWithAFreeEndFixture());
    const said = read(blocker!);
    expect(said.title).toBe('4 degrees of freedom, needs 1');
    expect(said.fixes).toContain('Ground joint F');
    expect(said.explain).toContain('takes at least one away');
  });

  it('runs once its advice has been followed', () => {
    const walks = [
      cylinderCouplerFixture(),
      ramWithAFreeEndFixture(),
      ramGroundedAtItsFreeEndFixture(),
      mixedCylinderFixture(),
    ].map((fixture) => {
      const walk = followAdvice({
        seed: 0,
        base: 'cylinder',
        intended: fixture,
        broken: fixture,
        mistakes: [],
      });
      const steps = walk.steps.map((step) => `${step.title} -> ${JSON.stringify(step.action)}`);
      return `${walk.outcome}: ${steps.join(' / ')}`;
    });
    expect(walks).toEqual([
      'runs: 2 degrees of freedom, needs 1 -> {"kind":"weld","joint":"C"}',
      // Two steps: grounding C leaves the ram's length and the arm free, and
      // grounding F then holds both.
      'runs: 4 degrees of freedom, needs 1 -> {"kind":"ground","joint":"C"} / ' +
        '3 degrees of freedom, needs 1 -> {"kind":"ground","joint":"F"}',
      'runs: 2 degrees of freedom, needs 1 -> {"kind":"ground","joint":"C"}',
      'runs: 2 degrees of freedom, needs 1 -> {"kind":"weld","joint":"H"}',
    ]);
  });
});
