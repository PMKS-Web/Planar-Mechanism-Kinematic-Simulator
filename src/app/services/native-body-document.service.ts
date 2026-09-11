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

/** Used only by the native editor route; the legacy MechanismService never writes this document. */
@Injectable({ providedIn: 'root' })
export class NativeBodyDocumentService {
  private readonly authority = new BodyDocumentAuthority(emptyBodyDocument());
  private readonly updates = new Subject<BodyDocumentChange>();
  readonly changes = this.updates.asObservable();
  get document() {
    return this.authority.document;
  }
  get revision() {
    return this.authority.revision;
  }
  get local() {
    return this.authority.local;
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
    if (result.ok && result.event) this.updates.next(result.event);
    return result;
  }
  undo(state: EditState) {
    const result = this.authority.undo(state);
    if (result.ok && result.event) this.updates.next(result.event);
    return result;
  }
  redo(state: EditState) {
    const result = this.authority.redo(state);
    if (result.ok && result.event) this.updates.next(result.event);
    return result;
  }
}
