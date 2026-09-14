import { Injectable, inject } from '@angular/core';
import { NativeEditorService } from '../../native-editor.service';
import { NATIVE_PREVIEW_FEATURES } from '../../../model/body-system/native-preview-features';
import type { ChromeStatus } from '../chrome-status';

@Injectable({ providedIn: 'root' })
export class NativeChromeStatusService implements ChromeStatus {
  private readonly editor = inject(NativeEditorService);
  record: { label: string } | undefined;
  live = false;
  private revision = -1;
  sync() {
    const wasLive = this.live;
    this.live = this.editor.mode() === 'analysis' && !!this.editor.draft();
    const selected = this.editor.selection()[0];
    if (this.live && selected) this.record = { label: this.editor.name(selected) };
    else if (
      this.editor.mode() !== 'analysis' ||
      (!wasLive && this.revision !== this.editor.store.revision)
    )
      this.record = undefined;
    else if (wasLive && this.revision === this.editor.store.revision) this.record = undefined;
    this.revision = this.editor.store.revision;
  }
  synthesisStatus() {
    return NATIVE_PREVIEW_FEATURES.synthesis;
  }
}
