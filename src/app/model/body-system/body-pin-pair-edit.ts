import { BodyDocument } from './body-document';
import { BodyEditRefusal } from './body-edit-types';
import { AttachmentId, JointId, JunctionId, compareRecordIds } from './body-id';
import { BodyJoint, RevoluteJoint } from './joint-record';
import { changeBodyJointKind } from './body-joint-kind-edit';
import { localToWorld } from './body-frame';
import { bodyEditRefusal } from './joint-permission';

export interface BodyPinPairOperation {
  readonly kind: 'pin-pair-kind';
  readonly junctionId: JunctionId;
  readonly a: AttachmentId;
  readonly b: AttachmentId;
  readonly jointKind: BodyJoint['kind'];
}

/** A pin's spanning-tree hub is bookkeeping, not a restriction on which two members can be welded. */
export function editBodyPinPair(
  source: BodyDocument,
  operation: BodyPinPairOperation,
  id: string
): { ok: true; document: BodyDocument } | BodyEditRefusal {
  const pin = source.junctions.find((p) => p.id === operation.junctionId);
  if (!pin) return bodyEditRefusal('missing-target');
  if (
    operation.a === operation.b ||
    !pin.attachments.includes(operation.a) ||
    !pin.attachments.includes(operation.b)
  )
    return bodyEditRefusal('invalid-command');
  const a = source.attachments.find((p) => p.id === operation.a)!,
    b = source.attachments.find((p) => p.id === operation.b)!;
  const edges = source.joints.filter((j) => pin.joints.includes(j.id));
  let joint = edges.find(
    (j) =>
      [j.frameA.attachmentId, j.frameB.attachmentId].includes(a.id) &&
      [j.frameA.attachmentId, j.frameB.attachmentId].includes(b.id)
  );
  let document = source;
  if (!joint) {
    const path = findPinPath(edges, a.id, b.id);
    if (!path) return bodyEditRefusal('invalid-document');
    const removable = path
      .filter(
        (j) =>
          j.kind === 'revolute' &&
          !source.drivers.some((d) => d.coordinate.jointId === j.id) &&
          !source.limits.some((l) => l.coordinate.jointId === j.id)
      )
      .sort((a, b) => compareRecordIds(a.id, b.id))[0];
    if (!removable) {
      if (path.every((edge) => edge.kind === 'weld'))
        return operation.jointKind === 'weld'
          ? { ok: true, document: source }
          : bodyEditRefusal('indirect-weld');
      return bodyEditRefusal('coordinate-in-use');
    }
    const bodyA = source.bodies.find((body) => body.id === a.bodyId)!,
      bodyB = source.bodies.find((body) => body.id === b.bodyId)!;
    const added: RevoluteJoint = {
      id: `${id}:pair` as JointId,
      kind: 'revolute',
      label: '',
      bodyA: a.bodyId,
      bodyB: b.bodyId,
      frameA: { attachmentId: a.id, angle: 0 },
      frameB: { attachmentId: b.id, angle: 0 },
      angleZero: bodyB.pose.angle - bodyA.pose.angle,
    };
    joint = added;
    document = {
      ...source,
      joints: [...source.joints.filter((j) => j.id !== removable.id), added],
      junctions: source.junctions.map((p) =>
        p.id === pin.id
          ? { ...p, joints: [...p.joints.filter((j) => j !== removable.id), added.id] }
          : p
      ),
    };
  }
  const point = localToWorld(source.bodies.find((body) => body.id === b.bodyId)!.pose, b.point);
  return changeBodyJointKind(
    document,
    {
      kind: 'joint-kind',
      jointId: joint.id,
      jointKind: operation.jointKind,
      ...(joint.kind === 'weld' || operation.jointKind === 'revolute' ? { worldPoint: point } : {}),
    },
    id
  );
}

function findPinPath(
  edges: readonly BodyJoint[],
  from: AttachmentId,
  to: AttachmentId
): BodyJoint[] | undefined {
  const queue = [{ at: from, path: [] as BodyJoint[] }],
    visited = new Set<AttachmentId>([from]);
  while (queue.length) {
    const next = queue.shift()!;
    if (next.at === to) return next.path;
    for (const edge of edges) {
      const a = edge.frameA.attachmentId,
        b = edge.frameB.attachmentId;
      const neighbor = a === next.at ? b : b === next.at ? a : undefined;
      if (neighbor && !visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push({ at: neighbor, path: [...next.path, edge] });
      }
    }
  }
  return undefined;
}
