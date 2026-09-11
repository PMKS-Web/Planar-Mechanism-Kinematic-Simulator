import { BodyDocument, emptyBodyDocument } from '../model/body-system/body-document';
import { BodyEditFrame } from '../model/body-system/body-edit-frame';
import { preparePosedBodyEdit } from '../model/body-system/body-posed-edit-source';
import { BodyId } from '../model/body-system/body-id';
import { Point } from '../model/body-system/body-frame';
import { BodyEditCommand, BodyEditRefusal } from '../model/body-system/body-edit-types';
import { planBodyCopy } from '../model/body-system/body-copy-edit';
import { insertBodyRecords } from '../model/body-system/body-insert-records';
import { bodyEditRefusal } from '../model/body-system/joint-permission';
import { validateBodyEditDocument } from '../model/body-system/body-edit-validation';
import { EditState } from '../model/edit-permission';
import { decodeBodyDocument, encodeBodyDocument } from './transcoding/body-document-codec';

/** Copy reads one accepted display. Only the selected material is serialized, never the rest of its project. */
export function captureNativeClipboard(
  document: BodyDocument,
  revision: number,
  bodyIds: readonly BodyId[],
  includeGround: boolean,
  state: EditState,
  display?: BodyEditFrame
): { readonly ok: true; readonly payload: string } | BodyEditRefusal {
  let source = document;
  if (!state.atStart && !display) return bodyEditRefusal('stale-pose');
  if (display) {
    const prepared = preparePosedBodyEdit(
      document,
      revision,
      { id: 'clipboard-read', operations: [] },
      { state, selection: [] },
      display
    );
    if (!prepared.ok) return prepared;
    source = prepared.displayed;
  } else {
    const invalid = validateBodyEditDocument(source);
    if (invalid) return invalid;
  }
  const copied = planBodyCopy(
    source,
    { kind: 'copy-bodies', bodyIds, includeGround, offset: { x: 0, y: 0 } },
    'clipboard',
    true
  );
  if (!copied.ok) return copied;
  const fragment = insertBodyRecords(emptyBodyDocument(source.units), copied.records);
  const invalid = validateBodyEditDocument(fragment);
  if (invalid) return invalid;
  const encoded = encodeBodyDocument(fragment);
  return encoded.ok ? encoded : bodyEditRefusal('invalid-document');
}

export function nativePasteCommand(
  payload: string | undefined,
  offset: Point,
  id: string
): { readonly ok: true; readonly command: BodyEditCommand } | BodyEditRefusal {
  if (!payload) return bodyEditRefusal('invalid-command');
  const decoded = decodeBodyDocument(payload);
  if (!decoded.ok) return bodyEditRefusal('invalid-document');
  return {
    ok: true,
    command: { id, operations: [{ kind: 'paste-bodies', source: decoded.document, offset }] },
  };
}
