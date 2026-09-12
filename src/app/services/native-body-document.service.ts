import { NativeBodyGesture, BodyGestureTarget } from './native-body-gesture';
import { readBodyDocument } from './transcoding/body-document-reader';
import { encodeBodyDocument } from './transcoding/body-document-codec';
import { NativeBodyRecovery } from './native-body-recovery';
import { captureNativeClipboard, nativePasteCommand } from './native-body-clipboard';
import { BodyId, newRecordId } from '../model/body-system/body-id';
import { Point } from '../model/body-system/body-frame';
import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { emptyBodyDocument } from '../model/body-system/body-document';
import {
  BodyDocumentAuthority,
  BodyDocumentChange,
  BodyLocalState,
} from '../model/body-system/body-document-authority';
import { BodyEditCommand, BodyEditPlan } from '../model/body-system/body-edit-types';
import { EditState } from '../model/edit-permission';
import { SimulationView } from '../model/body-system/simulation-view';

/** Used only by the native editor route; the legacy MechanismService never writes this document. */
@Injectable({ providedIn: 'root' })
export class NativeBodyDocumentService {
  private readonly authority = new BodyDocumentAuthority(emptyBodyDocument());
  private clipboardPayload: string | undefined;
  private readonly updates = new Subject<BodyDocumentChange>();
  readonly changes = this.updates.asObservable();
  beginGesture(target: BodyGestureTarget, state: EditState, id: string = newRecordId<'edit'>()) {
    return new NativeBodyGesture(this.authority, id, target, state);
  }
  finishGesture(gesture: NativeBodyGesture, state: EditState) {
    const result = gesture.finish(this.authority, state);
    if (result.ok && result.event) {
      this.saveRecovery();
      this.updates.next(result.event);
    }
    return result;
  }
  private recoveryStore?: NativeBodyRecovery;
  private recoveryResult: ReturnType<NativeBodyRecovery['save']> | undefined;
  get recoveryStatus() {
    return this.recoveryResult;
  }
  private saveRecovery() {
    return (this.recoveryResult = this.recoveryStore?.save(this.document));
  }
  attachRecovery(store: NativeBodyRecovery) {
    this.recoveryStore = store;
  }
  save() {
    return encodeBodyDocument(this.document);
  }
  load(payload: string, state: EditState) {
    const decoded = readBodyDocument(payload);
    if (!decoded.ok) return decoded;
    const result = this.authority.replace(decoded.document, state);
    if (result.ok && result.event) {
      const recovery = this.saveRecovery();
      this.updates.next(result.event);
      return { ...result, recovery };
    }
    return result;
  }
  recover(state: EditState) {
    const candidate = this.recoveryStore?.read();
    if (!candidate?.ok)
      return candidate ?? { ok: false as const, reason: 'no-valid-backup' as const };
    const result = this.authority.replace(candidate.document, state);
    if (result.ok && result.event) this.updates.next(result.event);
    return { ...result, source: candidate.source, rejected: candidate.rejected };
  }
  get clipboard() {
    return this.clipboardPayload;
  }
  copy(bodyIds: readonly BodyId[], includeGround: boolean, state: EditState) {
    const result = captureNativeClipboard(
      this.document,
      this.revision,
      bodyIds,
      includeGround,
      state,
      this.display
    );
    if (result.ok) this.clipboardPayload = result.payload;
    return result;
  }
  previewPaste(
    offset: Point,
    state: EditState,
    payload = this.clipboard,
    id: string = newRecordId<'edit'>()
  ) {
    const read = nativePasteCommand(payload, offset, id);
    return read.ok ? this.preview(read.command, state) : read;
  }
  paste(offset: Point, state: EditState, payload = this.clipboard) {
    const read = nativePasteCommand(payload, offset, newRecordId<'edit'>());
    return read.ok ? this.commit(read.command, state) : read;
  }
  get document() {
    return this.authority.document;
  }
  get revision() {
    return this.authority.revision;
  }
  get local() {
    return this.authority.local;
  }
  get display() {
    return this.authority.display;
  }
  setSimulationView(view: SimulationView) {
    return this.authority.setSimulationView(view);
  }
  get undoDepth() {
    return this.authority.undoDepth;
  }
  get redoDepth() {
    return this.authority.redoDepth;
  }
  setLocalState(local: BodyLocalState) {
    return this.authority.setLocalState(local);
  }
  preview(command: BodyEditCommand, state: EditState) {
    return this.authority.preview(command, state);
  }
  commit(plan: BodyEditPlan | BodyEditCommand, state: EditState) {
    const result = this.authority.commit(plan, state);
    if (result.ok && result.event) {
      this.saveRecovery();
      this.updates.next(result.event);
    }
    return result;
  }
  undo(state: EditState) {
    const result = this.authority.undo(state);
    if (result.ok && result.event) {
      this.saveRecovery();
      this.updates.next(result.event);
    }
    return result;
  }
  redo(state: EditState) {
    const result = this.authority.redo(state);
    if (result.ok && result.event) {
      this.saveRecovery();
      this.updates.next(result.event);
    }
    return result;
  }
}
