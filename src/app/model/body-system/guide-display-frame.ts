import { AttachmentId } from './body-id';
import { dot, rotate, subtract } from './body-frame';
import { Attachment, GuidedJoint } from './joint-record';

/** Artwork may outlive its witness attachment; moving its reference preserves its material owner and drawn station. */
export function guideDisplayAtPhysicalAnchor(
  joint: GuidedJoint,
  attachments: ReadonlyMap<AttachmentId, Attachment>
): NonNullable<GuidedJoint['guideDisplay']> {
  const guide = joint.guideDisplay ?? { bodyId: joint.bodyA, frame: joint.frameA };
  const base = guide.bodyId === joint.bodyA ? joint.frameA : joint.frameB;
  const distance = subtract(
    attachments.get(guide.frame.attachmentId)!.point,
    attachments.get(base.attachmentId)!.point
  );
  const offset = dot(rotate({ x: 1, y: 0 }, guide.frame.angle), distance);
  const normal = dot(rotate({ x: 0, y: 1 }, guide.frame.angle), distance);
  return {
    ...guide,
    frame: { ...guide.frame, attachmentId: base.attachmentId },
    ...(offset !== 0 || guide.station !== undefined
      ? { station: (guide.station ?? 0) + offset }
      : {}),
    ...(normal !== 0 || guide.normalOffset !== undefined
      ? { normalOffset: (guide.normalOffset ?? 0) + normal }
      : {}),
    ...(guide.from === undefined ? {} : { from: guide.from + offset, to: guide.to! + offset }),
  };
}
