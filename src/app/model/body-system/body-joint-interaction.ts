import { BodyDocument } from './body-document';
import { BodyEditCommand, BodyEditOperation, BodySelectionRef } from './body-edit-types';
import { BodyFactory } from './body-factory';
import { Point, localToWorld, worldToLocal } from './body-frame';
import { AttachmentId, BodyId, WORLD, newRecordId } from './body-id';
import { BodyJoint } from './joint-record';
import { compileWeldFrames } from './weld-frames';
import { createBodyCylinder } from './cylinder-factory';

export function nativeCommand(...operations: readonly BodyEditOperation[]): BodyEditCommand {
  return { id: newRecordId<'edit'>(), operations };
}

export function selectionBodies(
  document: BodyDocument,
  selection: readonly BodySelectionRef[]
): BodyId[] {
  return [
    ...new Set(
      selection.flatMap((target) => {
        switch (target.kind) {
          case 'body':
            return [target.id];
          case 'group':
            return [...target.members];
          case 'assembly': {
            const c = document.assemblies.find((c) => c.id === target.id);
            return c ? [c.barrel, c.rod] : [];
          }
          case 'attachment':
            return document.attachments.filter((a) => a.id === target.id).map((a) => a.bodyId);
          case 'force':
            return document.forces.filter((f) => f.id === target.id).map((f) => f.bodyId);
          case 'joint':
            return document.joints
              .filter((j) => j.id === target.id)
              .flatMap((j) => [j.bodyA, j.bodyB]);
          case 'junction': {
            const pin = document.junctions.find((p) => p.id === target.id);
            return document.attachments
              .filter((a) => pin?.attachments.includes(a.id))
              .map((a) => a.bodyId);
          }
        }
      })
    ),
  ].filter((id) => id !== WORLD);
}

export function selectionJoints(
  document: BodyDocument,
  target: BodySelectionRef | undefined
): readonly BodyJoint[] {
  if (target?.kind === 'joint') return document.joints.filter((j) => j.id === target.id);
  if (target?.kind === 'junction') {
    const pin = document.junctions.find((p) => p.id === target.id);
    return document.joints.filter((j) => pin?.joints.includes(j.id));
  }
  return [];
}

export function weldedSelection(document: BodyDocument, id: BodyId): BodySelectionRef {
  const frames = compileWeldFrames(document);
  const group = frames.ok ? frames.groupOf.get(id) : undefined;
  const members = group ? [...group.members.keys()].filter((member) => member !== WORLD) : [id];
  return members.length > 1 ? { kind: 'group', members } : { kind: 'body', id };
}

export function attachmentWorld(document: BodyDocument, id: AttachmentId): Point {
  const attachment = document.attachments.find((a) => a.id === id)!;
  return localToWorld(
    document.bodies.find((b) => b.id === attachment.bodyId)!.pose,
    attachment.point
  );
}

/** The complete insert is previewed as one edit; an attached member never inherits a neighbor's weld. */
export function createNativeMember(
  document: BodyDocument,
  kind: 'link' | 'cylinder',
  from: Point,
  to: Point,
  start?: BodyId,
  end?: BodyId
): BodyEditCommand {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const pose = { ...from, angle };
  let factory = new BodyFactory(document),
    first: BodyId,
    last: BodyId;
  if (kind === 'cylinder') {
    const result = createBodyCylinder(
      document,
      pose,
      {
        barrelLength: length / 1.25,
        rodLength: (length / 1.25) * 0.8,
        bore: document.settings.objectScale * 0.5,
        rodDiameter: document.settings.objectScale * 0.24,
        stroke: (length / 1.25) * 0.65,
      },
      length / 5
    );
    factory = new BodyFactory(result.document);
    first = result.assembly.barrel;
    last = result.assembly.rod;
  } else {
    first = factory.body(
      'Link',
      pose,
      [
        { x: 0, y: 0 },
        { x: length, y: 0 },
      ],
      document.settings.objectScale * 0.3
    );
    last = first;
    const body = factory.document.bodies.find((b) => b.id === first)!;
    if (body.kind === 'material' && body.geometry.kind === 'bar') {
      for (const vertex of body.geometry.vertices) factory.vertexAttachment(first, vertex.id);
    }
  }
  const connections: BodyEditOperation[] = [];
  const anchor = (bodyId: BodyId, point: Point) => {
    const body = factory.document.bodies.find((b) => b.id === bodyId)!;
    const local = worldToLocal(body.pose, point);
    const existing = factory.document.attachments.find(
      (a) => a.bodyId === bodyId && Math.hypot(a.point.x - local.x, a.point.y - local.y) < 1e-10
    );
    return existing?.id ?? factory.attachment(bodyId, local);
  };
  if (start && start !== first)
    connections.push({
      kind: 'connect-attachments',
      a: anchor(start, from),
      b: anchor(first, from),
    });
  if (end && end !== last)
    connections.push({ kind: 'connect-attachments', a: anchor(last, to), b: anchor(end, to) });
  const insert = insertedRecords(document, factory.document);
  return { ...insert, operations: [...insert.operations, ...connections] };
}

export function insertNativeAttachment(
  document: BodyDocument,
  bodyId: BodyId,
  point: Point
): BodyEditCommand {
  const factory = new BodyFactory(document);
  factory.attachment(
    bodyId,
    worldToLocal(document.bodies.find((b) => b.id === bodyId)!.pose, point),
    'Tracer Point'
  );
  return insertedRecords(document, factory.document);
}

export function insertNativeGround(
  document: BodyDocument,
  bodyId: BodyId,
  point: Point,
  kind: BodyJoint['kind'] = 'revolute',
  axis = 0
): BodyEditCommand {
  const factory = new BodyFactory(document);
  const a = factory.attachment(WORLD, point);
  const b = factory.attachment(
    bodyId,
    worldToLocal(document.bodies.find((b) => b.id === bodyId)!.pose, point)
  );
  factory.joint(kind, a, b, axis);
  return insertedRecords(document, factory.document);
}

export function insertedRecords(before: BodyDocument, after: BodyDocument): BodyEditCommand {
  return nativeCommand({
    kind: 'insert',
    records: {
      bodies: after.bodies.filter((b) => !before.bodies.some((old) => old.id === b.id)),
      attachments: after.attachments.filter(
        (a) => !before.attachments.some((old) => old.id === a.id)
      ),
      joints: after.joints.filter((j) => !before.joints.some((old) => old.id === j.id)),
      junctions: after.junctions.filter((j) => !before.junctions.some((old) => old.id === j.id)),
      assemblies: after.assemblies.filter((a) => !before.assemblies.some((old) => old.id === a.id)),
      limits: after.limits.filter((l) => !before.limits.some((old) => old.id === l.id)),
    },
  });
}
