import { BodyDocument } from './body-document';
import { AttachmentId, BodyId, WORLD } from './body-id';
import { WeldFrameGroup } from './weld-frames';

/** WORLD is a boundary, never a bridge to another independently edited machine. */
export function pointEditReach(
  document: BodyDocument,
  target: AttachmentId,
  groupOf: ReadonlyMap<BodyId, WeldFrameGroup>
) {
  const attachments = new Map(document.attachments.map((p) => [p.id, p]));
  const asked = new Set<AttachmentId>([target]);
  let expanding = true;
  while (expanding) {
    const size = asked.size;
    for (const joint of document.joints)
      if (joint.kind === 'revolute') {
        const a = joint.frameA.attachmentId,
          b = joint.frameB.attachmentId;
        if (asked.has(a) || asked.has(b)) {
          asked.add(a);
          asked.add(b);
        }
      }
    expanding = asked.size !== size;
  }
  const editable = new Set<AttachmentId>(asked);
  let changed = true;
  while (changed) {
    const size = editable.size;
    for (const joint of document.joints) {
      if (joint.kind !== 'revolute') continue;
      const a = joint.frameA.attachmentId,
        b = joint.frameB.attachmentId;
      if (editable.has(a) || editable.has(b)) {
        editable.add(a);
        editable.add(b);
      }
    }
    for (const hold of document.holds)
      if (editable.has(hold.from) || editable.has(hold.to)) {
        editable.add(hold.from);
        editable.add(hold.to);
      }
    const vertices = new Set([...editable].flatMap((id) => attachments.get(id)?.vertexId ?? []));
    for (const p of attachments.values())
      if (p.vertexId && vertices.has(p.vertexId)) editable.add(p.id);
    changed = editable.size !== size;
  }
  const reached = new Set<BodyId>();
  for (const id of editable) {
    const owner = attachments.get(id)!.bodyId;
    if (owner !== WORLD) reached.add(owner);
  }
  changed = true;
  while (changed) {
    const size = reached.size;
    for (const joint of document.joints) {
      if (!reached.has(joint.bodyA) && !reached.has(joint.bodyB)) continue;
      if (joint.bodyA !== WORLD) reached.add(joint.bodyA);
      if (joint.bodyB !== WORLD) reached.add(joint.bodyB);
    }
    changed = size !== reached.size;
  }
  for (const id of [...editable]) {
    const p = attachments.get(id)!,
      body = document.bodies.find((b) => b.id === p.bodyId)!;
    const connected = document.joints.some(
      (j) => j.frameA.attachmentId === id || j.frameB.attachmentId === id
    );
    const heldBar =
      body.kind === 'material' &&
      body.geometry.kind === 'bar' &&
      document.holds.some(
        (hold) =>
          hold.bodyId === body.id &&
          hold.length !== undefined &&
          new Set([attachments.get(hold.from)?.vertexId, attachments.get(hold.to)?.vertexId])
            .size === 2 &&
          body.geometry.kind === 'bar' &&
          body.geometry.vertices.every((v) =>
            [attachments.get(hold.from)?.vertexId, attachments.get(hold.to)?.vertexId].includes(
              v.id
            )
          )
      );
    const intrinsic = document.assemblies.some((c) => {
      if (c.barrel !== body.id && c.rod !== body.id) return false;
      const internal = document.joints.find((j) => j.id === c.internalJoint)!;
      return (
        !!p.vertexId ||
        [
          c.barrelMount,
          c.rodMount,
          internal.frameA.attachmentId,
          internal.frameB.attachmentId,
        ].includes(id)
      );
    });
    if (
      (body.kind === 'world' && !asked.has(id)) ||
      (body.kind === 'material' && body.locked) ||
      (body.kind === 'material' &&
        groupOf.get(body.id)!.members.size > 1 &&
        (p.vertexId || connected)) ||
      document.locks.includes(id) ||
      intrinsic ||
      (heldBar && !!p.vertexId)
    )
      editable.delete(id);
  }
  // Every marker bound to a locked vertex is fixed, not a second route around its lock.
  const frozenVertices = new Set(
    document.attachments
      .filter((p) => document.locks.includes(p.id))
      .flatMap((p) => p.vertexId ?? [])
  );
  for (const id of editable)
    if (frozenVertices.has(attachments.get(id)!.vertexId!)) editable.delete(id);
  return { editable, reached };
}
