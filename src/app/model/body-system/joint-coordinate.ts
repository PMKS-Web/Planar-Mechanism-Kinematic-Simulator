import { BodyId } from './body-id';
import { dot, localToWorld, Pose, rotate, subtract } from './body-frame';
import { Attachment, BodyJoint, hasCoordinate, JointCoordinate } from './joint-record';

export type BodyPoses = ReadonlyMap<BodyId, Pose>;

export function jointCoordinate(
  joint: BodyJoint,
  coordinate: JointCoordinate,
  poses: BodyPoses,
  attachments: ReadonlyMap<Attachment['id'], Attachment>
): number {
  if (!hasCoordinate(joint, coordinate)) throw new Error('Joint does not have this coordinate');
  const a = poses.get(joint.bodyA);
  const b = poses.get(joint.bodyB);
  const anchorA = attachments.get(joint.frameA.attachmentId);
  const anchorB = attachments.get(joint.frameB.attachmentId);
  if (!a || !b || !anchorA || !anchorB || joint.kind === 'weld') {
    throw new Error('Joint references are incomplete');
  }
  if (coordinate === 'angle') return b.angle - a.angle - joint.angleZero;
  if (joint.kind === 'revolute') throw new Error('Revolute joint has no travel');
  const direction = rotate({ x: 1, y: 0 }, a.angle + joint.frameA.angle);
  const displacement = subtract(localToWorld(b, anchorB.point), localToWorld(a, anchorA.point));
  return dot(direction, displacement) - joint.travelZero;
}
