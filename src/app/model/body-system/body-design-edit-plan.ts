import { editBodyDrag } from './body-drag-edit';
import { editBodyCylinderDimensions } from './body-cylinder-dimension-edit';
import { editBodyGuideAxis } from './body-guide-axis-edit';
import { editBodyCoordinate } from './body-coordinate-edit';
import {
  BODY_INSERT_TABLES as TABLES,
  insertBodyRecords,
  insertedBodySelection,
} from './body-insert-records';
import { BodyPropertyOperation } from './body-property-types';
import { planBodyPaste } from './body-paste-edit';
import { planBodyCopy } from './body-copy-edit';
import { editBodyPoint } from './body-point-edit';
import { convertBodyUnits } from './body-unit-edit';
import { editBodyDrive, isBodyDriveOperation } from './body-drive-edit';
import { editBodyGeometry, isBodyGeometryOperation } from './body-geometry-edit';
import { remapEditedCenters } from './body-center-edit';
import { validateBodyEditHolds } from './body-hold-validation';
import { retainCenterEditAnchors } from './body-center-anchor';
import { validateBodyEditLocks } from './body-lock-validation';
import { isBodyPropertyOperation, editBodyProperties } from './body-property-edit';
import { retainPinConnections } from './body-pin-lifecycle';
import { editBodyProject } from './body-project-edit';
import { BodyDocument } from './body-document';
import {
  BodyEditCommand,
  BodyEditContext,
  BodyEditResult,
  BodySelectionRef,
} from './body-edit-types';
import { bodyEditRefusal } from './joint-permission';
import { deleteBodyRecords } from './body-delete-plan';
import { bodyGroupLineage } from './body-group-lineage';
import { changeBodyJointKind } from './body-joint-kind-edit';
import { bodyEditEffects, retainBodySelection } from './body-edit-effects';
import { validateBodyEditDocument } from './body-edit-validation';
import { snapshotCopy } from './sample-results';
import { BodyId } from './body-id';

