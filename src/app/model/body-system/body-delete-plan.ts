import { retainSynthesisOwnership } from './body-project-edit';
import { BodyDocument } from './body-document';
import { BodyDeleteTarget, BodyEditRefusal } from './body-edit-types';
import { AssemblyId, AttachmentId, BodyId, ForceId, JointId, JunctionId, WORLD } from './body-id';
import { bodyEditRefusal, refuseNativeJointChange } from './joint-permission';
import { compileWeldFrames } from './weld-frames';
import { retainPinConnections } from './body-pin-lifecycle';

/** Collect the whole cascade against one snapshot; enumeration never changes what is owned. */
export function deleteBodyRecords(
  document: BodyDocument,
  targets: readonly BodyDeleteTarget[],
  commandId: string
): { readonly ok: true; readonly document: BodyDocument } | BodyEditRefusal {
  const bodies = new Set<BodyId>(),
    attachments = new Set<AttachmentId>(),
    joints = new Set<JointId>();
  const forces = new Set<ForceId>(),
    assemblies = new Set<AssemblyId>(),
    junctions = new Set<JunctionId>();
  const frames = compileWeldFrames(document);
  if (!frames.ok) return bodyEditRefusal('invalid-document');
  for (const target of targets) {
    switch (target.kind) {
      case 'body': {
        if (target.id === WORLD) return bodyEditRefusal('immutable-world', [target]);
        if (!document.bodies.some((body) => body.id === target.id))
          return bodyEditRefusal('missing-target', [target]);
        if (
          document.assemblies.some(
            (assembly) => assembly.barrel === target.id || assembly.rod === target.id
          )
        )
          return bodyEditRefusal('assembly-member', [target]);
        bodies.add(target.id);
        break;
      }
      case 'group': {
        const group = frames.groupOf.get(target.members[0]);
        if (
          !group ||
          target.members.length !== group.members.size ||
          new Set(target.members).size !== group.members.size ||
          target.members.some((id) => !group.members.has(id))
        )
          return bodyEditRefusal('missing-target', [target]);
        for (const id of group.members.keys()) if (id !== WORLD) bodies.add(id);
        break;
      }
      case 'assembly': {
        const assembly = document.assemblies.find((item) => item.id === target.id);
        if (!assembly) return bodyEditRefusal('missing-target', [target]);
        assemblies.add(assembly.id);
        break;
      }
      case 'joint': {
        const refused = refuseNativeJointChange(document, target.id);
        if (refused) return refused;
        joints.add(target.id);
        break;
      }
      case 'attachment': {
        if (!document.attachments.some((point) => point.id === target.id))
          return bodyEditRefusal('missing-target', [target]);
        if (
          document.assemblies.some(
            (assembly) => assembly.barrelMount === target.id || assembly.rodMount === target.id
          )
        )
          return bodyEditRefusal('assembly-member', [target]);
        attachments.add(target.id);
        break;
      }
      case 'force':
        if (!document.forces.some((force) => force.id === target.id))
          return bodyEditRefusal('missing-target', [target]);
        forces.add(target.id);
        break;
      case 'junction': {
        const pin = document.junctions.find((item) => item.id === target.id);
        if (!pin) return bodyEditRefusal('missing-target', [target]);
        junctions.add(pin.id);
        pin.joints.forEach((id) => joints.add(id));
        break;
      }
    }
  }
  const disconnected = new Set(joints);
  for (const assembly of document.assemblies)
    if (assemblies.has(assembly.id) || bodies.has(assembly.barrel) || bodies.has(assembly.rod)) {
      assemblies.add(assembly.id);
      bodies.add(assembly.barrel);
      bodies.add(assembly.rod);
    }
  document.attachments.forEach((point) => {
    if (bodies.has(point.bodyId)) attachments.add(point.id);
  });
  for (const joint of document.joints)
    if (
      bodies.has(joint.bodyA) ||
      bodies.has(joint.bodyB) ||
      attachments.has(joint.frameA.attachmentId) ||
      attachments.has(joint.frameB.attachmentId) ||
      ('guideDisplay' in joint &&
        joint.guideDisplay &&
        attachments.has(joint.guideDisplay.frame.attachmentId))
    )
      joints.add(joint.id);
  for (const assembly of document.assemblies)
    if (!assemblies.has(assembly.id) && joints.has(assembly.internalJoint))
      return bodyEditRefusal('assembly-interior', [{ kind: 'joint', id: assembly.internalJoint }]);
  for (const force of document.forces) {
    if (bodies.has(force.bodyId)) forces.add(force.id);
    if (
      !forces.has(force.id) &&
      force.legacyGroupScope?.members.some((member) => bodies.has(member.bodyId))
    )
      return bodyEditRefusal('ambiguous-load-owner', [{ kind: 'force', id: force.id }]);
  }
  const candidate: BodyDocument = {
    ...document,
    bodies: document.bodies.filter((body) => !bodies.has(body.id)),
    attachments: document.attachments.filter((point) => !attachments.has(point.id)),
    joints: document.joints.filter((joint) => !joints.has(joint.id)),
    forces: document.forces.filter((force) => !forces.has(force.id)),
    assemblies: document.assemblies.filter((assembly) => !assemblies.has(assembly.id)),
    drivers: document.drivers.filter((driver) => !joints.has(driver.coordinate.jointId)),
    limits: document.limits.filter((limit) => !joints.has(limit.coordinate.jointId)),
    holds: document.holds.filter(
      (hold) => !bodies.has(hold.bodyId) && !attachments.has(hold.from) && !attachments.has(hold.to)
    ),
    locks: document.locks.filter((id) => !attachments.has(id)),
  };
  return {
    ok: true,
    document: retainSynthesisOwnership(document, {
      ...candidate,
      ...retainPinConnections(document, candidate, junctions, commandId, disconnected),
    }),
  };
}
