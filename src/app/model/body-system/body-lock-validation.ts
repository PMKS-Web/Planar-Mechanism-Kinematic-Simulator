import { BodyDocument } from './body-document';
import { BodyEditRefusal, BodySelectionRef } from './body-edit-types';
import { Point, localToWorld } from './body-frame';
import { bodyForceEnds } from './body-force-edit';
import { bodyEditRefusal } from './joint-permission';

/** Locks protect surviving positions; deleting or explicitly unlocking a mark does not move it. */
export function validateBodyEditLocks(
  before: BodyDocument,
  after: BodyDocument
): BodyEditRefusal | undefined {
  const moved: BodySelectionRef[] = [];
  for (const id of before.locks) {
    if (!after.locks.includes(id)) continue;
    const a = before.attachments.find((point) => point.id === id)!;
    const b = after.attachments.find((point) => point.id === id);
    if (
      b &&
      !samePosition(
        localToWorld(before.bodies.find((body) => body.id === a.bodyId)!.pose, a.point),
        localToWorld(after.bodies.find((body) => body.id === b.bodyId)!.pose, b.point)
      )
    )
      moved.push({ kind: 'attachment', id });
  }
  for (const force of before.forces) {
    const next = after.forces.find((item) => item.id === force.id);
    if (!force.locked || !next?.locked) continue;
    const a = bodyForceEnds(before, force),
      b = bodyForceEnds(after, next);
    if (!samePosition(a[0], b[0]) || !samePosition(a[1], b[1]))
      moved.push({ kind: 'force', id: force.id });
  }
  return moved.length ? bodyEditRefusal('locked-position', moved) : undefined;
}
function samePosition(a: Point, b: Point): boolean {
  const tolerance =
    8 * Number.EPSILON * Math.max(1, Math.abs(a.x), Math.abs(a.y), Math.abs(b.x), Math.abs(b.y));
  return Math.hypot(a.x - b.x, a.y - b.y) <= tolerance;
}
