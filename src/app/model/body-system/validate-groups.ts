import { ValidationContext } from './validation-context';
import { finitePoint, relativePose } from './body-frame';
import { compileWeldGroups } from './weld-groups';
import { compileWeldFrames, sameTransform } from './weld-frames';

export function validateGroups(context: ValidationContext): void {
  const { document, issue } = context;
  const annotationKeys = new Set<string>();
  for (const group of document.groups) {
    const key = JSON.stringify([...group.members].sort());
    if (
      annotationKeys.has(key) ||
      new Set(group.members).size !== group.members.length ||
      !group.members.includes(group.frameBody)
    )
      issue('invalid-group-annotation', 'groups');
    annotationKeys.add(key);
    if (group.mass) {
      const { mass, inertia, center } = group.mass;
      if (
        (mass !== undefined && (!Number.isFinite(mass) || mass < 0)) ||
        (inertia !== undefined && (!Number.isFinite(inertia) || inertia < 0)) ||
        (center && (!finitePoint(center.point) || !['body', 'grid'].includes(center.editAnchor)))
      )
        issue('invalid-group-mass', 'groups');
    }
  }
  const compiled = compileWeldFrames(document);
  if (!compiled.ok) {
    issue(compiled.code, `joints.${compiled.jointId}`);
    return;
  }
  for (const group of document.groups) {
    const actual = compiled.groupOf.get(group.frameBody);
    if (
      !actual ||
      group.members.length !== actual.members.size ||
      new Set(group.members).size !== group.members.length ||
      group.members.some((id) => !actual.members.has(id))
    )
      issue('invalid-group-annotation', 'groups');
  }
  for (const force of document.forces) {
    const scope = force.legacyGroupScope;
    if (!scope) continue;
    const group = compiled.groupOf.get(force.bodyId);
    if (!group || scope.members.some((member) => compiled.groupOf.get(member.bodyId) !== group)) {
      issue('split-load-scope', `forces.${force.id}`);
    } else if (
      scope.members.some(
        (member) =>
          !sameTransform(
            member.poseInReference,
            relativePose(group.members.get(force.bodyId)!, group.members.get(member.bodyId)!)
          )
      )
    ) {
      issue('load-scope-changed', `forces.${force.id}`);
    }
  }
  const properties = compileWeldGroups(document);
  if (!properties.ok && properties.code === 'invalid-properties')
    issue(properties.code, `bodies.${properties.bodyId}`);
}
