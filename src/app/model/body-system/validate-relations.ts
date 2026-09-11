import { ValidationContext } from './validation-context';
import { BodyId } from './body-id';
import { finitePoint, finitePose } from './body-frame';

export function validateLoads(context: ValidationContext): void {
  const { document, bodies, issue } = context;
  for (const force of document.forces) {
    const path = `forces.${force.id}`;
    if (bodies.get(force.bodyId)?.kind !== 'material') issue('missing-material-owner', path);
    if (!finitePoint(force.point) || !finitePoint(force.vector) || !Number.isFinite(force.couple))
      issue('nonfinite-load', path);
    if (
      (force.locked !== undefined && typeof force.locked !== 'boolean') ||
      (force.presentation?.length !== undefined &&
        (!Number.isFinite(force.presentation.length) || force.presentation.length <= 0)) ||
      (force.presentation?.zeroAngle !== undefined &&
        !Number.isFinite(force.presentation.zeroAngle))
    )
      issue('invalid-load-presentation', path);
    if (!['world', 'body'].includes(force.frame)) issue('invalid-load-frame', path);
    if (
      force.legacyGroupScope &&
      (!force.legacyGroupScope.members.some((member) => member.bodyId === force.bodyId) ||
        new Set(force.legacyGroupScope.members.map((member) => member.bodyId)).size !==
          force.legacyGroupScope.members.length ||
        force.legacyGroupScope.members.some(
          (member) =>
            bodies.get(member.bodyId)?.kind !== 'material' || !finitePose(member.poseInReference)
        ))
    )
      issue('invalid-load-scope', path);
  }
}

export function validateHolds(context: ValidationContext): void {
  const { document, anchors, issue } = context;
  for (const lock of document.locks)
    if (!anchors.has(lock)) issue('missing-lock-point', `locks.${lock}`);
  for (const hold of document.holds) {
    if (
      anchors.get(hold.from)?.bodyId !== hold.bodyId ||
      anchors.get(hold.to)?.bodyId !== hold.bodyId ||
      hold.from === hold.to
    )
      issue('invalid-hold-pair', `holds.${hold.bodyId}`);
    if (
      (hold.length !== undefined && (!Number.isFinite(hold.length) || hold.length <= 0)) ||
      (hold.angle !== undefined && !Number.isFinite(hold.angle))
    )
      issue('invalid-hold-value', `holds.${hold.bodyId}`);
  }
}

export function validatePinTrees(context: ValidationContext): void {
  const { document, anchors, joints, issue } = context;
  for (const junction of document.junctions) {
    const memberSet = new Set(junction.attachments);
    const ownerSet = new Set(junction.attachments.map((id) => anchors.get(id)?.bodyId));
    const reachable = new Set([junction.hub]);
    let valid =
      memberSet.has(junction.hub) &&
      memberSet.size >= 2 &&
      ownerSet.size === memberSet.size &&
      !ownerSet.has(undefined) &&
      memberSet.size === junction.attachments.length &&
      junction.joints.length === memberSet.size - 1 &&
      new Set(junction.joints).size === junction.joints.length;
    for (const id of junction.joints) {
      const joint = joints.get(id);
      if (
        !joint ||
        !['revolute', 'weld'].includes(joint.kind) ||
        !memberSet.has(joint.frameA.attachmentId) ||
        !memberSet.has(joint.frameB.attachmentId)
      )
        valid = false;
    }
    for (let pass = 0; pass < memberSet.size; pass++)
      for (const id of junction.joints) {
        const joint = joints.get(id);
        if (!joint) continue;
        if (reachable.has(joint.frameA.attachmentId)) reachable.add(joint.frameB.attachmentId);
        if (reachable.has(joint.frameB.attachmentId)) reachable.add(joint.frameA.attachmentId);
      }
    if (!valid || reachable.size !== memberSet.size)
      issue('invalid-pin-tree', `junctions.${junction.id}`);
  }
}

export function validateAssemblies(context: ValidationContext): void {
  const { document, bodies, anchors, joints, issue } = context;
  const assemblyMembers = new Set<BodyId>();
  for (const assembly of document.assemblies) {
    const internal = joints.get(assembly.internalJoint);
    const limit = document.limits.find((candidate) => candidate.id === assembly.strokeLimit);
    if (
      assembly.kind !== 'cylinder' ||
      assembly.barrel === assembly.rod ||
      internal?.kind !== 'prismatic' ||
      internal.bodyA !== assembly.barrel ||
      internal.bodyB !== assembly.rod ||
      anchors.get(assembly.barrelMount)?.bodyId !== assembly.barrel ||
      anchors.get(assembly.rodMount)?.bodyId !== assembly.rod ||
      limit?.coordinate.jointId !== internal?.id ||
      limit?.coordinate.coordinate !== 'travel' ||
      !Object.values(assembly.dimensions).every((v) => Number.isFinite(v) && v > 0) ||
      assembly.dimensions.rodDiameter >= assembly.dimensions.bore
    )
      issue('invalid-cylinder', `assemblies.${assembly.id}`);
    for (const id of [assembly.barrel, assembly.rod]) {
      if (bodies.get(id)?.kind !== 'material' || assemblyMembers.has(id))
        issue('invalid-assembly-owner', `assemblies.${assembly.id}`);
      assemblyMembers.add(id);
    }
  }
}
