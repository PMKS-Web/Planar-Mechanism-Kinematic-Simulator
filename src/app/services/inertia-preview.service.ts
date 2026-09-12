import { Injectable, signal } from '@angular/core';
import { RealLink } from '../model/link';
import { Force } from '../model/force';

/** Ephemeral read-only explanation overlay. Keep references, so playback's
 * in-place pose updates reach the drawing; never serialize this selection. */
@Injectable({ providedIn: 'root' })
export class InertiaPreviewService {
  readonly selection = signal<
    { owner: object; body: RealLink; key: string; force?: Force } | undefined
  >(undefined);
  show(owner: object, body: RealLink, key: string) {
    const previous = this.selection();
    this.selection.set({
      owner,
      body,
      key,
      force: previous?.owner === owner && previous.body === body ? previous.force : undefined,
    });
  }
  clear(owner: object) {
    if (this.selection()?.owner === owner) this.selection.set(undefined);
  }
  highlight(force?: Force) {
    const selected = this.selection();
    if (selected) this.selection.set({ ...selected, force });
  }
}
