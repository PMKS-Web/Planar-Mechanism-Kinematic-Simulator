import { BodyDocument } from './body-document';
import { BodyEditCommand, BodyEditContext, BodyEditResult } from './body-edit-types';
import { BodyEditFrame, withBodyEditFrame } from './body-edit-frame';
import { validateBodyEditLocks } from './body-lock-validation';
import { preparePosedBodyEdit } from './body-posed-edit-source';
import { reanchorBodyEdit } from './body-reanchor-edit';
import { validateBodyEditDocument } from './body-edit-validation';
import { validateBodyEditHolds } from './body-hold-validation';
import { bodyEditRefusal } from './joint-permission';
import { bodyEditEffects } from './body-edit-effects';
import { snapshotCopy } from './sample-results';

/** Locks are checked under the pointer, before re-anchoring transports the accepted material as simulation would. */
export function planPosedBodyGeometry(
  document: BodyDocument,
  revision: number,
  command: BodyEditCommand,
  context: BodyEditContext,
  frame: BodyEditFrame
): BodyEditResult {
  const prepared = preparePosedBodyEdit(document, revision, command, context, frame);
  if (!prepared.ok) return prepared;
  const { source, displayed, changed } = prepared;
  if (!changed.changed) return { ...changed, document: source, display: frame };
  const restored = reanchorBodyEdit(source, displayed, changed.document, frame);
  if (!restored) return bodyEditRefusal('unsolved-edit');
  const finalDisplay = withBodyEditFrame(restored.document, restored.display);
  const refused =
    validateBodyEditDocument(finalDisplay) ??
    validateBodyEditLocks(displayed, finalDisplay) ??
    validateBodyEditDocument(restored.document) ??
    validateBodyEditHolds(restored.document);
  if (refused) return refused;
  const effects = bodyEditEffects(source, restored.document);
  return snapshotCopy({
    ...changed,
    ...restored,
    effects,
    changed: effects.added.length + effects.removed.length + effects.changed.length > 0,
  });
}
