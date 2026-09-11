import { isBodyGeometryOperation } from './body-geometry-edit';
import { isBodyPropertyOperation } from './body-property-edit';
import { BodyDocument } from './body-document';
import { BodyEditOperation } from './body-edit-types';
import {
  EditRefusal,
  EditState,
  menuRefusal,
  refusalFor,
  SETTINGS_AT_START_ONLY,
} from '../edit-permission';

export function bodyOperationPermission(
  operation: BodyEditOperation,
  state: EditState,
  displayedMapping = false
): EditRefusal | null {
  // World-dependent edits require a current displayed frame, not just permission to edit while paused.
  if (
    operation.kind === 'force-owner' ||
    (operation.kind === 'hold' && operation.dimension === 'angle') ||
    (operation.kind === 'force-properties' && operation.change.frame !== undefined)
  )
    return menuRefusal(state, displayedMapping ? 'attachment' : 'start');
  if (operation.kind === 'move-point' || isBodyGeometryOperation(operation))
    return menuRefusal(state, displayedMapping ? 'attachment' : 'start');
  if (isBodyPropertyOperation(operation)) return menuRefusal(state, 'preserve');
  if (operation.kind === 'project') {
    if (operation.settings && (state.playing || !state.atStart)) return SETTINGS_AT_START_ONLY;
    if (operation.synthesis !== undefined || operation.view?.backdrop || operation.view === null)
      return menuRefusal(state, 'view');
    return null;
  }
  return operation.kind === 'insert' || operation.kind === 'joint-kind'
    ? displayedMapping && state.mode === 'edit'
      ? refusalFor('build', state)
      : menuRefusal(state, 'start')
    : refusalFor('structure', state);
}

export function editBodyProject(
  document: BodyDocument,
  operation: Extract<BodyEditOperation, { kind: 'project' }>
): BodyDocument {
  const { synthesis, view, ...rest } = document;
  return {
    ...rest,
    settings: operation.settings ?? document.settings,
    ...(operation.synthesis === null
      ? {}
      : operation.synthesis !== undefined
        ? { synthesis: operation.synthesis }
        : synthesis
          ? { synthesis }
          : {}),
    ...(operation.view === null
      ? {}
      : operation.view !== undefined
        ? { view: operation.view }
        : view
          ? { view }
          : {}),
  };
}

/** Deleted generated material is a partial result, not a smaller untouched synthesis result. */
export function retainSynthesisOwnership(
  before: BodyDocument,
  document: BodyDocument
): BodyDocument {
  const synthesis = document.synthesis;
  if (!synthesis) return document;
  const original = synthesis.generated;
  const bodies = original.bodies.filter(
    (id) =>
      !before.bodies.some((body) => body.id === id) ||
      document.bodies.some((body) => body.id === id)
  );
  const joints = original.joints.filter(
    (id) =>
      !before.joints.some((joint) => joint.id === id) ||
      document.joints.some((joint) => joint.id === id)
  );
  const attachments = original.attachments.filter(
    (item) =>
      !before.attachments.some((point) => point.id === item.id) ||
      document.attachments.some((point) => point.id === item.id)
  );
  return {
    ...document,
    synthesis: {
      ...synthesis,
      generated: {
        bodies,
        joints,
        attachments,
        partial:
          original.partial ||
          bodies.length !== original.bodies.length ||
          joints.length !== original.joints.length ||
          attachments.length !== original.attachments.length,
      },
    },
  };
}