/** One candidate and one final validation govern previews, bulk actions and commit alike. */
export function planBodyDesignEdit(
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
  // The source is copied once so a returned preview cannot observe later caller mutations.
  const source = snapshotCopy(document);
  const invalid = validateBodyEditDocument(source);
  if (invalid) return invalid;
  const conversions = command.operations.filter((operation) => operation.kind === 'convert-units');
  if (conversions.length > 1) return bodyEditRefusal('invalid-command');
  const converted = conversions.length
    ? convertBodyUnits(source, conversions[0].units)
    : { ok: true as const, document: source };
  if (!converted.ok) return converted;
  // Every dimensional operand in a unit-changing batch uses the destination units, regardless of array order.
  const workingSource = converted.document;
  const reset = new Set<BodyId>();
  for (const operation of command.operations)
    if (operation.kind === 'reset-group-mass') {
      if (!source.bodies.some((body) => body.id === operation.member))
        return bodyEditRefusal('missing-target');
      reset.add(operation.member);
    }
  const lineageSource = {
    ...workingSource,
    groups: workingSource.groups.map((group) => {
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
      candidate = insertBodyRecords(candidate, operation.records);
    }
  if (
    command.targetGroupMember &&
    !candidate.bodies.some((body) => body.id === command.targetGroupMember)
  )
    return bodyEditRefusal('missing-target', [{ kind: 'body', id: command.targetGroupMember }]);
  let pinSource = candidate;
  const copiedSelection: BodySelectionRef[] = [];
  const copiedProperties: BodyPropertyOperation[] = [];
  for (const [index, operation] of command.operations.entries()) {
    if (operation.kind === 'copy-bodies' || operation.kind === 'paste-bodies') {
      const copied =
        operation.kind === 'copy-bodies'
          ? planBodyCopy(candidate, operation, `${command.id}:${index}`)
          : planBodyPaste(candidate, operation, `${command.id}:${index}`);
      if (!copied.ok) return copied;
      copiedSelection.push(...insertedBodySelection(copied.records));
      copiedProperties.push(...(copied.properties ?? []));
      candidate = insertBodyRecords(candidate, copied.records);
      pinSource = insertBodyRecords(pinSource, copied.records);
    } else if (operation.kind === 'joint-kind') {
      const changed = changeBodyJointKind(candidate, operation, `${command.id}:${index}`);
      if (!changed.ok) return changed;
      candidate = changed.document;
    } else if (isBodyDriveOperation(operation)) {
      const changed = editBodyDrive(candidate, operation, `${command.id}:${index}`);
      if (!changed.ok) return changed;
      candidate = changed.document;
    } else if (operation.kind === 'guide-axis' || operation.kind === 'guide-axes') {
      const changed = editBodyGuideAxis(candidate, operation);
      if (!changed.ok) return changed;
      candidate = changed.document;
    } else if (operation.kind === 'cylinder-dimensions') {
      const changed = editBodyCylinderDimensions(candidate, operation);
      if (!changed.ok) return changed;
      candidate = changed.document;
    } else if (operation.kind === 'move-coordinate') {
      const changed = editBodyCoordinate(candidate, operation);
      if (!changed.ok) return changed;
      candidate = changed.document;
    } else if (operation.kind === 'move-body') {
      const changed = editBodyDrag(candidate, operation);
      if (!changed.ok) return changed;
      candidate = changed.document;
    } else if (operation.kind === 'move-point') {
      const changed = editBodyPoint(candidate, operation);
      if (!changed.ok) return changed;
      candidate = changed.document;
    } else if (isBodyGeometryOperation(operation)) {
      const changed = editBodyGeometry(candidate, operation);
      if (!changed.ok) return changed;
      candidate = changed.document;
    } else if (operation.kind === 'project') candidate = editBodyProject(candidate, operation);
    else if (operation.kind === 'group-properties') continue;
    else if (isBodyPropertyOperation(operation)) {
      const changed = editBodyProperties(candidate, operation);
      if (!changed.ok) return changed;
      candidate = changed.document;
    } else if (!['insert', 'delete', 'reset-group-mass', 'convert-units'].includes(operation.kind))
      return bodyEditRefusal('invalid-command');
  }
  if (command.operations.some((operation) => operation.kind === 'joint-kind'))
    candidate = {
      ...candidate,
      ...retainPinConnections(pinSource, candidate, new Set(), `${command.id}:kind`),
    };
  const centered = remapEditedCenters(
    workingSource,
    candidate,
    new Set(
      command.operations.flatMap((operation) =>
        operation.kind === 'body-properties' && operation.change.mass?.center !== undefined
          ? [operation.bodyId]
          : []
      )
    )
  );
  // Resolve material anchors before deletion removes their final placement. Group lineage does the same.
  candidate = { ...candidate, bodies: centered.bodies };
  const placement = candidate;
  const targets = command.operations.flatMap((operation) =>
    operation.kind === 'delete' ? operation.targets : []
  );
  if (targets.length) {
    const deletion = deleteBodyRecords(candidate, targets, command.id);
    if (!deletion.ok) return deletion;
    candidate = deletion.document;
  }
  const lineage = bodyGroupLineage(lineageSource, candidate, placement, command.targetGroupMember);
  if (!lineage.ok) return lineage;
  candidate = { ...candidate, groups: lineage.groups };
  candidate = retainCenterEditAnchors(workingSource, candidate);
  for (const operation of [...copiedProperties, ...command.operations])
    if (operation.kind === 'group-properties') {
      const changed = editBodyProperties(candidate, operation);
      if (!changed.ok) return changed;
      candidate = changed.document;
    }
  const refused = validateBodyEditDocument(candidate);
  if (refused) return refused;
  const held = validateBodyEditHolds(candidate);
  if (held) return held;
  const locked = validateBodyEditLocks(workingSource, candidate);
  if (locked) return locked;
  const effects = bodyEditEffects(source, candidate);
  return snapshotCopy({
    ok: true,
    baseRevision: revision,
    command,
    document: candidate,
    changed: effects.added.length + effects.removed.length + effects.changed.length > 0,
    effects,
    selection: retainBodySelection(
      candidate,
      copiedSelection.length ? copiedSelection : context.selection
    ),
  });
}
