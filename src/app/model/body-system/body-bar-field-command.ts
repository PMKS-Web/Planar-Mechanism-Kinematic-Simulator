import { BodyDocument } from './body-document';
import { BodyId } from './body-id';
import { BodyEditOperation } from './body-edit-types';
import { localToWorld, worldToLocal } from './body-frame';
import { bodyBarHoldPair } from './body-bar-hold';
import { nativeCommand } from './body-joint-interaction';
import { bodyEditRefusal } from './joint-permission';

/** A typed fixed dimension changes its target in the same transaction as the material, never in a separate undo. */
export function bodyBarFieldCommand(
  document: BodyDocument,
  bodyId: BodyId,
  field: 'length' | 'angle',
  value: number
) {
  const body = document.bodies.find((b) => b.id === bodyId);
  if (
    body?.kind !== 'material' ||
    body.geometry.kind !== 'bar' ||
    !Number.isFinite(value) ||
    (field === 'length' && value <= 0)
  )
    return bodyEditRefusal('invalid-command');
  const [a, b] = body.geometry.vertices,
    at = localToWorld(body.pose, a);
  const length = field === 'length' ? value : Math.hypot(b.x - a.x, b.y - a.y);
  const angle = field === 'angle' ? value : body.pose.angle + Math.atan2(b.y - a.y, b.x - a.x);
  const target = { x: at.x + length * Math.cos(angle), y: at.y + length * Math.sin(angle) };
  const endpoint = document.attachments.find((p) => p.bodyId === bodyId && p.vertexId === b.id);
  const move: BodyEditOperation = endpoint
    ? { kind: 'move-point', attachmentId: endpoint.id, target }
    : {
        kind: 'body-geometry',
        bodyId,
        geometry: { ...body.geometry, vertices: [a, { ...b, ...worldToLocal(body.pose, target) }] },
      };
  const pair = bodyBarHoldPair(document, bodyId);
  const hold =
    pair &&
    document.holds.find(
      (h) =>
        h.bodyId === bodyId &&
        [h.from, h.to].includes(pair.from) &&
        [h.from, h.to].includes(pair.to)
    );
  if (!hold || !pair) return nativeCommand(move);
  return nativeCommand(
    { kind: 'hold', bodyId, ...pair, dimension: null },
    move,
    ...(['length', 'angle'] as const)
      .filter((dimension) => hold[dimension] !== undefined)
      .map((dimension) => ({ kind: 'hold' as const, bodyId, ...pair, dimension, enabled: true }))
  );
}
