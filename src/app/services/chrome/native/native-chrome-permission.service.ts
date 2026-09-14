import { Injectable, inject } from '@angular/core';
import { NativeEditorService } from '../../native-editor.service';
import { NativePlaybackService } from '../../native-playback.service';
import { EditAction, refusalFor } from '../../../model/edit-permission';
import { nativeMotionRefusal } from '../../../model/body-system/native-motion-refusal';
import type { ChromePermission } from '../chrome-contracts';

@Injectable({ providedIn: 'root' })
export class NativeChromePermissionService implements ChromePermission {
  private readonly editor = inject(NativeEditorService);
  private readonly playback = inject(NativePlaybackService);
  refusal(action: EditAction) {
    return refusalFor(action, {
      ...this.editor.state(),
      runnable: this.playback.machines().length > 0,
    });
  }
  transportHint() {
    return (
      nativeMotionRefusal(this.playback.snapshot())?.long ?? this.refusal('transport')?.long ?? null
    );
  }
}
