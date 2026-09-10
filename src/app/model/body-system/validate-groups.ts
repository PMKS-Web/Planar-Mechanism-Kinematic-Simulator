import { ValidationContext } from './validation-context';
import { finitePoint } from './body-frame';
import { compileWeldGroups } from './weld-groups';

export function validateGroups(context: ValidationContext): void {
  const { document, issue, issues } = context;
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
  if (issues.length) return;
  const compiled = compileWeldGroups(document);
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
  for (const force of document.forces)
    if (force.legacyGroupScope) {
      const group = compiled.groupOf.get(force.bodyId)!;
      if (force.legacyGroupScope.some((id) => compiled.groupOf.get(id) !== group))
        issue('split-load-scope', `forces.${force.id}`);
    }
}
