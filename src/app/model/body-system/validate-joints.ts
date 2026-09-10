import { ValidationContext } from './validation-context';
import { finitePose } from './body-frame';
import { hasCoordinate, JointCoordinateRef } from './joint-record';

export function validateJoints(context: ValidationContext): void {
  const { document, bodies, anchors, issue } = context;
  for (const joint of document.joints) {
    const path = `joints.${joint.id}`;
    if (!bodies.has(joint.bodyA) || !bodies.has(joint.bodyB)) issue('missing-body', path);
    if (joint.bodyA === joint.bodyB) issue('self-connection', path);
    if (
      anchors.get(joint.frameA.attachmentId)?.bodyId !== joint.bodyA ||
      anchors.get(joint.frameB.attachmentId)?.bodyId !== joint.bodyB
    )
      issue('wrong-attachment-owner', path);
    if (![joint.frameA.angle, joint.frameB.angle].every(Number.isFinite))
      issue('nonfinite-axis', path);
    if (joint.kind === 'weld') {
      if (!finitePose(joint.rest)) issue('nonfinite-weld', path);
    } else {
      if (!['revolute', 'prismatic', 'pin-in-slot'].includes(joint.kind))
        issue('unsupported-joint', path);
      if (!Number.isFinite(joint.angleZero)) issue('nonfinite-datum', path);
      if (joint.kind === 'prismatic') {
        const heading = joint.angleZero + joint.frameB.angle - joint.frameA.angle;
        if (Math.hypot(Math.sin(heading), Math.cos(heading) - 1) > 1e-10)
          issue('inconsistent-guide-frames', path);
      }
      if (
        joint.kind !== 'revolute' &&
        (!Number.isFinite(joint.travelZero) ||
          (joint.guideDisplay &&
            !(
              Number.isFinite(joint.guideDisplay.from) &&
              Number.isFinite(joint.guideDisplay.to) &&
              joint.guideDisplay.from < joint.guideDisplay.to &&
              Number.isFinite(joint.guideDisplay.frame.angle) &&
              [joint.bodyA, joint.bodyB].includes(joint.guideDisplay.bodyId) &&
              anchors.get(joint.guideDisplay.frame.attachmentId)?.bodyId ===
                joint.guideDisplay.bodyId
            )))
      )
        issue('invalid-guide', path);
    }
  }
}

export function validateCoordinates(context: ValidationContext): void {
  const { document, joints, issue } = context;
  const coordinateExists = (ref: JointCoordinateRef) => {
    const joint = joints.get(ref.jointId);
    return (
      joint && ['angle', 'travel'].includes(ref.coordinate) && hasCoordinate(joint, ref.coordinate)
    );
  };
  for (const driver of document.drivers) {
    if (!coordinateExists(driver.coordinate)) issue('missing-coordinate', `drivers.${driver.id}`);
    if (
      driver.profile.kind !== 'constant-speed' ||
      ![driver.profile.initial, driver.profile.speed].every(Number.isFinite)
    )
      issue('unsupported-command', `drivers.${driver.id}`);
  }
  for (const limit of document.limits) {
    if (!coordinateExists(limit.coordinate)) issue('missing-coordinate', `limits.${limit.id}`);
    if (![limit.lower, limit.upper].every(Number.isFinite) || limit.lower > limit.upper)
      issue('invalid-limit', `limits.${limit.id}`);
  }
}
