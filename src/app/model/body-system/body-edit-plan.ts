import { retainPinConnections } from './body-pin-lifecycle';
import { menuRefusal, refusalFor } from '../edit-permission';
import { BodyDocument } from './body-document';
import { BodyEditCommand, BodyEditContext, BodyEditResult } from './body-edit-types';
import { bodyEditRefusal } from './joint-permission';
import { deleteBodyRecords } from './body-delete-plan';
import { bodyGroupLineage } from './body-group-lineage';
import { changeBodyJointKind } from './body-joint-kind-edit';
import { bodyEditEffects, retainBodySelection } from './body-edit-effects';
import { validateBodyEditDocument } from './body-edit-validation';
import { snapshotCopy } from './sample-results';
import { BodyId } from './body-id';

const TABLES = [
  'bodies',
  'attachments',
  'joints',
  'junctions',
  'assemblies',
  'drivers',
  'limits',
  'forces',
  'groups',
  'holds',
  'locks',
] as const;

/** One candidate and one final validation govern previews, bulk actions and commit alike. */
export function planBodyEdit(
  document: BodyDocument,
  revision: number,
  command: BodyEditCommand,
  context: BodyEditContext
): BodyEditResult {
  if (
    !Number.isInteger(revision) ||
    revision < 0 ||
    !command.id ||
    command.id.length > 64 ||
    command.operations.length > 1000
  )
    return bodyEditRefusal('invalid-command');
  const capture = command.operations.some(
    (operation) => operation.kind === 'insert' || operation.kind === 'joint-kind'
  );
  const permission = capture
    ? menuRefusal(context.state, 'start')
    : refusalFor('structure', context.state);
  if (permission)
    return { ok: false, code: 'permission', message: permission.long, targets: [], permission };
  // The source is copied once so a returned preview cannot observe later caller mutations.
  const source = snapshotCopy(document);
  const invalid = validateBodyEditDocument(source);
  if (invalid) return invalid;
  const reset = new Set<BodyId>();
  for (const operation of command.operations)
    if (operation.kind === 'reset-group-mass') {
      if (!source.bodies.some((body) => body.id === operation.member))
        return bodyEditRefusal('missing-target');
      reset.add(operation.member);
    }
  const lineageSource = {
    ...source,
    groups: source.groups.map((group) => {
      if (!group.members.some((id) => reset.has(id))) return group;
      const { mass, ...retained } = group;
      return retained;
    }),
  };
  let candidate: BodyDocument = lineageSource;
  // Creation and deletion must see the intended body set, independent of command enumeration.
  for (const operation of command.operations)
    if (operation.kind === 'insert') {
      if (
        Object.keys(operation.records).some(
          (key) => !TABLES.includes(key as (typeof TABLES)[number])
        )
      )
        return bodyEditRefusal('invalid-command');
      candidate = {
        ...candidate,
        ...Object.fromEntries(
          TABLES.map((table) => [table, [...candidate[table], ...(operation.records[table] ?? [])]])
        ),
      };
    }
  if (
    command.targetGroupMember &&
    !candidate.bodies.some((body) => body.id === command.targetGroupMember)
  )
    return bodyEditRefusal('missing-target', [{ kind: 'body', id: command.targetGroupMember }]);
  const pinSource = candidate;
  for (const [index, operation] of command.operations.entries()) {
    if (operation.kind === 'joint-kind') {
      const changed = changeBodyJointKind(candidate, operation, `${command.id}:${index}`);
      if (!changed.ok) return changed;
      candidate = changed.document;
    } else if (!['insert', 'delete', 'reset-group-mass'].includes(operation.kind))
      return bodyEditRefusal('invalid-command');
  }
  if (command.operations.some((operation) => operation.kind === 'joint-kind'))
    candidate = {
      ...candidate,
      ...retainPinConnections(pinSource, candidate, new Set(), `${command.id}:kind`),
    };
  const targets = command.operations.flatMap((operation) =>
    operation.kind === 'delete' ? operation.targets : []
  );
  if (targets.length) {
    const deletion = deleteBodyRecords(candidate, targets, command.id);
    if (!deletion.ok) return deletion;
    candidate = deletion.document;
  }
  const lineage = bodyGroupLineage(lineageSource, candidate, command.targetGroupMember);
  if (!lineage.ok) return lineage;
  candidate = { ...candidate, groups: lineage.groups };
  const refused = validateBodyEditDocument(candidate);
  if (refused) return refused;
  const effects = bodyEditEffects(source, candidate);
  return snapshotCopy({
    ok: true,
    baseRevision: revision,
    command,
    document: candidate,
    changed: effects.added.length + effects.removed.length + effects.changed.length > 0,
    effects,
    selection: retainBodySelection(candidate, context.selection),
  });
}
