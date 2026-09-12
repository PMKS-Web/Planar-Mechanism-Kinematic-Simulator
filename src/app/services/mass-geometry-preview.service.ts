import { Injectable, signal } from '@angular/core';
import { Link } from '../model/link';

/** Separate from the reference-axis preview so either explanation can be closed
 * independently. Own no model state and never enter history or serialization. */
@Injectable({ providedIn: 'root' })
export class MassGeometryPreviewService {
  readonly selection = signal<{ owner: object; body: Link } | undefined>(undefined);
  show(owner: object, body: Link) {
    this.selection.set({ owner, body });
  }
  clear(owner: object) {
    if (this.selection()?.owner === owner) this.selection.set(undefined);
  }
}
