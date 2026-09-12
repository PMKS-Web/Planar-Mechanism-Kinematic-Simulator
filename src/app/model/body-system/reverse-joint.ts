import { inverse } from './body-frame';
import { BodyJoint } from './joint-record';

/** Reversing order maps the coordinate and conjugate effort to their negatives. */
export function reverseJoint(joint: BodyJoint): BodyJoint {
  if (joint.kind === 'pin-in-slot') {
    throw new Error('Exchanging a free slot carrier and rider changes the mechanism');
  }
  const pair = {
    ...joint,
    bodyA: joint.bodyB,
    bodyB: joint.bodyA,
    frameA: joint.frameB,
    frameB: joint.frameA,
  };
  if (joint.kind === 'weld') return { ...pair, kind: 'weld', rest: inverse(joint.rest) };
  if (joint.kind === 'revolute') return { ...pair, kind: 'revolute', angleZero: -joint.angleZero };
  return {
    ...pair,
    kind: 'prismatic',
    angleZero: -joint.angleZero,
    travelZero: -joint.travelZero,
    // P fixes the relative angle, so this axis remains parallel to the old carrier's axis.
    frameA: { ...joint.frameB, angle: joint.frameA.angle - joint.angleZero },
    frameB: joint.frameA,
    // The visible guide keeps its material owner when equation ordering changes.
    guideDisplay: joint.guideDisplay ?? { bodyId: joint.bodyA, frame: joint.frameA },
  };
}
