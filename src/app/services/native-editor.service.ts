import { bodyNudgeCommand } from '../model/body-system/body-nudge-command';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NativeBodyDocumentService } from './native-body-document.service';
import { NativeBodyRecovery } from './native-body-recovery';
import {
  BodyEditCommand,
  BodyEditOperation,
  BodyEditPlan,
  BodySelectionRef,
} from '../model/body-system/body-edit-types';
import { BodyDocument } from '../model/body-system/body-document';
import { withBodyEditFrame } from '../model/body-system/body-edit-frame';
import { EditMode, EditState } from '../model/edit-permission';
import {
  nativeCommand,
  selectionBodies,
  selectionJoints,
} from '../model/body-system/body-joint-interaction';
import { BodyId, WORLD } from '../model/body-system/body-id';
import { encodeBodyDocument } from './transcoding/body-document-codec';

/** View state is disposable; every authored change belongs to NativeBodyDocumentService. */
@Injectable({ providedIn: 'root' })
export class NativeEditorService {
  readonly store = inject(NativeBodyDocumentService);
  readonly mode = signal<EditMode>('edit');
  readonly playing = signal(false);
  readonly connectionPair = signal('');
  readonly dimension = signal<'length' | 'angle' | undefined>(undefined);
  readonly version = signal(0);
  readonly message = signal('');
  readonly selection = signal<readonly BodySelectionRef[]>([]);
  readonly draft = signal<BodyEditPlan | undefined>(undefined);
  readonly document = computed(() => {
    this.version();
    return this.store.document;
  });
  readonly drawing = computed(() => {
    this.version();
    const draft = this.draft(),
      document = draft?.document ?? this.store.document;
    const frame = draft?.display ?? (!draft ? this.store.display : undefined);
    return frame ? withBodyEditFrame(document, frame) : document;
  });
  readonly bodies = computed(() => selectionBodies(this.document(), this.selection()));
  readonly joints = computed(() => selectionJoints(this.document(), this.selection()[0]));
  readonly state = computed<EditState>(() => {
    this.version();
    const atStart = this.store.local.clocks.every((c) => c.time === 0);
    return {
      mode: this.mode(),
      playing: this.playing(),
      atStart,
      sharedStepZero: atStart,
      solveDeferred: false,
      empty: this.document().bodies.length === 1,
      runnable: this.document().drivers.length > 0,
    };
  });
  constructor() {
    this.store.changes.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe(() => {
      this.draft.set(undefined);
      this.selection.set(this.store.local.selection);
      this.refresh();
    });
    this.store.attachRecovery(
      new NativeBodyRecovery(
        {
          getItem: (key) => sessionStorage.getItem(key),
          setItem: (key, value) => sessionStorage.setItem(key, value),
        },
        {
          getItem: (key) => localStorage.getItem(key),
          setItem: (key, value) => localStorage.setItem(key, value),
        }
      )
    );
  }
  refresh() {
    this.version.update((v) => v + 1);
  }
  select(target?: BodySelectionRef, additive = false) {
    const equal = (a: BodySelectionRef, b: BodySelectionRef) =>
      JSON.stringify(a) === JSON.stringify(b);
    const old = this.selection();
    const selection = !target
      ? []
      : !additive
        ? [target]
        : old.some((s) => equal(s, target))
          ? old.filter((s) => !equal(s, target))
          : [...old, target];
    this.selection.set(selection);
    this.store.setLocalState({ ...this.store.local, selection });
  }
  preview(command: BodyEditCommand) {
    return this.store.preview(command, this.state());
  }
  commit(command: BodyEditCommand | BodyEditPlan) {
    const result = this.store.commit(command, this.state());
    if (!result.ok) this.message.set(result.message);
    else {
      this.message.set('');
      const recovery = this.store.recoveryStatus;
      if (recovery && !recovery.ok)
        this.message.set(
          'This browser could not save a recovery copy. Save the project before closing it.'
        );
    }
    return result.ok;
  }
  apply(...operations: readonly BodyEditOperation[]) {
    return this.commit(nativeCommand(...operations));
  }
  history(direction: 'undo' | 'redo') {
    const result = this.store[direction](this.state());
    if (!result.ok) this.message.set(result.message);
  }
  nudge(x: number, y: number) {
    const d = this.drawing(),
      step = d.settings.objectScale * 0.05;
    this.commit(bodyNudgeCommand(d, this.selection(), { x: x * step, y: y * step }));
  }

