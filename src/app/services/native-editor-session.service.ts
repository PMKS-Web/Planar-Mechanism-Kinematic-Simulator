import { DestroyRef, Injectable, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NativeEditorService } from './native-editor.service';
import { NativePlaybackService } from './native-playback.service';
import { KeyboardShortcutsService } from './keyboard-shortcuts.service';
import { NotificationService } from './notification.service';
import { emptyBodyDocument } from '../model/body-system/body-document';
import { CHROME_PROJECT } from './chrome/chrome-project';

/** Startup and edit shortcuts belong to the document session, not a second application root. */
@Injectable({ providedIn: 'root' })
export class NativeEditorSessionService {
  private readonly editor = inject(NativeEditorService);
  private readonly playback = inject(NativePlaybackService);
  private readonly shortcuts = inject(KeyboardShortcutsService);
  private readonly project = inject(CHROME_PROJECT);
  constructor() {
    const destroy = inject(DestroyRef),
      notifications = inject(NotificationService);
    destroy.onDestroy(this.shortcuts.useNativeClipboardShortcuts());
    this.shortcuts.whenArrowsNudge(
      () => this.editor.selection().length > 0 && !this.editor.playing()
    );
    this.editor.messages.pipe(takeUntilDestroyed()).subscribe((message) => {
      if (message) notifications.refusal(`native.edit.${message}`, message, { cooldownMs: 0 });
      else
        for (const one of [...notifications.live])
          if (one.id.startsWith('native.edit.')) notifications.dismiss(one.key);
    });
    this.shortcuts.pressedKeys.pipe(takeUntilDestroyed()).subscribe(({ id }) => {
      switch (id) {
        case 'history.undo':
          this.editor.history('undo');
          break;
        case 'history.redo':
          this.editor.history('redo');
          break;
        case 'edit.copy':
          void this.editor.copy();
          break;
        case 'edit.paste':
          void this.editor.paste();
          break;
        case 'edit.nudgeLeft':
          this.editor.nudge(-1, 0);
          break;
        case 'edit.nudgeRight':
          this.editor.nudge(1, 0);
          break;
        case 'edit.nudgeUp':
          this.editor.nudge(0, 1);
          break;
        case 'edit.nudgeDown':
          this.editor.nudge(0, -1);
          break;
        case 'edit.delete':
          this.editor.delete();
          break;
        case 'edit.lock':
          this.editor.commit(this.editor.lockCommand());
          break;
      }
    });
  }
  start() {
    const query = new URLSearchParams(location.search),
      payload = query.get('document');
    if (payload) {
      this.editor.load(payload, false);
      history.replaceState(history.state, '', `${location.pathname}?editor=native`);
    } else
      this.editor.loadDocument(
        emptyBodyDocument({ length: 'cm', mass: 'g', inertia: 'kg*cm2', force: 'N' }),
        false
      );
    if (!this.playback.snapshot()) this.playback.rebuild();
    if (query.has('library')) this.project.openLibrary();
  }
}
