import '../../app/model/joint';
import { buildMechanism } from '../../test-utils/verification/fixture';
import {
  guidedRodOnALinkFixture,
  guidedRodOnALinkUnweldedFixture,
} from '../../test-utils/verification/slot-fixtures';
import { KinematicsSolver } from '../../app/model/mechanism/kinematic-solver';
import { Joint } from '../../app/model/joint';

/**
 * A welded slide assembly located by a link reaching onto it.
 *
 * A rod welded to its block on a grounded guide is a rigid body with one
 * freedom: how far along the guide it has slid. Two things could locate that
 * before -- a member of the assembly some earlier step had placed, and a slot
 * cut into the assembly with a known block riding it, which is the Scotch
 * yoke. Neither covers the commonest arrangement of all: a link from
 * somewhere else in the mechanism pinned onto the rod, which is how a
 * locomotive's radius rod drives its valve rod. The walk left both joints
 * unplaced, `attemptPositionAnalysis` refused before its first step, and the
 * panel called a perfectly ordinary mechanism a dead position.
 *
 * The travel now solves `|M₀ + t·û − S| = L`, and the claims below are what
 * make that a solve rather than a picture: the rod never tilts, the link never
 * changes length, and the rates are the derivatives of the positions.
 */
describe('a guided rod pushed by a link', () => {
  const built = buildMechanism(guidedRodOnALinkFixture());
  const frames = built.mechanism.joints;
  const at = (frame: Joint[], id: string) => frame.find((one) => one.id === id)!;
  const span = (frame: Joint[], a: string, b: string) =>
    Math.hypot(at(frame, a).x - at(frame, b).x, at(frame, a).y - at(frame, b).y);

  it('turns all the way round', () => {
    expect(built.mechanism.dof).toBe(1);
    expect(built.mechanism.isMechanismValid()).toBe(true);
    expect(frames.length).toBe(361);
    expect(new Set(built.mechanism.inputAngularVelocities.map(Math.sign)).size).toBe(1);
  });

  it('keeps the rod level, which is the whole of what the weld says', () => {
    for (const frame of frames) {
      expect(at(frame, 'T').y).toBeCloseTo(0, 9);
      expect(at(frame, 'F').y).toBeCloseTo(0, 9);
      // And the block stays on top of the pin it carries.
      expect(span(frame, 'T', 'G')).toBeLessThan(1e-9);
    }
  });

  it('holds every link at the length it was drawn', () => {
    for (const frame of frames) {
      expect(span(frame, 'A', 'B')).toBeCloseTo(1, 3);
      expect(span(frame, 'B', 'F')).toBeCloseTo(Math.hypot(3, 1), 3);
      expect(span(frame, 'F', 'T')).toBeCloseTo(3, 3);
    }
  });

  it('places the rod where the closed form puts it', () => {
    // The crank pin is on the unit circle; F is on y = 0 at the reach of the
    // rod from it, on the far side. Nothing here is iterative.
    for (const frame of frames) {
      const b = at(frame, 'B');
      const exact = b.x + Math.sqrt(10 - b.y * b.y);
      expect(at(frame, 'F').x).toBeCloseTo(exact, 3);
      expect(at(frame, 'T').x).toBeCloseTo(exact + 3, 3);
    }
  });

  it('finds rates that are the derivatives of the positions', () => {
    KinematicsSolver.resetVariables();
    KinematicsSolver.requiredLoops = built.mechanism.requiredLoops;
    const time = built.mechanism.timeNum;
    const velocity: number[][] = [];
    for (let t = 0; t < frames.length; t++) {
      KinematicsSolver.determineKinematics(
        frames[t],
        built.mechanism.links[t],
        built.mechanism.inputAngularVelocities[t]
      );
      const v = KinematicsSolver.jointVelMap.get('F')!;
      velocity.push([v[0], v[1]]);
      // The guide is horizontal and the rod cannot turn, so nothing on it may
      // have a vertical rate at all.
      expect(Math.abs(v[1])).toBeLessThan(1e-9);
      expect(KinematicsSolver.jointVelMap.get('T')![0]).toBeCloseTo(v[0], 9);
    }
    // Against the closed form differentiated by hand, not against differences
    // of the recorded positions: those are rounded to four decimals and
    // differenced over a thirtieth of a second, which is a floor of a few
    // thousandths all by itself. With `F.x = B.x + sqrt(10 - B.y**2)`,
    // `F.x' = B.x' - B.y*B.y' / sqrt(10 - B.y**2)`.
    for (let t = 0; t < frames.length; t++) {
      const b = at(frames[t], 'B');
      const turning = built.mechanism.inputAngularVelocities[t];
      const exact = -b.y * turning - (b.y * (b.x * turning)) / Math.sqrt(10 - b.y * b.y);
      expect(velocity[t][0]).toBeCloseTo(exact, 3);
    }
  });
});

describe('the same drawing with the rod free to turn in its block', () => {
  it('has two freedoms, so the weld is what makes this a mechanism at all', () => {
    // Worth stating, because it is what the primitive is really using. Let the
    // rod turn in its block and the crank no longer determines the drawing:
    // the rod can swing about T while the block sits still, and F is left free
    // along its circle about B. The weld takes that freedom away, and taking
    // it away is what leaves the rod one scalar -- how far it has slid -- for
    // a link onto it to pin down.
    const built = buildMechanism(guidedRodOnALinkUnweldedFixture());
    expect(built.mechanism.dof).toBe(2);
    expect(built.mechanism.isMechanismValid()).toBe(false);
    expect(built.mechanism.failure).toBe('mobility');
  });
});
