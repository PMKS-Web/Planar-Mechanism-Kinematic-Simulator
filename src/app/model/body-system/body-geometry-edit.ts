import { BodyDocument } from './body-document';
import { BodyEditRefusal } from './body-edit-types';
import { AttachmentId, BodyId, WORLD } from './body-id';
import { finitePoint, finitePose, Point, Pose } from './body-frame';
import { BodyGeometry } from './material-body';
import { validGeometry } from './body-geometry-validation';
import { bodyEditRefusal } from './joint-permission';

/** Canonical design changes. Gesture planning supplies the complete connected proposal, not cursor coordinates. */
export type BodyGeometryOperation =
  | { readonly kind: 'body-geometry'; readonly bodyId: BodyId; readonly geometry: BodyGeometry }
  | {
      readonly kind: 'attachment-position';
      readonly attachmentId: AttachmentId;
      readonly point: Point;
    }
  | {
      readonly kind: 'body-poses';
      readonly poses: readonly { readonly bodyId: BodyId; readonly pose: Pose }[];
    };

export function isBodyGeometryOperation(operation: {
  readonly kind: string;
}): operation is BodyGeometryOperation {
  return ['body-geometry', 'attachment-position', 'body-poses'].includes(operation.kind);
}

export function editBodyGeometry(
  document: BodyDocument,
  operation: BodyGeometryOperation
): { readonly ok: true; readonly document: BodyDocument } | BodyEditRefusal {
  if (operation.kind === 'body-poses') {
    const poses = new Map(operation.poses.map((item) => [item.bodyId, item.pose]));
    if (
      poses.size !== operation.poses.length ||
      [...poses.values()].some((pose) => !finitePose(pose))
    )
      return bodyEditRefusal('invalid-command');
    if (poses.has(WORLD)) return bodyEditRefusal('immutable-world');
    if ([...poses.keys()].some((id) => !document.bodies.some((body) => body.id === id)))
      return bodyEditRefusal('missing-target');
    return {
      ok: true,
      document: {
        ...document,
        bodies: document.bodies.map((body) =>
          body.kind === 'material' && poses.has(body.id)
            ? { ...body, pose: poses.get(body.id)! }
            : body
        ),
      },
    };
  }
  const attachment =
    operation.kind === 'attachment-position'
      ? document.attachments.find((point) => point.id === operation.attachmentId)
      : undefined;
  if (operation.kind === 'attachment-position' && !attachment)
    return bodyEditRefusal('missing-target');
  const bodyId = operation.kind === 'body-geometry' ? operation.bodyId : attachment!.bodyId;
  const body = document.bodies.find((item) => item.id === bodyId);
  if (!body) return bodyEditRefusal('missing-target');
  if (body.kind === 'world') {
    if (operation.kind !== 'attachment-position') return bodyEditRefusal('immutable-world');
    if (!finitePoint(operation.point)) return bodyEditRefusal('invalid-command');
    return {
      ok: true,
      document: {
        ...document,
        attachments: document.attachments.map((point) =>
          point.id === operation.attachmentId ? { ...point, point: operation.point } : point
        ),
      },
    };
  }
  const cylinder = document.assemblies.find(
    (item) => item.barrel === bodyId || item.rod === bodyId
  );
  if (cylinder) {
    const internal = document.joints.find((item) => item.id === cylinder.internalJoint)!;
    if (
      operation.kind === 'body-geometry' ||
      attachment?.vertexId ||
      [
        cylinder.barrelMount,
        cylinder.rodMount,
        internal.frameA.attachmentId,
        internal.frameB.attachmentId,
      ].includes(attachment!.id)
    )
      return bodyEditRefusal('assembly-interior', [{ kind: 'assembly', id: cylinder.id }]);
  }
  if (operation.kind === 'attachment-position' && !finitePoint(operation.point))
    return bodyEditRefusal('invalid-command');
  const geometry =
    operation.kind === 'body-geometry'
      ? operation.geometry
      : attachment!.vertexId && body.geometry.kind !== 'circle'
        ? ({
            ...body.geometry,
            vertices: body.geometry.vertices.map((vertex) =>
              vertex.id === attachment!.vertexId
                ? { ...vertex, x: operation.point.x, y: operation.point.y }
                : vertex
            ),
          } as BodyGeometry)
        : body.geometry;
  if (!validGeometry(geometry)) return bodyEditRefusal('invalid-command');
  return {
    ok: true,
    document: {
      ...document,
      bodies: document.bodies.map((item) => (item.id === bodyId ? { ...body, geometry } : item)),
      attachments: document.attachments.map((point) => {
        if (point.bodyId !== bodyId) return point;
        if (point.vertexId && geometry.kind !== 'circle') {
          const vertex = geometry.vertices.find((item) => item.id === point.vertexId);
          if (vertex) return { ...point, point: { x: vertex.x, y: vertex.y } };
        }
        return operation.kind === 'attachment-position' && point.id === attachment!.id
          ? { ...point, point: operation.point }
          : point;
      }),
    },
  };
}
