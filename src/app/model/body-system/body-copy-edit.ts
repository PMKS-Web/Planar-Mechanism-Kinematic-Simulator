import { compileWeldFrames } from './weld-frames';
import { bodyGroupPresentation } from './body-group-presentation';
import { BodyDocument } from './body-document';
import { BodyEditRefusal, BodyInsertRecords } from './body-edit-types';
import { BodyId, WORLD } from './body-id';
import { finitePoint, Point } from './body-frame';
import { retainPinConnections } from './body-pin-lifecycle';
import { bodyEditRefusal } from './joint-permission';
import { bodyCopyIds, BodyCopyIds } from './body-copy-ids';
import { copyBodyRecords } from './body-copy-records';

export interface BodyCopyOperation {
  readonly kind: 'copy-bodies';
  readonly bodyIds: readonly BodyId[];
  readonly offset: Point;
  /** Ground is a deliberate copied connection, never an accidental reference back into the source drawing. */
  readonly includeGround: boolean;
}
type CopyResult =
  | { readonly ok: true; readonly records: BodyInsertRecords; readonly ids: BodyCopyIds }
  | BodyEditRefusal;

/** Copy the selected material, closing cylinder ownership but not absorbing unselected welded neighbors. */
export function planBodyCopy(
  document: BodyDocument,
  operation: BodyCopyOperation,
  commandId: string
): CopyResult {
  if (
    !finitePoint(operation.offset) ||
    typeof operation.includeGround !== 'boolean' ||
    !operation.bodyIds.length
  )
    return bodyEditRefusal('invalid-command');
  if (operation.bodyIds.includes(WORLD)) return bodyEditRefusal('immutable-world');
  if (operation.bodyIds.some((id) => !document.bodies.some((body) => body.id === id)))
    return bodyEditRefusal('missing-target');
  const members = new Set(operation.bodyIds);
  for (const assembly of document.assemblies)
    if (members.has(assembly.barrel) || members.has(assembly.rod)) {
      members.add(assembly.barrel);
      members.add(assembly.rod);
    }
  const owns = (id: BodyId) => members.has(id) || (operation.includeGround && id === WORLD);
  const joints = document.joints.filter((joint) => owns(joint.bodyA) && owns(joint.bodyB));
  const groundAnchors = new Set(
    joints.flatMap((joint) => [
      joint.frameA.attachmentId,
      joint.frameB.attachmentId,
      ...('guideDisplay' in joint && joint.guideDisplay
        ? [joint.guideDisplay.frame.attachmentId]
        : []),
    ])
  );
  // A pin's old hub is an implementation choice. Selected riders remain connected even if that hub is absent.
  if (operation.includeGround)
    for (const pin of document.junctions)
      if (
        pin.attachments.some((id) =>
          document.attachments.some((point) => point.id === id && members.has(point.bodyId))
        )
      )
        for (const id of pin.attachments) groundAnchors.add(id);
  const attachments = document.attachments.filter(
    (point) =>
      members.has(point.bodyId) ||
      (operation.includeGround && point.bodyId === WORLD && groundAnchors.has(point.id))
  );
  for (const group of document.groups)
    if (
      group.members.some((id) => members.has(id)) &&
      (!group.members.every(owns) || (operation.includeGround && group.members.includes(WORLD))) &&
      group.mass &&
      Object.values(group.mass).some((value) => value !== undefined)
    )
      return bodyEditRefusal('aggregate-properties', [{ kind: 'group', members: group.members }]);
  const forces = document.forces.filter((force) => members.has(force.bodyId));
  for (const force of forces)
    if (force.legacyGroupScope?.members.some((member) => !owns(member.bodyId)))
      return bodyEditRefusal('ambiguous-load-owner', [{ kind: 'force', id: force.id }]);
  const base: BodyDocument = {
    ...document,
    bodies: document.bodies.filter((body) => body.id === WORLD || members.has(body.id)),
    attachments,
    joints,
    junctions: [],
  };
  const connections = retainPinConnections(document, base, new Set(), `${commandId}:copy`);
  const jointIds = new Set(connections.joints.map((joint) => joint.id));
  const attachmentIds = new Set(attachments.map((point) => point.id));
  const frames = compileWeldFrames(document);
  if (!frames.ok) return bodyEditRefusal('invalid-document');
  // Fresh opaque IDs must not choose another member's label or paint as the copied group's fallback.
  const groups = frames.groups
    .filter(
      (group) =>
        (group.members.size > 1 ||
          document.groups.some((annotation) => annotation.members.includes(group.frameBody))) &&
        !group.members.has(WORLD) &&
        [...group.members.keys()].every((id) => members.has(id))
    )
    .map(
      (group) =>
        document.groups.find((annotation) => annotation.members.includes(group.frameBody)) ?? {
          members: [...group.members.keys()],
          frameBody: group.frameBody,
          ...bodyGroupPresentation(document, group),
        }
    );
  const fragment: BodyDocument = {
    ...base,
    ...connections,
    assemblies: document.assemblies.filter((assembly) => members.has(assembly.barrel)),
    drivers: document.drivers.filter((driver) => jointIds.has(driver.coordinate.jointId)),
    limits: document.limits.filter((limit) => jointIds.has(limit.coordinate.jointId)),
    forces,
    groups,
    holds: document.holds.filter((hold) => members.has(hold.bodyId)),
    locks: document.locks.filter((id) => attachmentIds.has(id)),
  };
  try {
    const ids = bodyCopyIds(fragment, commandId);
    return { ok: true, ids, records: copyBodyRecords(fragment, ids, operation.offset) };
  } catch {
    return bodyEditRefusal('invalid-command');
  }
}
