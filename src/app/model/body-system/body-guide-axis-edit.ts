import { BodyDocument } from './body-document';
import { BodyEditRefusal } from './body-edit-types';
import { JointId, WORLD } from './body-id';
import { jointCoordinate } from './joint-coordinate';
import { guideDisplayAtPhysicalAnchor } from './guide-display-frame';
import { compileWeldFrames } from './weld-frames';
import { pointEditReach } from './body-point-reach';
import { editGuideAxisComponent, PreparedGuideAxis } from './body-guide-axis-component';
import { bodyEditRefusal, refuseNativeJointChange } from './joint-permission';

export interface GuideAxisRequest {
  readonly jointId: JointId;
  /** The displayed guide heading at the captured edit pose, in radians. */
  readonly worldAxis: number;
}
export type BodyGuideAxisEdit =
  | ({ readonly kind: 'guide-axis' } & GuideAxisRequest)
  | { readonly kind: 'guide-axes'; readonly axes: readonly GuideAxisRequest[] };

/** Editing a guide on its carrier changes that local axis, while connected material follows rigidly. */
export function editBodyGuideAxis(
  document: BodyDocument,
  operation: BodyGuideAxisEdit
): { readonly ok: true; readonly document: BodyDocument } | BodyEditRefusal {
  const requests = operation.kind === 'guide-axis' ? [operation] : operation.axes;
  if (
    requests.length > 1000 ||
    new Set(requests.map((item) => item.jointId)).size !== requests.length
  )
    return bodyEditRefusal('invalid-command');
  const poses = new Map(document.bodies.map((body) => [body.id, body.pose]));
  const attachments = new Map(document.attachments.map((point) => [point.id, point]));
  const changes: PreparedGuideAxis[] = [];
  for (const request of requests) {
    const refused = refuseNativeJointChange(document, request.jointId);
    if (refused) return refused;
    const joint = document.joints.find((item) => item.id === request.jointId)!;
    if (
      (joint.kind !== 'prismatic' && joint.kind !== 'pin-in-slot') ||
      !Number.isFinite(request.worldAxis)
    )
      return bodyEditRefusal('invalid-command');
    const guide = guideDisplayAtPhysicalAnchor(joint, attachments);
    changes.push({
      joint,
      guide,
      delta: request.worldAxis - poses.get(guide.bodyId)!.angle - guide.frame.angle,
      travel: jointCoordinate(joint, 'travel', poses, attachments),
      driven: document.drivers.some(
        (driver) =>
          driver.coordinate.jointId === joint.id && driver.coordinate.coordinate === 'travel'
      ),
    });
  }
  if (changes.every((change) => change.delta === 0)) return { ok: true, document };
  const frames = compileWeldFrames(document);
  if (!frames.ok) return bodyEditRefusal('invalid-document');
  let candidate = document,
    pending = changes;
  while (pending.length) {
    const first = pending[0].joint;
    const target = first.bodyB === WORLD ? first.frameA.attachmentId : first.frameB.attachmentId;
    const reached = pointEditReach(document, target, frames.groupOf).reached;
    const same = (change: PreparedGuideAxis) =>
      reached.has(change.joint.bodyA) || reached.has(change.joint.bodyB);
    const together = pending.filter(same);
    if (!together.length) return bodyEditRefusal('invalid-document');
    // Independent sketches keep separate numerical origins instead of sharing a distant drawing-wide frame.
    const changed = editGuideAxisComponent(candidate, together);
    if (!changed.ok) return changed;
    candidate = changed.document;
    pending = pending.filter((change) => !same(change));
  }
  return { ok: true, document: candidate };
}
