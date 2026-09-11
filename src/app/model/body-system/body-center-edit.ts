import { BodyDocument, GroupAnnotation } from './body-document';
import { BodyId } from './body-id';
import {
  add,
  localToWorld,
  Point,
  relativePose,
  scale,
  subtract,
  worldToLocal,
} from './body-frame';
import { sameBodyRecord } from './body-edit-effects';
import { geometryCenter, deformBodyCenter } from './body-center-geometry';
import { aggregateMaterialMass } from './weld-groups';
import { unitFactors } from './body-units';
import { CenterEditAnchor } from './material-body';

/** Edit anchors change stored local centers; playback still transports those centers rigidly. */
export function remapEditedCenters(
  before: BodyDocument,
  candidate: BodyDocument,
  explicitCenters: ReadonlySet<BodyId> = new Set()
): BodyDocument {
  const bodies = candidate.bodies.map((body) => {
    const previous = before.bodies.find((item) => item.id === body.id);
    if (
      explicitCenters.has(body.id) ||
      body.kind !== 'material' ||
      previous?.kind !== 'material' ||
      body.mass.center.mode !== 'explicit' ||
      previous.mass.center.mode !== 'explicit' ||
      !sameBodyRecord(body.mass.center, previous.mass.center) ||
      (sameBodyRecord(body.pose, previous.pose) &&
        sameBodyRecord(body.geometry, previous.geometry) &&
        sameAnchors(before, candidate, [body.id]))
    )
      return body;
    const center = body.mass.center;
    if (center.editAnchor === 'body')
      return { ...body, mass: { ...body.mass, center: deformBodyCenter(previous, body, center) } };
    const point = editedPoint(
      before,
      candidate,
      body.id,
      body.id,
      center.point,
      center.editAnchor,
      geometryCenter(previous.geometry),
      geometryCenter(body.geometry)
    );
    const { editAxis, ...rest } = center;
    const keptAxis =
      editAxis &&
      body.geometry.kind !== 'circle' &&
      editAxis.every(
        (id) => body.geometry.kind !== 'circle' && body.geometry.vertices.some((v) => v.id === id)
      );
    return {
      ...body,
      mass: { ...body.mass, center: { ...rest, point, ...(keptAxis ? { editAxis } : {}) } },
    };
  });
  const after = { ...candidate, bodies };
  return {
    ...after,
    groups: after.groups.map((group) => {
      const old = before.groups.find(
        (item) =>
          item.frameBody === group.frameBody &&
          item.members.length === group.members.length &&
          item.members.every((id) => group.members.includes(id))
      );
      if (
        !old?.mass?.center ||
        !group.mass?.center ||
        !sameBodyRecord(old.mass.center, group.mass.center) ||
        group.members.every((id) => {
          const a = before.bodies.find((body) => body.id === id),
            b = after.bodies.find((body) => body.id === id);
          return (
            sameBodyRecord(a?.pose, b?.pose) &&
            sameBodyRecord(
              a?.kind === 'material' && a.geometry,
              b?.kind === 'material' && b.geometry
            ) &&
            sameAnchors(before, after, [id])
          );
        })
      )
        return group;
      const center = group.mass.center;
      const point = editedPoint(
        before,
        after,
        old.frameBody,
        group.frameBody,
        center.point,
        center.editAnchor,
        groupGeometryCenter(before, old),
        groupGeometryCenter(after, group)
      );
      return { ...group, mass: { ...group.mass, center: { ...center, point } } };
    }),
  };
}
function groupGeometryCenter(document: BodyDocument, group: GroupAnnotation): Point {
  const frame = document.bodies.find((body) => body.id === group.frameBody)!.pose;
  const members = new Map(
    group.members.map((id) => [
      id,
      relativePose(frame, document.bodies.find((body) => body.id === id)!.pose),
    ])
  );
  const automatic = {
    ...document,
    bodies: document.bodies.map((body) =>
      body.kind === 'material'
        ? { ...body, mass: { ...body.mass, center: { mode: 'automatic' as const } } }
        : body
    ),
  };
  return scale(
    aggregateMaterialMass(automatic, members).displayCenter,
    1 / unitFactors(document.units).length
  );
}
function sameAnchors(
  before: BodyDocument,
  after: BodyDocument,
  members: readonly BodyId[]
): boolean {
  return before.attachments
    .filter((point) => members.includes(point.bodyId))
    .every((point) =>
      sameBodyRecord(point.point, after.attachments.find((next) => next.id === point.id)?.point)
    );
}
function editedPoint(
  before: BodyDocument,
  after: BodyDocument,
  oldId: BodyId,
  newId: BodyId,
  point: Point,
  anchor: CenterEditAnchor,
  oldCenter: Point,
  newCenter: Point
): Point {
  if (anchor === 'body') return add(point, subtract(newCenter, oldCenter));
  const oldPose = before.bodies.find((body) => body.id === oldId)!.pose;
  const newPose = after.bodies.find((body) => body.id === newId)!.pose;
  let world = localToWorld(oldPose, point);
  if (typeof anchor === 'object') {
    const a = before.attachments.find((item) => item.id === anchor.attachmentId),
      b = after.attachments.find((item) => item.id === anchor.attachmentId);
    if (a && b)
      world = add(
        world,
        subtract(
          localToWorld(after.bodies.find((body) => body.id === b.bodyId)!.pose, b.point),
          localToWorld(before.bodies.find((body) => body.id === a.bodyId)!.pose, a.point)
        )
      );
  }
  return worldToLocal(newPose, world);
}
