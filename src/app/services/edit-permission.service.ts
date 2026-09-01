import { Injectable, inject } from '@angular/core';
import { EditAction, EditMode, EditRefusal, EditState, refusalFor } from '../model/edit-permission';
import { MechanismService } from './mechanism.service';
import { SelectedTabService, TabID } from '../selected-tab.service';

/**
 * The app's one answer to "may this edit happen, and if not, in what words".
 *
 * Every surface that used to decide for itself now quotes this -- the canvas's
 * drag gate, the Edit panel, the context menu, the undo buttons, the transport.
 * The rules live in `model/edit-permission.ts`, which is pure and testable as a
 * table; this class exists only to describe the current state to it.
 *
 * The services on the `MechanismService` / `GridUtilsService` construction ring
 * reach this one through an `Injector` rather than the other way round -- see
 * the note in CLAUDE.md about that ring.
 */
@Injectable({ providedIn: 'root' })
export class EditPermissionService {
  // Injected at construction rather than looked up per call. A lazy lookup runs
  // against whatever injector is alive when the question is asked, and this is
  // asked from key handlers and gesture predicates that can outlive the thing
  // that registered them -- which in the test runner meant reading a torn-down
  // injector. Neither of these two takes part in the `MechanismService` /
  // `GridUtilsService` construction ring, so eager is safe here; the callers on
  // that ring reach *this* service lazily instead.
  private mechanism = inject(MechanismService);
  private tabs = inject(SelectedTabService);

  /** The state the model decides from, read fresh: none of it is observable. */
  state(): EditState {
    const mechanism = this.mechanism;
    return {
      mode: this.mode(),
      playing: mechanism.isPlaying,
      // The service's own answer, which asks every machine's clock. The shared
      // step is not enough: unsynced, a row can be scrubbed mid-cycle while it
      // still reads zero.
      atStart: mechanism.isAtStartPose(),
      sharedStepZero: mechanism.mechanismTimeStep === 0,
      awayMachine: this.machineAwayFromItsStart(),
      solveDeferred: mechanism.solvingIsDeferred,
      empty: mechanism.joints.length === 0 && mechanism.links.length === 0,
      runnable: mechanism.oneValidMechanismExists(),
    };
  }

  /**
   * The first machine parked away from its own start, by name.
   *
   * For the one message that has to name one: unsynced, the shared clock can
   * read zero while a machine sits a third of the way round, and "one of the
   * machines" is a sentence written by something that does not know what the
   * machine is called.
   */
  private machineAwayFromItsStart(): string | undefined {
    const at = this.mechanism.mechanisms.findIndex(
      (_, index) => (this.mechanism.secondsOf(index) ?? 0) > 0
    );
    return at === -1 ? undefined : this.mechanism.partitions[at]?.id;
  }

  private mode(): EditMode {
    const tab = this.tabs.getCurrentTab();
    if (tab === TabID.SYNTHESIZE) return 'synthesis';
    return this.tabs.isAnalysisMode(tab) ? 'analysis' : 'edit';
  }

  /** Why this action is refused, or nothing when it is allowed. */
  refusal(action: EditAction): EditRefusal | null {
    return refusalFor(action, this.state());
  }

  /**
   * Whether the *mode* forbids changing what the mechanism is made of.
   *
   * It used to be `modeLocksGeometry`, and it meant it: an analysis mode
   * refused every edit there was. It refuses restructuring now and lets a drag
   * through, so the honest name is the narrower one -- and the surfaces that
   * quoted the old one have to say which half they meant.
   */
  modeLocksStructure(): boolean {
    return this.mode() === 'analysis';
  }

  /**
   * Why the pose alone forbids an edit, ignoring which mode this is.
   *
   * For the surfaces that answer the mode question themselves and would
   * otherwise refuse twice over -- see `displacementRefusal`.
   */
  poseRefusal(action: EditAction = 'build'): EditRefusal | null {
    const state = this.state();
    // The mode half stripped off, the pose half kept -- including Phase 2's
    // answer, which is that a geometry gesture at a paused pose is allowed.
    return refusalFor(action, { ...state, mode: 'edit' });
  }

  /** The same question where only yes or no is wanted. */
  may(action: EditAction): boolean {
    return this.refusal(action) === null;
  }

  /**
   * The refusal the Edit panel's banner shows, if it shows one.
   *
   * The panel used to vanish outright while the mechanism moved. It stays now,
   * with its fields disabled and this sentence across the top -- so a reader
   * can watch a joint's coordinates tick during playback, which is a small
   * lesson in itself, and so the thing they were editing does not disappear
   * from under them the moment they press Play.
   */
  editingBanner(): EditRefusal | null {
    return this.refusal('placement');
  }

  /**
   * What the transport says when it cannot run, in one visible line.
   *
   * Not a disabled button's tooltip: disabled elements do not reliably show
   * tooltips and touch has no hover, so the reason has to be on the card.
   * Readiness has the specific answer wherever a machine exists to ask, and the
   * model supplies the wording for the two cases where none does -- an empty
   * grid, and geometry that belongs to no machine at all.
   */
  transportHint(): string | null {
    const refusal = this.refusal('transport');
    if (!refusal) return null;
    const blocker = this.firstBlocker();
    return blocker ?? refusal.long;
  }

  /** The worst thing readiness has to say about any machine, if it has one. */
  private firstBlocker(): string | null {
    for (const readiness of this.mechanism.readinessOfEachMechanism()) {
      const blocker = readiness.checks.find((check) => check.state === 'blocker');
      if (blocker) return `${readiness.id}: ${blocker.title}`;
    }
    return null;
  }
}
