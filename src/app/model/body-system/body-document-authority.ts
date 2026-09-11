import { clocksAfterBodyEdit } from './body-edit-clocks';
import { BodyEditFrame, captureBodyEditFrame } from './body-edit-frame';
import { SimulationView } from './simulation-view';
import { EditState, refusalFor } from '../edit-permission';
import { BodyDocument } from './body-document';
import {
  BodyEditCommand,
  BodyEditPlan,
  BodyEditRefusal,
  BodySelectionRef,
} from './body-edit-types';
import { DriverId } from './body-id';
import { planBodyEdit } from './body-edit-plan';
import { retainBodySelection, sameBodyRecord } from './body-edit-effects';
import { validateBodyEditDocument } from './body-edit-validation';
import { snapshotCopy } from './sample-results';

export interface BodyClockState {
  readonly driverId: DriverId;
  /** Coordinates use document units; time is seconds. This state never enters a shared URL. */
  readonly anchor: number;
  readonly command: number;
  readonly time: number;
  readonly synced: boolean;
  readonly direction?: 1 | -1;
}
export interface BodyLocalState {
  readonly selection: readonly BodySelectionRef[];
  readonly clocks: readonly BodyClockState[];
}
interface HistoryEntry {
  readonly document: BodyDocument;
  readonly local: BodyLocalState;
  readonly display?: BodyEditFrame;
}
export interface BodyDocumentChange {
  readonly kind: 'edit' | 'undo' | 'redo';
  readonly revision: number;
  readonly document: BodyDocument;
  readonly local: BodyLocalState;
  readonly plan?: BodyEditPlan;
  readonly display?: BodyEditFrame;
}
export type BodyCommitResult =
  | {
      readonly ok: true;
      readonly changed: boolean;
      readonly revision: number;
      readonly event?: BodyDocumentChange;
    }
  | BodyEditRefusal;

/** Each native editor owns exactly one document; playback has only local clock/selection state. */
export class BodyDocumentAuthority {
  private value: HistoryEntry;
  private history: HistoryEntry[];
  private cursor = 0;
  private currentRevision = 0;
  constructor(document: BodyDocument) {
    const refused = validateBodyEditDocument(document);
    if (refused) throw new Error(refused.message);
    this.value = snapshotCopy({
      document,
      local: {
        selection: [],
        clocks: document.drivers.map((driver) => ({
          driverId: driver.id,
          anchor: driver.profile.initial,
          command: driver.profile.initial,
          time: 0,
          synced: true,
        })),
      },
    });
    this.history = [this.value];
  }
  get document(): BodyDocument {
    return this.value.document;
  }
  get local(): BodyLocalState {
    return this.value.local;
  }
  get revision(): number {
    return this.currentRevision;
  }
  get display(): BodyEditFrame | undefined {
    return this.value.display;
  }
  setSimulationView(view: SimulationView): boolean {
    const display = captureBodyEditFrame(this.document, this.revision, this.local.clocks, view);
    if (!display) return false;
    this.value = Object.freeze({
      ...this.value,
      local: snapshotCopy({ ...this.local, clocks: display.clocks }),
      display,
    });
    return true;
  }
  get undoDepth(): number {
    return this.cursor;
  }
  get redoDepth(): number {
    return this.history.length - this.cursor - 1;
  }
  preview(command: BodyEditCommand, state: EditState) {
    return planBodyEdit(this.document, this.revision, command, {
      state,
      selection: this.local.selection,
      display: this.display,
    });
  }
  setLocalState(local: BodyLocalState): boolean {
    const ids = new Set(this.document.drivers.map((driver) => driver.id));
    if (
      new Set(local.clocks.map((clock) => clock.driverId)).size !== local.clocks.length ||
      local.clocks.some(
        (clock) =>
          !ids.has(clock.driverId) ||
          ![clock.anchor, clock.command, clock.time].every(Number.isFinite) ||
          clock.time < 0 ||
          (clock.direction !== undefined && clock.direction !== 1 && clock.direction !== -1) ||
          typeof clock.synced !== 'boolean'
      )
    )
      return false;
    this.value = Object.freeze({
      document: this.document,
      ...(sameBodyRecord(local.clocks, this.local.clocks) && this.value.display
        ? { display: this.value.display }
        : {}),
      local: snapshotCopy({
        ...local,
        selection: retainBodySelection(this.document, local.selection),
      }),
    });
    return true;
  }
  commit(preview: BodyEditPlan | BodyEditCommand, state: EditState): BodyCommitResult {
    const command = 'command' in preview ? preview.command : preview;
    // Replanning also rechecks current permissions and newly attached objects in a stale cascade.
    const plan = this.preview(command, state);
    if (!plan.ok) return plan;
    if (!plan.changed) return { ok: true, changed: false, revision: this.revision };
    const local = {
      selection: plan.selection,
      clocks: plan.display?.clocks ?? clocksAfterBodyEdit(this.document, this.local.clocks, plan),
    };
    this.history[this.cursor] = this.value;
    this.value = snapshotCopy({
      document: plan.document,
      local,
      ...(plan.display ? { display: { ...plan.display, revision: this.revision + 1 } } : {}),
    });
    this.history = this.history.slice(0, this.cursor + 1);
    this.history.push(this.value);
    this.cursor++;
    this.currentRevision++;
    return {
      ok: true,
      changed: true,
      revision: this.revision,
      event: snapshotCopy({ kind: 'edit', revision: this.revision, ...this.value, plan }),
    };
  }
  undo(state: EditState): BodyCommitResult {
    return this.restore(-1, state);
  }
  redo(state: EditState): BodyCommitResult {
    return this.restore(1, state);
  }
  private restore(direction: -1 | 1, state: EditState): BodyCommitResult {
    const permission = refusalFor('history', state);
    if (permission)
      return { ok: false, code: 'permission', message: permission.long, targets: [], permission };
    const index = this.cursor + direction;
    if (index < 0 || index >= this.history.length)
      return { ok: true, changed: false, revision: this.revision };
    const target = this.history[index],
      refused = validateBodyEditDocument(target.document);
    if (refused) return refused;
    this.history[this.cursor] = this.value;
    this.value = target.display
      ? Object.freeze({
          ...target,
          display: snapshotCopy({ ...target.display, revision: this.revision + 1 }),
        })
      : target;
    this.cursor = index;
    this.currentRevision++;
    return {
      ok: true,
      changed: true,
      revision: this.revision,
      event: snapshotCopy({
        kind: direction < 0 ? 'undo' : 'redo',
        revision: this.revision,
        ...this.value,
      }),
    };
  }
}
export function commitBodyEdit(
  authority: BodyDocumentAuthority,
  preview: BodyEditPlan | BodyEditCommand,
  state: EditState
): BodyCommitResult {
  return authority.commit(preview, state);
}