  delete(targets = this.selection()) {
    return this.apply({ kind: 'delete', targets });
  }
  rename(name: string) {
    const target = this.selection()[0];
    if (!target) return false;
    if (target.kind === 'body')
      return this.apply({ kind: 'body-properties', bodyId: target.id, change: { label: name } });
    if (target.kind === 'group')
      return this.apply({
        kind: 'group-properties',
        members: target.members,
        change: { label: name },
      });
    if (target.kind === 'attachment')
      return this.apply({
        kind: 'attachment-properties',
        attachmentId: target.id,
        change: { label: name },
      });
    if (target.kind === 'force')
      return this.apply({ kind: 'force-properties', forceId: target.id, change: { label: name } });
    if (target.kind === 'assembly' || target.kind === 'joint')
      return this.apply({ kind: 'label', target, label: name });
    return false;
  }
  bodyName(id: BodyId) {
    const body = this.document().bodies.find((b) => b.id === id);
    return body?.kind === 'material' ? body.label || 'Link' : 'Ground';
  }
  name(target = this.selection()[0]): string {
    if (!target) return 'Edit';
    const d = this.document();
    switch (target.kind) {
      case 'body':
        return this.bodyName(target.id);
      case 'group':
        return (
          d.groups.find(
            (g) =>
              g.members.length === target.members.length &&
              g.members.every((id) => target.members.includes(id))
          )?.label || 'Welded Group'
        );
      case 'joint':
        return d.joints.find((j) => j.id === target.id)?.label || 'Joint';
      case 'junction':
        return 'Joint';
      case 'assembly':
        return d.assemblies.find((c) => c.id === target.id)?.label || 'Cylinder';
      case 'attachment':
        return d.attachments.find((a) => a.id === target.id)?.label || 'Tracer Point';
      case 'force':
        return d.forces.find((f) => f.id === target.id)?.label || 'Force';
    }
  }
  lockCommand() {
    const d = this.document(),
      selection = this.selection();
    const targets = selection.flatMap<
      Extract<BodyEditOperation, { kind: 'lock' }>['targets'][number]
    >((s) => {
      if (s.kind === 'force' || s.kind === 'attachment') return [s];
      if (s.kind === 'joint' || s.kind === 'junction') {
        const joints = selectionJoints(d, s);
        return [
          ...new Set(joints.flatMap((j) => [j.frameA.attachmentId, j.frameB.attachmentId])),
        ].map((id) => ({ kind: 'attachment' as const, id }));
      }
      return selectionBodies(d, [s]).map((id) => ({ kind: 'body' as const, id }));
    }) as Extract<BodyEditOperation, { kind: 'lock' }>['targets'];
    const locked =
      targets.length > 0 &&
      targets.every((t) =>
        t.kind === 'attachment'
          ? d.locks.includes(t.id)
          : t.kind === 'force'
            ? d.forces.find((f) => f.id === t.id)?.locked
            : d.bodies.some((b) => b.id === t.id && b.kind === 'material' && b.locked)
      );
    return nativeCommand({ kind: 'lock', targets, locked: !locked });
  }
  loadDocument(document: BodyDocument, writeRecovery = true) {
    const encoded = encodeBodyDocument(document);
    if (encoded.ok) this.load(encoded.payload, writeRecovery);
  }
  load(payload: string, writeRecovery = true) {
    const result = this.store.load(payload, this.state(), writeRecovery);
    if (!result.ok)
      this.message.set(
        'message' in result
          ? result.message
          : 'The project could not be opened. Keep the original file and check that this version supports it.'
      );
    return result.ok;
  }
  recover() {
    const result = this.store.recover(this.state());
    if (!result.ok)
      this.message.set(
        'message' in result
          ? result.message
          : 'No valid recovery copy was found. Open a saved project instead.'
      );
    else if (result.rejected.length)
      this.message.set(
        'The tab recovery copy could not be read. The last saved browser copy was opened.'
      );
  }
  async copy() {
    const result = this.store.copy(
      this.bodies().filter((id) => id !== WORLD),
      true,
      this.state()
    );
    if (!result.ok) {
      this.message.set(result.message);
      return;
    }
    try {
      await navigator.clipboard.writeText(result.payload);
    } catch {
      this.message.set(
        'The browser blocked clipboard access. The selection can still be pasted in this tab.'
      );
    }
  }
  async paste() {
    let payload = this.store.clipboard;
    try {
      payload = await navigator.clipboard.readText();
    } catch {
      if (!payload) {
        this.message.set('Allow clipboard access or copy a selection in this tab first.');
        return;
      }
    }
    const size = this.document().settings.objectScale;
    const result = this.store.paste({ x: size, y: -size }, this.state(), payload);
    if (!result.ok) this.message.set(result.message);
  }
}
