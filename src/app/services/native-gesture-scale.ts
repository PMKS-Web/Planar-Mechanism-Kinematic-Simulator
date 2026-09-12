import { BodyDocument } from '../model/body-system/body-document';
import { WORLD } from '../model/body-system/body-id';
import type { BodyGestureTarget } from './native-body-gesture';

/** Chunking depends on the grabbed material, not a distant machine or the grid's origin. */
export function nativeGestureScale(document: BodyDocument, target: BodyGestureTarget): number {
  if (target.kind === 'move-coordinate' && target.coordinate.coordinate === 'angle') return 0.05;
  const selected =
    target.kind === 'move-body'
      ? target.bodyId
      : target.kind === 'move-point'
        ? document.attachments.find((p) => p.id === target.attachmentId)!.bodyId
        : (() => {
            const j = document.joints.find((j) => j.id === target.coordinate.jointId)!;
            return j.bodyB === WORLD ? j.bodyA : j.bodyB;
          })();
  const owners = new Set([selected]);
  if (selected === WORLD && target.kind === 'move-point')
    for (const j of document.joints)
      if (
        j.frameA.attachmentId === target.attachmentId ||
        j.frameB.attachmentId === target.attachmentId
      ) {
        owners.add(j.bodyA);
        owners.add(j.bodyB);
      }
  let length = 0;
  for (const body of document.bodies) {
    if (!owners.has(body.id) || body.kind === 'world') continue;
    const g = body.geometry;
    if (g.kind === 'circle') length = Math.max(length, 2 * g.radius);
    else {
      const origin = g.vertices[0];
      for (const p of g.vertices)
        length = Math.max(length, Math.hypot(p.x - origin.x, p.y - origin.y));
    }
  }
  return 0.05 * (length || document.settings.objectScale);
}
