import { BodyDocument } from './body-document';
import { BodyId, compareRecordIds } from './body-id';

/** The length and angle fields describe geometry endpoints, never the first two incidental anchors. */
export function bodyBarHoldPair(document: BodyDocument, bodyId: BodyId) {
  const body = document.bodies.find((b) => b.id === bodyId);
  if (body?.kind !== 'material' || body.geometry.kind !== 'bar') return;
  const points = document.attachments
    .filter((p) => p.bodyId === bodyId)
    .sort((a, b) => compareRecordIds(a.id, b.id));
  const ends = body.geometry.vertices.map(
    (v) =>
      points.find((p) => p.vertexId === v.id) ??
      points.find((p) => p.point.x === v.x && p.point.y === v.y)
  );
  if (!ends[0] || !ends[1] || ends[0].id === ends[1].id) return;
  return { from: ends[0].id, to: ends[1].id };
}
