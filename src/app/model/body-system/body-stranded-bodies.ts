import { BodyDocument } from './body-document';
import { AttachmentId, BodyId, JointId } from './body-id';

/** What a delete has already claimed, before anything is asked about what it strands. */
export interface BodyDeleteReach {
  readonly joints: ReadonlySet<JointId>;
  readonly attachments: ReadonlySet<AttachmentId>;
  readonly bodies: ReadonlySet<BodyId>;
}

/**
 * The links a deleted pin strands: a link needs two points to be a link.
 *
 * This is the public editor's rule, and its whole rule. `MechanismService`'s
 * `linksRemovedByDeleting` takes the joint and every link the joint leaves with
 * fewer than two of its own, and stops there — it does not go on to the links
 * *those* leave behind — so the question is asked once, of the bodies the
 * deleted marks sat on.
 *
 * It is asked of a **reader's delete**, not of every removal of a joint record.
 * The native model keeps a point and the relationship through it as two
 * records, so releasing a relationship — unchecking Grounded, changing a
 * connection's kind — removes a joint and leaves the material standing. Sweeping
 * there would delete a crank for being ungrounded. `nativeDeleteCommand` is
 * where the two meanings are told apart.
 *
 * A mark the delete takes is not one of the marks that are left: a public pin
 * goes whole, taking its dot off both of its links at once. A point that was
 * already free — a tracer — *is* a mark, because the public model draws it as a
 * joint of the link it sits on, and a bar drawn but not yet joined to anything
 * has two of them and is nobody's casualty.
 */
export function strandedBodies(
  document: BodyDocument,
  removed: BodyDeleteReach
): readonly BodyId[] {
  const pinned = new Set<AttachmentId>(
    document.joints.flatMap((joint) => [
      joint.frameA.attachmentId,
      joint.frameB.attachmentId,
      ...((joint.kind === 'prismatic' || joint.kind === 'pin-in-slot') && joint.guideDisplay
        ? [joint.guideDisplay.frame.attachmentId]
        : []),
    ])
  );
  const standing = (joint: BodyDocument['joints'][number]) =>
    !removed.joints.has(joint.id) &&
    !removed.bodies.has(joint.bodyA) &&
    !removed.bodies.has(joint.bodyB) &&
    !removed.attachments.has(joint.frameA.attachmentId) &&
    !removed.attachments.has(joint.frameB.attachmentId);
  const on = (joint: BodyDocument['joints'][number], id: BodyId) =>
    joint.bodyA === id || joint.bodyB === id;
  const marks = (id: BodyId) =>
    document.joints.filter((joint) => standing(joint) && on(joint, id)).length +
    document.attachments.filter(
      (point) => point.bodyId === id && !pinned.has(point.id) && !removed.attachments.has(point.id)
    ).length;
  const touched = (id: BodyId) =>
    document.joints.some((joint) => removed.joints.has(joint.id) && on(joint, id)) ||
    document.attachments.some((point) => removed.attachments.has(point.id) && point.bodyId === id);
  return document.bodies
    .filter(
      (body) =>
        body.kind === 'material' &&
        !removed.bodies.has(body.id) &&
        touched(body.id) &&
        marks(body.id) < 2
    )
    .map((body) => body.id);
}
