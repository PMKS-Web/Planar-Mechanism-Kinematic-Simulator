import { ViewportService } from '../../services/viewport.service';
import { emptyBodyDocument } from '../../model/body-system/body-document';
import { FormControl, FormGroup } from '@angular/forms';
import { InputComponent } from '../BLOCKS/input/input.component';
import { nativeLength, nativeNumber } from '../../model/body-system/body-field-values';
import { NotificationComponent } from '../notification/notification.component';
import { NotificationService } from '../../services/notification.service';
import { nativeMotionRefusal } from '../../model/body-system/native-motion-refusal';
import { DomSanitizer } from '@angular/platform-browser';
import { registerAppIcons } from '../../app-icons';
import { hideBootSplash } from '../../boot-splash';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  afterNextRender,
  DestroyRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon, MatIconRegistry } from '@angular/material/icon';
import { NativeEditorService } from '../../services/native-editor.service';
import { NativePlaybackService } from '../../services/native-playback.service';
import { NativeGridComponent } from './native-grid.component';
import { NativeInspectorComponent } from './native-inspector.component';
import { KeyboardShortcutsService } from '../../services/keyboard-shortcuts.service';
import { BodyUnits } from '../../model/body-system/body-units';
import { refusalFor } from '../../model/edit-permission';

/** A separate bootstrap is the boundary: opening this editor never constructs MechanismService. */
@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-root',
  imports: [
    InputComponent,
    NotificationComponent,
    MatIconButton,
    MatButton,
    MatIcon,
    NativeGridComponent,
    NativeInspectorComponent,
  ],
  templateUrl: './native-editor.component.html',
  styleUrl: './native-editor.component.scss',
})
export class NativeEditorComponent {
  protected readonly viewport = inject(ViewportService);
  protected readonly sheetOpen = signal(false);
  protected readonly viewsOpen = signal(false);
  protected readonly modePanel = viewChild<ElementRef<HTMLElement>>('modePanel');
  protected readonly transport = viewChild.required<ElementRef<HTMLElement>>('transport');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly editor = inject(NativeEditorService);
  protected readonly playback = inject(NativePlaybackService);
  protected readonly grid = viewChild.required(NativeGridComponent);
  protected readonly shortcuts = inject(KeyboardShortcutsService);
  protected readonly projectOpen = signal(false);
  protected readonly activeMode = signal('Edit');
  protected readonly settingsFields = new FormGroup({
    size: new FormControl('', { nonNullable: true }),
  });
  protected readonly modes = ['Synthesis', 'Edit', 'Kinematic', 'Force'];
  protected readonly refusalFor = refusalFor;
  protected readonly motionRefusal = () =>
    refusalFor('transport', this.editor.state()) ?? nativeMotionRefusal(this.playback.snapshot());
  constructor() {
    inject(DestroyRef).onDestroy(this.shortcuts.useNativeClipboardShortcuts());
    effect(() => {
      const d = this.editor.document();
      this.settingsFields.controls.size.setValue(
        `${nativeNumber(d.settings.objectScale)} ${d.units.length}`,
        { emitEvent: false }
      );
    });
    const notifications = inject(NotificationService);
    this.editor.messages.pipe(takeUntilDestroyed()).subscribe((message) => {
      // The same refused action must speak again after its previous toast was dismissed.
      if (message) notifications.refusal(`native.edit.${message}`, message, { cooldownMs: 0 });
      else
        for (const one of [...notifications.live]) {
          if (one.id.startsWith('native.edit.')) notifications.dismiss(one.key);
        }
    });
    registerAppIcons(inject(MatIconRegistry), inject(DomSanitizer));
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      requestAnimationFrame(() => hideBootSplash());
      const observer = new ResizeObserver(() => {
        this.host.nativeElement.style.setProperty(
          '--native-controls-top',
          `${innerHeight - this.transport().nativeElement.getBoundingClientRect().top}px`
        );
        this.host.nativeElement.style.setProperty(
          '--native-panel-top',
          `${innerHeight - (this.modePanel()?.nativeElement.getBoundingClientRect().top ?? this.transport().nativeElement.getBoundingClientRect().top)}px`
        );
      });
      observer.observe(this.transport().nativeElement);
      const panel = this.modePanel()?.nativeElement;
      if (panel) observer.observe(panel);
      destroy.onDestroy(() => observer.disconnect());
    });
    const query = new URLSearchParams(location.search),
      payload = query.get('document');
    if (payload) this.editor.load(payload);
    else
      this.editor.loadDocument(
        emptyBodyDocument({ length: 'cm', mass: 'g', inertia: 'kg*cm2', force: 'N' }),
        false
      );
    if (!this.playback.snapshot()) this.playback.rebuild();
    this.shortcuts.whenArrowsNudge(
      () => this.editor.selection().length > 0 && !this.editor.playing()
    );
    this.shortcuts.pressedKeys.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe(({ id }) => {
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
        case 'playback.back':
          for (const m of this.playback.machines())
            this.playback.seek(m.key, (this.playback.indices().get(m.key) ?? 0) - 1);
          break;
        case 'playback.forward':
          for (const m of this.playback.machines())
            this.playback.seek(m.key, (this.playback.indices().get(m.key) ?? 0) + 1);
          break;
        case 'edit.delete':
          this.editor.delete();
          break;
        case 'edit.lock':
          this.editor.commit(this.editor.lockCommand());
          break;
        case 'edit.deselect':
          this.grid().cancel();
          this.grid().tool.set(undefined);
          this.editor.select();
          break;
        case 'playback.toggle':
          this.playback.toggle();
          break;
        case 'playback.stop':
          this.playback.rewind();
          break;
        case 'view.zoomIn':
          this.grid().zoom(1.2);
          break;
        case 'view.zoomOut':
          this.grid().zoom(1 / 1.2);
          break;
        case 'view.reset':
          this.grid().fit();
          break;
        case 'mode.edit':
          this.mode('Edit');
          break;
        case 'mode.kinematic':
          this.mode('Kinematic');
          break;
        case 'mode.force':
          this.mode('Force');
          break;
        case 'mode.synthesis':
          this.mode('Synthesis');
          break;
      }
    });
  }
  protected toggleSheet() {
    const panel = this.modePanel()?.nativeElement.querySelector<HTMLElement>('.sheet-content');
    if (!panel) return;
    const before = panel.getBoundingClientRect().height;
    this.sheetOpen.update((open) => !open);
    requestAnimationFrame(() => {
      const after = panel.getBoundingClientRect().height;
      if (this.sheetOpen()) panel.scrollTop = 0;
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches)
        panel.animate([{ height: `${before}px` }, { height: `${after}px` }], {
          duration: 200,
          easing: 'ease-in-out',
        });
    });
  }
  protected mode(mode: string) {
    this.activeMode.set(mode);
    this.editor.mode.set(
      mode === 'Edit' ? 'edit' : mode === 'Synthesis' ? 'synthesis' : 'analysis'
    );
  }
  protected objectSize() {
    const d = this.editor.document(),
      size = nativeLength(this.settingsFields.controls.size.value, d.units.length);
    if (
      this.settingsFields.controls.size.value ===
      `${nativeNumber(d.settings.objectScale)} ${d.units.length}`
    )
      return;
    if (size === undefined || size <= 0) {
      this.editor.report('Type a positive object size, with or without a unit.');
      return;
    }
    this.editor.apply({ kind: 'project', settings: { ...d.settings, objectScale: size } });
  }
  protected unit(event: Event) {
    const length = (event.target as HTMLSelectElement).value as BodyUnits['length'];
    const units: BodyUnits =
      length === 'cm'
        ? { length, mass: 'g', inertia: 'kg*cm2', force: 'N' }
        : length === 'in'
          ? { length, mass: 'lb', inertia: 'lb*in2', force: 'lbf' }
          : { length, mass: 'kg', inertia: 'kg*m2', force: 'N' };
    this.editor.apply({ kind: 'convert-units', units });
  }
  protected async open(event: Event) {
    const input = event.target as HTMLInputElement,
      file = input.files?.[0];
    if (!file) return;
    const content = await file.text();
    if (this.editor.load(content.trim())) requestAnimationFrame(() => this.grid().fit());
    input.value = '';
  }
  protected save() {
    const result = this.editor.store.save();
    if (!result.ok) return;
    const url = URL.createObjectURL(new Blob([result.payload], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mechanism.pmks';
    a.click();
    URL.revokeObjectURL(url);
  }
  protected async share() {
    const result = this.editor.store.save();
    if (!result.ok) return;
    const url = new URL(location.href);
    url.search = '';
    url.searchParams.set('editor', 'native');
    url.searchParams.set('document', result.payload);
    try {
      await navigator.clipboard.writeText(url.href);
    } catch {
      this.editor.report(
        'The browser blocked clipboard access. Save the project to share it as a file.'
      );
    }
  }
}
