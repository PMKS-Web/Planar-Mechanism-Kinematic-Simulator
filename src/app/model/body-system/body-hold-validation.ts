import { BodyDocument } from './body-document';
import { BodyEditRefusal, BodySelectionRef } from './body-edit-types';
import { bodyEditRefusal } from './joint-permission';

/** Holds constrain authored edits only; they never add a physical row to the mechanism. */
export function validateBodyEditHolds(document: BodyDocument): BodyEditRefusal | undefined {
  const moved: BodySelectionRef[] = [];
  for (const hold of document.holds) {
    const from = document.attachments.find((point) => point.id === hold.from)!,
      to = document.attachments.find((point) => point.id === hold.to)!;
    const dx = to.point.x - from.point.x,
      dy = to.point.y - from.point.y;
    const length = Math.hypot(dx, dy);
    const precision =
      32 *
      Number.EPSILON *
      Math.max(
        length,
        Math.abs(from.point.x),
        Math.abs(from.point.y),
        Math.abs(to.point.x),
        Math.abs(to.point.y)
      );
    const angle =
      document.bodies.find((body) => body.id === hold.bodyId)!.pose.angle + Math.atan2(dy, dx);
    if (
      (hold.length !== undefined && Math.abs(length - hold.length) > precision) ||
      (hold.angle !== undefined &&
        (length === 0 ||
          Math.abs(Math.sin((angle - hold.angle) / 2)) > 32 * Number.EPSILON + precision / length))
    )
      moved.push({ kind: 'body', id: hold.bodyId });
  }
  return moved.length ? bodyEditRefusal('held-dimension', moved) : undefined;
}
