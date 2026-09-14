import { Injectable, inject } from '@angular/core';
import { NativeEditorService } from '../../native-editor.service';
import { refusalFor } from '../../../model/edit-permission';
import type { ChromeHistory } from '../chrome-contracts';

@Injectable({ providedIn: 'root' })
export class NativeChromeHistoryService implements ChromeHistory {
  private readonly editor = inject(NativeEditorService);
  canUndo() {
    return !refusalFor('history', this.editor.state()) && this.editor.store.undoDepth > 0;
  }
  canRedo() {
    return !refusalFor('history', this.editor.state()) && this.editor.store.redoDepth > 0;
  }
  undo() {
    this.editor.history('undo');
  }
  redo() {
    this.editor.history('redo');
  }
}
