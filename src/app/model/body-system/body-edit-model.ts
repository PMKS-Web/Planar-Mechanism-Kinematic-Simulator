import { BodyDocument } from './body-document';
import { AttachmentId, BodyId, compareRecordIds } from './body-id';
import { compose, localToWorld, Point, Pose, relativePose } from './body-frame';
import { BodyGeometryOperation } from './body-geometry-edit';
import { geometryCenter } from './body-center-geometry';
import { WeldFrameGroup } from './weld-frames';
import { pointEditReach } from './body-point-reach';
import {
  EditPoint,
  EditScalar,
  editAdd,
  editConstant,
  editVariable,
  editRotate,
  editPointAdd,
} from './body-edit-scalar';

export interface BodyEditModel {
  readonly document: BodyDocument;
  readonly target: AttachmentId;
  readonly origin: Point;
  readonly length: number;
  readonly width: number;
  readonly reached: ReadonlySet<BodyId>;
  readonly angularColumns: readonly number[];
  at(values: readonly number[]): {
    point(id: AttachmentId): EditPoint;
    materialPoint(body: BodyId, point: Point): EditPoint;
    angle(body: BodyId): EditScalar;
    constant(value: number): EditScalar;
  };
  operations(values: readonly number[]): BodyGeometryOperation[];
}
export function createBodyEditModel(
  document: BodyDocument,
  target: AttachmentId,
  groups: readonly WeldFrameGroup[],
  groupOf: ReadonlyMap<BodyId, WeldFrameGroup>,
  options: { readonly rigid?: boolean; readonly fixedBodies?: ReadonlySet<BodyId> } = {}
): BodyEditModel {
  const anchors = new Map(document.attachments.map((p) => [p.id, p]));
  const bodies = new Map(document.bodies.map((b) => [b.id, b]));
  const start = anchors.get(target)!;
  const origin = localToWorld(bodies.get(start.bodyId)!.pose, start.point);
  const { editable, reached } = pointEditReach(document, target, groupOf);
  if (options.rigid) editable.clear();
  const fixedFrames = new Set([...editable].map((id) => anchors.get(id)!.bodyId));
  let length = 0;
  for (const id of reached) {
    const body = bodies.get(id)!;
    if (body.kind === 'world') continue;
    const geometry = body.geometry;
    if (geometry.kind === 'circle') length = Math.max(length, geometry.radius * 2);
    else
      for (let i = 0; i < geometry.vertices.length; i++)
        for (let j = i + 1; j < geometry.vertices.length; j++)
          length = Math.max(
            length,
            Math.hypot(
              geometry.vertices[j].x - geometry.vertices[i].x,
              geometry.vertices[j].y - geometry.vertices[i].y
            )
          );
  }
  if (!reached.size) length = 1;
  if (!(length > 0) || !Number.isFinite(length)) throw new Error('Invalid editing scale');
  let width = 0;
  const points = new Map<AttachmentId, number>(),
    bindings = new Map<string, number>();
  for (const id of [...editable].sort(compareRecordIds)) {
    const p = anchors.get(id)!,
      key = p.vertexId ? `vertex:${p.vertexId}` : `point:${id}`;
    if (!bindings.has(key)) {
      bindings.set(key, width);
      width += 2;
    }
    points.set(id, bindings.get(key)!);
  }
  const frames = new Map<
    BodyId,
    { column: number; pose: Pose; members: ReadonlyMap<BodyId, Pose> }
  >();
  for (const group of groups) {
    if (
      group.fixed ||
      ![...group.members.keys()].some((id) => reached.has(id)) ||
      [...group.members.keys()].some(
        (id) =>
          fixedFrames.has(id) ||
          options.fixedBodies?.has(id) ||
          (bodies.get(id)?.kind === 'material' && (bodies.get(id) as { locked?: boolean }).locked)
      )
    )
      continue;
    const centers = [...group.members.keys()].flatMap((id) => {
      const b = bodies.get(id)!;
      return b.kind === 'material' ? [localToWorld(b.pose, geometryCenter(b.geometry))] : [];
    });
    // A physical centroid keeps the least-motion metric independent of the arbitrary material origin.
    const base = centers[0];
    const pose = {
      x: base.x + centers.reduce((sum, p) => sum + (p.x - base.x), 0) / centers.length,
      y: base.y + centers.reduce((sum, p) => sum + (p.y - base.y), 0) / centers.length,
      angle: group.pose.angle,
    };
    const members = new Map(
      [...group.members.keys()].map((id) => [id, relativePose(pose, bodies.get(id)!.pose)])
    );
    const frame = { column: width, pose, members };
    width += 3;
    for (const id of group.members.keys()) frames.set(id, frame);
  }
  const angularColumns = [...new Set([...frames.values()].map((f) => f.column + 2))];
  const at = (values: readonly number[]) => {
    const constant = (v: number) => editConstant(v, width);
    const variable = (column: number) => editVariable(values[column], width, column);
    const cp = (p: Point) => ({ x: constant(p.x / length), y: constant(p.y / length) });
    const angle = (id: BodyId) => {
      const f = frames.get(id);
      return f
        ? editAdd(constant(f.pose.angle + f.members.get(id)!.angle), variable(f.column + 2))
        : constant(bodies.get(id)!.pose.angle);
    };
    const place = (id: BodyId, local: EditPoint): EditPoint => {
      const f = frames.get(id),
        body = bodies.get(id)!;
      if (!f)
        return editPointAdd(
          cp({ x: body.pose.x - origin.x, y: body.pose.y - origin.y }),
          editRotate(local, angle(id))
        );
      const member = f.members.get(id)!;
      const offset = editPointAdd(cp(member), editRotate(local, constant(member.angle)));
      return editPointAdd(
        {
          x: editAdd(constant((f.pose.x - origin.x) / length), variable(f.column)),
          y: editAdd(constant((f.pose.y - origin.y) / length), variable(f.column + 1)),
        },
        editRotate(offset, editAdd(constant(f.pose.angle), variable(f.column + 2)))
      );
    };
    return {
      constant,
      angle,
      materialPoint: (id: BodyId, p: Point) => place(id, cp(p)),
      point: (id: AttachmentId) => {
        const p = anchors.get(id)!,
          column = points.get(id);
        let local = cp(p.point);
        if (column !== undefined)
          local = editPointAdd(local, { x: variable(column), y: variable(column + 1) });
        return place(p.bodyId, local);
      },
    };
  };
  return {
    document,
    target,
    origin,
    length,
    width,
    reached,
    angularColumns,
    at,
    operations: (values) => {
      const operations: BodyGeometryOperation[] = [];
      const emitted = new Set<number>();
      for (const [id, column] of points) {
        if (emitted.has(column) || (values[column] === 0 && values[column + 1] === 0)) continue;
        emitted.add(column);
        const p = anchors.get(id)!;
        operations.push({
          kind: 'attachment-position',
          attachmentId: id,
          point: {
            x: p.point.x + values[column] * length,
            y: p.point.y + values[column + 1] * length,
          },
        });
      }
      const poses = [...frames].flatMap(([bodyId, f]) => {
        const c = f.column;
        return values[c] === 0 && values[c + 1] === 0 && values[c + 2] === 0
          ? []
          : [
              {
                bodyId,
                pose: compose(
                  {
                    x: f.pose.x + values[c] * length,
                    y: f.pose.y + values[c + 1] * length,
                    angle: f.pose.angle + values[c + 2],
                  },
                  f.members.get(bodyId)!
                ),
              },
            ];
      });
      if (poses.length) operations.push({ kind: 'body-poses', poses });
      return operations;
    },
  };
}
