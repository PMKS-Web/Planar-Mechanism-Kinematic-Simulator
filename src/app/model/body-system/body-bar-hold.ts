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

/**
 * The two points a cylinder's angle is held between.
 *
 * A hold is a heading between two points of **one** body, and a cylinder's
 * heading runs mount to mount across two — which is why this looked at first
 * like a shape the new model cannot say. It can: the rod slides along the
 * barrel's own axis, so the barrel's bearing *is* the direction the cylinder
 * points. The pair is the barrel's mount and its bore anchor, the two points
 * `createBodyCylinder` lays on that axis, in that order — so the held heading
 * reads the same way round as the mount-to-mount bearing the row names.
 *
 * There is no length to go with it: the distance between a cylinder's mounts is
 * its stroke, which is the quantity its drive moves, so holding that would hold
 * against the drive rather than constrain the drawing. The public menu offers
 * the one row for the same reason.
 */
export function bodyCylinderHoldPair(document: BodyDocument, bodyId: BodyId) {
  const assembly = document.assemblies.find((one) => one.barrel === bodyId);
  if (!assembly) return;
  const joint = document.joints.find((one) => one.id === assembly.internalJoint);
  if (!joint) return;
  const bore = joint.bodyA === bodyId ? joint.frameA.attachmentId : joint.frameB.attachmentId;
  const from = document.attachments.find((p) => p.id === assembly.barrelMount),
    to = document.attachments.find((p) => p.id === bore);
  if (!from || !to || from.id === to.id) return;
  // A rod as long as its barrel leaves the mount and the bore anchor on top of
  // one another, and two coincident points name no direction.
  if (from.point.x === to.point.x && from.point.y === to.point.y) return;
  return { from: from.id, to: to.id };
}
