import { Injectable, inject } from '@angular/core';
import { DragStateService } from './drag-state.service';
import { SaveHistoryService } from './save-history.service';
import { ActiveObjService } from './active-obj.service';
import { MechanismService } from './mechanism.service';
import { SelectedTabService } from '../selected-tab.service';

/** A tuning gesture that has been made: what was held, and when. */
export interface TuningRecord {
  /** The part that was under the hand, as the panels name it: "Joint B". */
  label: string;
  /** The history counter when the gesture began. A step past it ends the record. */
  historyStep: number;
}

/** A graph that can hold the curves from before a drag. */
export interface ComparisonHolder {
  /** Snapshot what is on the plot, if anything is. */
  takeBaseline(): void;
  /** Forget it. */
  dropBaseline(): void;
  readonly hasBaseline: boolean;
}

/**
 * One account of the tuning gesture, for everything that speaks of it.
 *
 * A drag in an analysis mode is an edit, and three surfaces describe the same
 * gesture: the panel's head names what is under the hand, the status strip says
 * what happened, and every open graph lays the curve from before the drag under
 * the live one. Each used to work the gesture out for itself from the drag
 * state, which is three chances to disagree about when it began and whether it
 * is still on. The account is kept here, and the surfaces read it.
 *
 * The graphs still hold their own "before" curves, because only a graph has the
 * numbers -- but they are told when to take one and when to drop it from here,
 * in the app shell's own check, before any panel has been drawn. A graph that
 * decided for itself, in its own check, decided after the panel above it had
 * already asked whether there was anything to compare.
 */
@Injectable({ providedIn: 'root' })
export class AnalysisCompareService {
  private drag = inject(DragStateService);
  private history = inject(SaveHistoryService);
  private active = inject(ActiveObjService);
  private mechanism = inject(MechanismService);
  private tabs = inject(SelectedTabService);

  /**
   * Whether the curves from before the drag are shown beside the live ones.
   *
   * On by default: the comparison is the point of tuning in an analysis mode.
   * Off, the earlier curves and their numbers leave every plot at once, and the
   * graphs keep them for when it is turned back on.
   */
  compare = true;

  /** A tuning gesture is in flight: the pointer is down and has moved a part. */
  live = false;

  /**
   * The last tuning gesture, kept until undo or redo replaces the drawing it
   * was made on. The next gesture replaces it.
   */
  record?: TuningRecord;

  /** Every open graph, whether or not it holds a curve from before the drag. */
  private graphs = new Set<ComparisonHolder>();

  /**
   * Bring the account up to date. Called from change detection by whoever reads
   * it, and safe to call any number of times in one pass: every edit ends in a
   * rebuild that publishes on nothing, so this is polled the way the tutorial
   * card polls the drawing.
   */
  sync(): void {
    const live =
      this.drag.isPointerDown &&
      this.drag.travelled &&
      this.drag.isDragging &&
      this.tabs.isAnalysisMode();
    if (live && !this.live) {
      // Taken on the first travel of this gesture: the part under the hand is
      // the one the press selected, which need not be the one being graphed.
      this.record = { label: this.heldLabel(), historyStep: this.history.historySteps };
      // Each drag compares against the pose it started from, so the next one
      // replaces the last one's answer rather than accumulating over it.
      this.graphs.forEach((graph) => graph.takeBaseline());
    }
    this.live = live;
    // A history step is not a drag, and the drawing it restores may be the very
    // one the record was made on -- a comparison of a cycle with itself is
    // confusion rather than comparison. The counter moves on undo and redo alone.
    if (this.record && this.history.historySteps !== this.record.historyStep) {
      this.record = undefined;
      this.graphs.forEach((graph) => graph.dropBaseline());
    }
  }

  /** Whether any open graph has a curve from before the drag to show. */
  get hasComparison(): boolean {
    for (const graph of this.graphs) if (graph.hasBaseline) return true;
    return false;
  }

  register(graph: ComparisonHolder): void {
    this.graphs.add(graph);
  }

  unregister(graph: ComparisonHolder): void {
    this.graphs.delete(graph);
  }

  toggleCompare(): void {
    this.compare = !this.compare;
  }

  /** What is under the hand, as a noun phrase the strip can use. */
  private heldLabel(): string {
    switch (this.active.objType) {
      case 'Joint':
        return `Joint ${this.active.selectedJoint.name}`;
      case 'Link':
        return this.mechanism.bodyLabel(this.active.selectedLink);
      case 'Force':
        return `Force ${this.active.selectedForce.name}`;
      default:
        return 'the mechanism';
    }
  }
}
