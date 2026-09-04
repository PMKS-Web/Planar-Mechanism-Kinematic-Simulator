import {
  AfterViewChecked,
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { animate, style, transition, trigger } from '@angular/animations';
import { turnsClockwise } from '../../model/drive-direction';
import { Subscription } from 'rxjs';
import { MechanismService } from '../../services/mechanism.service';
import { SettingsService } from '../../services/settings.service';
import { NumberUnitParserService } from '../../services/number-unit-parser.service';
import { ActiveObjService } from '../../services/active-obj.service';
import { CHROME_MOVED } from '../../model/chrome-motion';
import { SelectedTabService, TabID } from '../../selected-tab.service';
import { ViewportService } from '../../services/viewport.service';
import { EditPermissionService } from '../../services/edit-permission.service';
import { LoadingService } from '../../services/loading.service';
import { AngleUnit, TimeUnit } from '../../model/utils';
import { MODEL_SCALE } from '../../model/render-scale';
import { MatIcon } from '@angular/material/icon';
import { ViewControlsComponent } from '../view-controls/view-controls.component';
import { MatTooltip } from '@angular/material/tooltip';
import { NgTemplateOutlet } from '@angular/common';
import { KeyboardShortcutsService, ShortcutId } from '../../services/keyboard-shortcuts.service';
import { ShortcutTipDirective } from '../../shortcut-tip.directive';
import { RightPanelComponent } from '../right-panel/right-panel.component';
import { SaveHistoryService } from '../../services/save-history.service';
import { RealJoint } from '../../model/joint';
import { CdkConnectedOverlay, CdkOverlayOrigin, ConnectedPosition } from '@angular/cdk/overlay';

/** What the stylesheet is asked for, and what to assume if it has not loaded. */
const BOTTOM_OFFSET_VAR = '--playback-bottom';
const BOTTOM_OFFSET_FALLBACK = 38;
/** The one gap the chrome keeps between any two cards. */
const CARD_GAP_VAR = '--card-gap';
const CARD_GAP_FALLBACK = 12;

/** A custom property in px, or the fallback where nothing has declared it. */
function cssPixels(style: CSSStyleDeclaration, name: string, fallback: number): number {
  const declared = parseFloat(style.getPropertyValue(name));
  return Number.isFinite(declared) ? declared : fallback;
}

/**
 * What the input does when it reaches the end of its track.
 *
 * Two facts, not a good one and a bad one, so both are drawn in the same gray:
 * a crank comes round again, a ram turns back. On the combined row one of these
 * stands for every machine that behaves that way, which is why the words are
 * carried rather than derived from a flag at the point of drawing.
 */
export interface CycleEnd {
  /** `loop` for a machine that comes round again, `swap_horiz` for one that turns back. */
  glyph: string;
  /** "Loops", "Reverses" -- or, on the combined row, "M1, M2 reverse". */
  text: string;
}

/** One line in the transport: a machine, or all of them together. */
export interface PlaybackRow {
  id: string;
  /** -1 for the combined row, which stands for every machine at once. */
  index: number;
  /** The machine the row's handle is measured against. */
  leader: number;
  /** Whether this line is one machine, and so has a direction to flip. */
  isMechanism: boolean;
  /** The line the shared scrubber and the time field belong to. */
  master: boolean;
  /** How long this machine has been going, from its start pose. */
  time: string;
  /** Where its input is, in the input's own units. */
  position: string;
  /**
   * 0–1000 along the track.
   *
   * For a machine that reverses this runs up and back down again, because the
   * input does: it is the drive's position, not an index into the samples.
   */
  scrub: number;
  clockwise: boolean;
  /**
   * Where along the track this machine's cycle starts, 0-1000, or nothing.
   *
   * Not zero. The handle measures the *input*, not the clock, so the start pose
   * is at the left end of the track only for an input that happens to begin at
   * one end of its travel -- true of a crank, which is measured from the pose
   * it was drawn in, and false of everything that turns back. A rocker drawn
   * mid-swing starts four tenths along its own arc, and the mark sat at the
   * left end claiming the start was somewhere the machine had never been.
   *
   * Nothing for the combined row, which measures time rather than an input:
   * every machine's cycle starts at t = 0, so there the left end is right.
   */
  anchorAt?: number;
  /**
   * Whether this machine passes through a toggle.
   *
   * True exactly when the walk had to cut its step finer somewhere, which is
   * the same question: it does that where a sample moved further than a linkage
   * should move in one frame.
   */
  togglePoint: boolean;
  /** Which way the input is going right now: "Clockwise", "Closing", ... */
  note: string;
  playing: boolean;
  /** Whether this line carries a play button of its own. */
  ownPlay: boolean;
  /**
   * What happens at the end of the cycle: one entry for a machine, and for the
   * combined row one per behavior present among the machines it stands for.
   */
  ends: CycleEnd[];
  period: number;
  /**
   * Why this line cannot be played, when it cannot.
   *
   * A machine that cannot run keeps its row and states its own blocker. The
   * refusal used to be a caption under an empty card -- one sentence for the
   * whole drawing, in a card that changed shape depending on whether anything
   * was runnable. Per-row, it is the same shape in every state and it can name
   * *which* machine is not ready, which a card-wide caption never could.
   */
  refusal?: RowRefusal;
  /**
   * Whether the rail is a flat bar rather than a track.
   *
   * The card keeps its shape in every state and only its contents go inert, so
   * there is still a rail here -- with no cap, no seat and no handle, because
   * none of the three means anything on a cycle that does not exist.
   */
  inert: boolean;
  /**
   * Built, but its motion deliberately not worked out yet.
   *
   * The one refusal that is not one: everything is live and the rail is real.
   * The reading line only warns that pressing Play buys a wait.
   */
  deferred: boolean;
  /**
   * How far this machine is parked from its own start, when it is parked away
   * from it -- the chip that carries "back to the start" and "move it here".
   */
  displaced?: string;
  /**
   * Whether this machine's start has just been moved, and not yet been read
   * past.
   *
   * The notification is the news and is gone in four seconds; this is the
   * record, and it stays until the next transport action -- so the fact
   * survives a reader who looked away, said in the one place that has always
   * meant "where this starts".
   */
  startMoved: boolean;
}

/** A row that cannot be played, in the three pieces the reading line draws. */
export interface RowRefusal {
  /** "2 blockers" -- absent where the sentence stands on its own. */
  count?: string;
  text: string;
  /** The way out, where the drawing offers one. */
  action?: string;
}

/**
 * The transport: what is playing, how fast, and where each machine is in its
 * own cycle.
 *
 * One row per mechanism that can actually run. A mechanism that cannot is not
 * listed at all — a disabled scrubber for a linkage that has no cycle is a
 * control that can only disappoint, and what to do about it is the Analysis
 * setup drawer's job, not a row's.
 *
 * Neither degrees of freedom nor readiness appear here. Being in this list is
 * what "ready" means, so saying it again beside every row is a word that can
 * never read anything but yes.
 */
@Component({
  selector: 'app-playback-bar',
  templateUrl: './playback-bar.component.html',
  styleUrls: ['./playback-bar.component.scss'],
  // Off the bottom of the window and back, rather than fading in place: these
  // cards belong to the analysis modes, and a transport arriving from the edge
  // it lives on reads as the mode bringing its own controls with it.
  animations: [
    trigger('riseFromBottom', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(calc(100% + 38px))' }),
        animate('260ms cubic-bezier(0.4, 0, 0.2, 1)', style({ opacity: 1, transform: 'none' })),
      ]),
      transition(':leave', [
        animate(
          '200ms cubic-bezier(0.4, 0, 1, 1)',
          style({ opacity: 0, transform: 'translateY(calc(100% + 38px))' })
        ),
      ]),
    ]),
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    ShortcutTipDirective,
    MatIcon,
    MatTooltip,
    ViewControlsComponent,
    CdkOverlayOrigin,
    CdkConnectedOverlay,
    NgTemplateOutlet,
  ],
})
export class PlaybackBarComponent implements OnInit, AfterViewInit, AfterViewChecked, OnDestroy {
  mechanism = inject(MechanismService);
  settings = inject(SettingsService);
  activeObj = inject(ActiveObjService);
  tabs = inject(SelectedTabService);
  private nup = inject(NumberUnitParserService);
  shortcuts = inject(KeyboardShortcutsService);
  readonly viewport = inject(ViewportService);
  private permission = inject(EditPermissionService);
  private loading = inject(LoadingService);
  private history = inject(SaveHistoryService);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private changeDetector = inject(ChangeDetectorRef);

  private positionSub?: Subscription;
  private wasAnimating = false;
  private wasRowAnimating = false;

  ngOnInit(): void {
    // The rows are rebuilt from the service on every change detection, and the
    // pose moving is what has to trigger one.
    this.positionSub = this.mechanism.onMechPositionChange.subscribe(() => undefined);
  }

  /**
   * Tell the rest of the chrome how much room this cluster is taking.
   *
   * The panels stop short of the bottom of the window so they do not run under
   * the transport, and that was a fixed 110px -- the height of a transport with
   * one row in it. Unsynced, this card carries a row per machine and grows to
   * twice that, and the setup drawer came down through it. Measured rather than
   * guessed, so a drawing with six machines in it works out the same way.
   */
  ngAfterViewInit(): void {
    const row = this.host.nativeElement.querySelector('.playbackRow') as HTMLElement | null;
    if (!row || typeof ResizeObserver === 'undefined') return;
    this.publishHeight(row);
    this.heightWatch = new ResizeObserver(() => this.publishHeight(row));
    this.heightWatch.observe(row);
  }

  private heightWatch?: ResizeObserver;
  private lastClearance = -1;

  private publishHeight(row: HTMLElement): void {
    // The card's own height, the gap it floats above the status strip, and one
    // more gap between it and whatever stops above it. Both gaps are asked of
    // the stylesheet that sets them rather than restated here: a constant left
    // behind by a restyle is wrong by exactly the amount nobody measures, and
    // the panel above then runs under the transport or stops short of it.
    const style = getComputedStyle(row);
    const clearance =
      Math.round(row.getBoundingClientRect().height) +
      cssPixels(style, BOTTOM_OFFSET_VAR, BOTTOM_OFFSET_FALLBACK) +
      cssPixels(style, CARD_GAP_VAR, CARD_GAP_FALLBACK);
    if (clearance === this.lastClearance) return;
    this.lastClearance = clearance;
    document.documentElement.style.setProperty('--playback-clearance', `${clearance}px`);
    // Where the phone's sheet stands. Not the clearance above: that is what a
    // *side* panel keeps free below itself, and this is the top edge of the row
    // the sheet sits directly on.
    //
    // The row's top, measured, rather than its height plus a nominal gap. It
    // used to be height + `--card-gap`, and the difference between that and
    // where the row really starts -- the 6px it floats above the status strip --
    // came out on the sheet's handle, which stands on this number: shut, the
    // pill sat 6px further off the card below it than it did when the sheet was
    // open. The same control, two gaps, and nothing naming the second one.
    //
    // One whole number, too. `--controls-height` was a height, so both readers
    // wrote `calc($bottom-bar-height + var(...))` and this file had to publish
    // something that came out right after an addition it could not see. The
    // rename is deliberate: a reader still performing that addition is reading a
    // variable that no longer exists, so it falls back to the strip rather than
    // landing 26px out with nothing to show for it.
    //
    // Removed rather than zeroed where there is no row, so the fallback -- the
    // status strip on its own -- applies. Zeroed, the sheet would sit under it.
    const box = row.getBoundingClientRect();
    const root = document.documentElement.style;
    if (box.height > 0) {
      root.setProperty('--controls-top', `${Math.round(window.innerHeight - box.top)}px`);
    } else {
      root.removeProperty('--controls-top');
    }
    // These cards declare the edge they take, so a change in how much of it
    // they take has to reach the canvas. The cluster grows on its own account
    // -- unsyncing gives every machine a row of its own -- and the drawing used
    // to stay where it was while the scrub card came up over it.
    CHROME_MOVED.next();
  }

  /**
   * The transport's own keys. Each goes through the button's own method -- and
   * only where that button is: the transport belongs to the analysis modes, so
   * Space in Edit would be a key with no control behind it, playing a drawing
   * the reader is in the middle of changing.
   */
  private readonly keyed: Partial<Record<ShortcutId, () => void>> = {
    'playback.toggle': () => this.play(),
    // Through the button's own method, like every other key here, so the
    // guard that makes Stop a no-op at the start pose applies to the key too.
    'playback.stop': () => this.stop(),
    'playback.back': () => this.stepBy(-1),
    'playback.forward': () => this.stepBy(1),
    'playback.speed': () => this.canPlay && this.cycleSpeed(),
  };

  private keySub = this.shortcuts.pressed.subscribe((id) => {
    // Wherever the buttons are. The gate used to name the analysis modes,
    // which was the same thing while the transport lived only there; now that
    // it is chrome, the question is whether the control the key stands for is
    // on screen and usable.
    if (this.inSynthesis) return;
    this.keyed[id]?.();
  });

  ngAfterViewChecked(): void {
    this.fitNotes();
  }

  ngOnDestroy(): void {
    this.keySub.unsubscribe();
    this.positionSub?.unsubscribe();
    this.heightWatch?.disconnect();
    document.documentElement.style.removeProperty('--playback-clearance');
  }

  private format(seconds: number): string {
    return this.nup.formatValueAndUnit(seconds, TimeUnit.SECOND);
  }

  get playing(): boolean {
    return this.mechanism.isPlaying;
  }

  get canPlay(): boolean {
    // A deferred drawing counts as playable. Its motion has not been worked
    // out, but pressing Play is exactly the request that works it out -- and a
    // greyed play button on a drawing that would run perfectly well says the
    // opposite of what is true.
    return this.mechanism.oneValidMechanismExists() || this.mechanism.solvingIsDeferred;
  }

  /**
   * Whether the transport is out of scope entirely.
   *
   * Synthesis is a question about a mechanism that does not exist yet, so
   * there is nothing to play; every other mode has a transport, including over
   * an empty grid.
   */
  get inSynthesis(): boolean {
    return this.tabs.getCurrentTab() === TabID.SYNTHESIZE;
  }

  /**
   * The one line the greyed card carries, or nothing when it can run.
   *
   * Readiness has the specific answer wherever a machine exists to ask it, and
   * the permission model supplies the wording for the two cases where none
   * does -- an empty grid, and geometry that belongs to no machine at all.
   */
  get hint(): string | null {
    return this.permission.transportHint();
  }

  /**
   * The rows this screen shows.
   *
   * A phone shows the shared row and no more: parking mid-cycle is what posed
   * editing needs on every platform, but a stack of per-machine rows is the
   * bottom half of a phone. `rows` reads a phone as synced, so there is one
   * row there by construction rather than by filtering -- filtering picked the
   * *first machine's* private row out of an unsynced set, which controlled one
   * machine while looking like it controlled the drawing.
   */
  get shownRows(): PlaybackRow[] {
    return this.rows;
  }

  /**
   * Which row has its start menu open, by index, or nothing.
   *
   * Held here rather than on the row: `rows` is rebuilt from the service on
   * every change-detection pass, so anything stored on a row lives for one
   * frame.
   */
  startMenuFor: number | null = null;

  /**
   * Upward, always, with the left edges aligned and a 6px gap.
   *
   * One position and no fallbacks: the transport sits 38px off the bottom of
   * the window, so there is never downward room, and a menu that could flip is
   * a menu whose height has to be guessed at rather than fixed.
   */
  readonly startMenuPosition: ConnectedPosition[] = [
    { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -6 },
  ];

  /**
   * Where to draw the empty seat, or nothing when the handle is standing in it.
   *
   * The mark exists exactly when it means something. At the start there is
   * nothing to point at -- the handle is already there -- and a tick that never
   * moves is a tick nobody reads.
   */
  seatFor(row: PlaybackRow): { percent: number; covered: boolean } | null {
    if (row.anchorAt === undefined) return null;
    // A thousandth of the track is a third of a pixel; anything closer than a
    // couple of them is the handle sitting in the seat.
    const apart = Math.abs(row.scrub - row.anchorAt);
    if (apart < 8) return null;
    // Within a handle's width the two overlap, and the handle is the one a
    // press there is reaching for: a seat drawn over it took the press and
    // sent the machine back to the start instead of picking the handle up.
    return { percent: row.anchorAt / 10, covered: apart < 60 };
  }

  /**
   * Take back the edit that moved the start, and the old start with it.
   *
   * The same Undo the message carried: one thing happened, so one thing takes
   * it back.
   */
  undoStartMove(): void {
    this.mechanism.clearStartMoved();
    this.history.undo();
  }

  /** Back to where this machine's cycle starts. */
  backToStart(row: PlaybackRow): void {
    this.startMenuFor = null;
    this.mechanism.clearStartMoved();
    if (row.index === -1) {
      this.stop();
      return;
    }
    if (this.mechanism.isMechanismPlaying(row.index)) {
      this.mechanism.toggleMechanismPlaying(row.index);
    }
    this.mechanism.seekMechanism(row.index, 0);
  }

  toggleStartMenu(row: PlaybackRow): void {
    this.startMenuFor = this.startMenuFor === row.index ? null : row.index;
  }

  /**
   * Promote the pose on screen to this machine's start.
   *
   * It used to live in the right-click menu, where it was a fact about whatever
   * joint the pointer happened to be over -- while what it actually changes is
   * the machine's clock, and the rest of that clock is on this card.
   */
  moveStartHere(row: PlaybackRow): void {
    this.startMenuFor = null;
    const part = this.mechanism.partitions[row.index]?.ownJoints[0];
    if (part) this.mechanism.setCurrentPoseAsStart(part);
  }

  /**
   * The drawer that says what a machine is still missing.
   *
   * The same call the mechanism panel's own button makes, so the two ways in
   * land on the same page.
   */
  openSetup(): void {
    RightPanelComponent.tabClicked(
      this.tabs.getCurrentTab() === TabID.FORCE
        ? RightPanelComponent.FORCE_SETUP_TAB
        : RightPanelComponent.KINEMATIC_SETUP_TAB
    );
  }

  get speed(): number {
    return this.mechanism.animationSpeedMultiplier;
  }

  /** The scrubber spans the longest cycle in the drawing; shorter ones wrap. */
  get maxStep(): number {
    const master = this.mechanism.masterMechanism();
    return master ? master.joints.length - 1 : 0;
  }

  get step(): number {
    return this.mechanism.mechanismTimeStep;
  }

  /**
   * One line per machine that can run — or one line for all of them, synced.
   *
   * Synced, the machines move together and there is nothing to say about them
   * separately, so they collapse to a single `All` row. A row carries a play
   * button only when it is one of several being controlled apart; otherwise the
   * transport's own button is the only one, and two buttons doing the same
   * thing side by side is worse than one.
   */
  get rows(): PlaybackRow[] {
    const runnable = this.mechanism.mechanisms
      .map((mechanism, index) => ({ mechanism, index }))
      .filter(({ mechanism }) => mechanism.isMechanismValid());

    // A drawing with nothing runnable in it still has rows: one per machine
    // that cannot run, each stating its own blocker, or -- with nothing drawn
    // at all -- the one line that says so. The card keeps its shape either way,
    // which is the whole reason the inert rail had to be a rail rather than a
    // caption under an empty card.
    //
    // Except a drawing whose motion has merely not been worked out yet, which
    // is the one refusal that is not one. Nothing is wrong with it and every
    // control is live; it is waiting to be asked. Solving is what fills
    // `mechanisms`, so a deferred drawing has nothing valid in it and would
    // otherwise fall into the refusal path -- where it drew a dead rail under
    // an empty sentence, because there is no blocker to name and the transport
    // is not refused.
    if (runnable.length === 0) {
      return this.mechanism.solvingIsDeferred ? this.deferredRows() : this.refusalRows();
    }

    // Synced, the machines are started and stopped together and there is one
    // answer about what is running -- but not one answer about where anything
    // is, because each measures a different thing. The combined row follows the
    // first machine and says nothing about direction.
    //
    // A phone reads as synced whether it is or not: the control that unsyncs a
    // drawing is desktop-only, so a phone that inherited an unsynced state --
    // from a URL, or from the window being narrowed -- would otherwise get the
    // *first machine's* private row, labeled M1 and moving only M1, with no
    // way to reach the others and nothing saying so.
    if (this.mechanism.syncMechanisms || this.viewport.isPhone()) {
      // The longest cycle in the drawing, so one handle can reach every frame
      // of every machine. Following the first one instead left the slower
      // machines with a stretch at the end of their cycles the handle could
      // not get to.
      const lead = runnable.reduce((longest, candidate) =>
        candidate.mechanism.cyclePeriod > longest.mechanism.cyclePeriod ? candidate : longest
      );
      const alone = runnable.length === 1;
      if (alone) {
        return [this.rowFor(lead.index, true, false)];
      }
      // Synced, the row stands for every machine at once, so what happens at
      // the end of the cycle is said about the group rather than about the one
      // machine the handle happens to follow.
      return [
        this.rowFor(
          lead.index,
          true,
          false,
          'All',
          this.combinedEnds(runnable.map((r) => r.index))
        ),
      ];
    }

    return runnable.map(({ index }, position) =>
      this.rowFor(index, position === 0, runnable.length > 1)
    );
  }

  private rowFor(
    index: number,
    master: boolean,
    ownPlay: boolean,
    name?: string,
    ends?: CycleEnd[]
  ): PlaybackRow {
    const mechanism = this.mechanism.mechanisms[index];
    const seconds = this.mechanism.secondsOf(index);
    const combined = name !== undefined;
    return {
      id: name ?? this.nameOf(index),
      // Sample 0 is the start pose by construction -- re-anchoring is what
      // makes that true after an edit at a pose -- so where the start is on
      // *this* track is where sample 0's input sits along the input's travel.
      //
      // The combined row gets one too, and there it is zero: that handle
      // measures the shared clock, which every machine starts at.
      anchorAt: combined
        ? 0
        : Math.round((this.mechanism.driveProfileOf(index)?.along[0] ?? 0) * 1000),
      index: combined ? -1 : index,
      leader: index,
      isMechanism: !combined,
      master,
      time: this.format(seconds),
      position: combined ? '' : this.positionLabel(index),
      // A machine's own handle is where its input has got to; the combined one
      // is where the clock has got to. See `seekAllAlong`: an input that rocks
      // is in the same place twice a cycle, and a handle that means two times
      // at once cannot be dragged.
      scrub: combined
        ? Math.round(Math.min(Math.max(seconds / (mechanism.cyclePeriod || 1), 0), 1) * 1000)
        : Math.round((this.mechanism.travelOf(index) ?? 0) * 1000),
      // The same answer the note beside it is written from, so the glyph and
      // the word can never disagree. Read off the drive alone, the glyph never
      // changed on a machine whose input reverses on its own: turning one of
      // those round writes `playbackDirection` and leaves the drive as it was.
      clockwise: this.mechanism.travelingForward(index),
      togglePoint: mechanism?.hasAddedSamples ?? false,
      note: combined ? '' : this.noteFor(index),
      playing: this.mechanism.isMechanismPlaying(index),
      ownPlay,
      ends: ends ?? [this.endOf(index)],
      period: mechanism.cyclePeriod || 1,
      inert: false,
      deferred: this.mechanism.solvingIsDeferred,
      startMoved: !combined && this.mechanism.startMovedOn === this.nameOf(index),
      // Only where the reader is actually parked away from the start, and only
      // on a machine's own row: the combined row stands for several cycles, and
      // "142 degrees from start" is a fact about one input.
      displaced: combined ? undefined : this.displacementOf(index),
    };
  }

  /**
   * How far this machine is parked from its own start, in the input's own
   * units, or nothing when it is standing on it.
   *
   * A *distance*, which is what "from start" says and what the chip did not
   * used to carry: it printed the readout beside it, which is where the input
   * is, and the two agree only for an input measured from the pose it was drawn
   * in. A rocker drawn mid-swing reads 24 degrees at its own start, so a chip
   * saying "24 degrees from start" appeared over a machine standing exactly on
   * its start with 0.00 s beside it.
   *
   * And parked is a fact about the clock, not about the input. A reversing
   * input passes every value in its range twice, so "back at the angle it
   * started at" is a pose the machine reaches half a cycle from home.
   */
  private displacementOf(index: number): string | undefined {
    if (this.mechanism.isMechanismPlaying(index)) return undefined;
    if (this.mechanism.secondsOf(index) === 0) return undefined;
    const label = this.offsetLabel(index);
    return label ? `${label} from start` : undefined;
  }

  /**
   * The gap between the input now and the input at the start pose.
   *
   * Off the profile's own coordinate rather than off the readout: `along` is
   * the fraction of the input's whole travel, and `span` is what that travel is
   * worth -- radians for a crank, model units for a slide -- so the two
   * multiply out to the quantity the reader is owed in either kind of input.
   *
   * Unsigned. Which way it went is what the direction note beside it says, and
   * a minus sign in front of a degree count reads as a bearing rather than as a
   * distance.
   *
   * Nothing where the number would round to a zero, in whichever unit it is
   * being said in. `Back to the start` eases rather than cutting, so the last
   * frame or two of it are a fraction of a degree out, and a chip reading
   * "0 degrees from start" contradicts itself once per press of Stop. It is
   * also the rule the seat already follows, so the two marks agree: at the
   * input value the cycle starts at, neither of them appears.
   */
  private offsetLabel(index: number): string | undefined {
    const profile = this.mechanism.driveProfileOf(index);
    const along = this.mechanism.travelOf(index);
    if (!profile || along === undefined) return undefined;
    const fraction = Math.abs(along - (profile.along[0] ?? 0));
    if (!(profile.span > 0)) {
      const percent = Math.round(fraction * 100);
      return percent === 0 ? undefined : `${percent}%`;
    }
    if (!profile.linear) {
      const degrees = Math.round((fraction * profile.span * 180) / Math.PI);
      return degrees === 0 ? undefined : this.angleText(degrees);
    }
    const shown = this.nup.formatValueAndUnit(
      (fraction * profile.span) / MODEL_SCALE,
      this.settings.lengthUnit.value
    );
    return parseFloat(shown) === 0 ? undefined : shown;
  }

  /**
   * One row per machine that cannot run, or the empty-grid line.
   *
   * Named, not counted: the app knows what the machine is called, so the row
   * says "M1" and its own blocker rather than one sentence standing for
   * however many machines happen to be broken.
   */
  private refusalRows(): PlaybackRow[] {
    const readiness = this.mechanism.readinessOfEachMechanism();
    const rows = readiness.map((one, index) => {
      const blockers = one.checks.filter((check) => check.state === 'blocker');
      return this.inertRow(one.id, index, {
        count: blockers.length
          ? `${blockers.length} ${blockers.length === 1 ? 'blocker' : 'blockers'}`
          : undefined,
        // The count is drawn as a chip, so the sentence has to read *through*
        // it: "M1 [1 blocker] before it will run" was missing the word that
        // joins the two. Every other surface saying the same thing has one --
        // the bottom bar's "1 fix before analysis", the drawer's "1 thing has
        // to change before this mechanism will run".
        text: blockers.length ? 'to fix before it will run.' : 'before it will run.',
        action: 'Analysis setup',
      });
    });
    if (rows.length) return rows;
    // Nothing drawn, or geometry belonging to no machine at all. One line, and
    // no name to put on it.
    return [
      this.inertRow('', 0, {
        text:
          this.permission.transportHint() ??
          this.permission.refusal('transport')?.long ??
          'Nothing here can run yet.',
      }),
    ];
  }

  /**
   * One row per machine in a drawing that has not been solved yet.
   *
   * A real rail with the handle at the start, live controls, and a reading line
   * that says what pressing Play buys. A machine that could not run even once
   * solved still states its blocker, because that is true whether or not the
   * motion has been worked out.
   */
  private deferredRows(): PlaybackRow[] {
    // From the partitions, not from readiness: readiness is built from solved
    // mechanisms, and a deferred drawing has none -- so asking it here returned
    // an empty list, and the card drew nothing at all.
    return this.mechanism.partitions.map((partition, index) => {
      const driven = partition.ownJoints.find(
        (joint) => joint instanceof RealJoint && joint.input
      ) as RealJoint | undefined;
      // Undriven is the one thing that can be said without solving. Everything
      // else -- mobility, a slot with nowhere to go -- is what the solve is for,
      // and guessing at it here would be a refusal the model has not made.
      if (!driven) {
        return this.inertRow(partition.id, index, {
          text: 'needs a drive before it will run.',
          action: 'Analysis setup',
        });
      }
      return {
        id: partition.id,
        index,
        leader: index,
        isMechanism: true,
        master: index === 0,
        time: this.format(0),
        position: '',
        scrub: 0,
        // Where it will start, which is where it is standing: the handle is in
        // its seat, so no seat is drawn.
        anchorAt: 0,
        clockwise: driven ? turnsClockwise(this.mechanism.driveSpeedOf(driven)) : true,
        togglePoint: false,
        note: '',
        playing: false,
        ownPlay: false,
        ends: [],
        period: 1,
        inert: false,
        deferred: true,
        startMoved: false,
      };
    });
  }

  /** A row with no cycle behind it: the reading line, and a flat rail. */
  private inertRow(id: string, index: number, refusal: RowRefusal): PlaybackRow {
    return {
      id,
      index,
      leader: index,
      isMechanism: false,
      master: index === 0,
      time: '',
      position: '',
      scrub: 0,
      clockwise: true,
      anchorAt: undefined,
      togglePoint: false,
      note: '',
      playing: false,
      ownPlay: false,
      ends: [],
      period: 1,
      refusal,
      inert: true,
      deferred: false,
      startMoved: false,
    };
  }

  /** An angle in degrees, written the way this document writes angles. */
  private angleText(degrees: number): string {
    const unit = this.settings.angleUnit.value;
    return this.nup.formatValueAndUnit(
      this.nup.convertAngle(degrees, AngleUnit.DEGREE, unit),
      unit
    );
  }

  /**
   * Where the input is, in the units the input is measured in.
   *
   * The handle says how far along; this says how far along *what*. A crank
   * reads in degrees of its own turn, a ram in the length its rod has come out
   * past the shortest it gets.
   */
  private positionLabel(index: number): string {
    const profile = this.mechanism.driveProfileOf(index);
    const along = this.mechanism.travelOf(index);
    if (!profile || along === undefined) {
      return '';
    }
    if (!profile.linear) {
      const bearing = this.mechanism.inputAngleDegrees(index);
      // In the unit the reader asked for. This card spelled its own degree
      // sign, so it went on saying "80°" over a document set to radians --
      // while the bottom bar said "radians", the panels said "1.05 rad" and
      // this card's own *length* readout converted properly.
      return bearing === undefined ? '' : this.angleText(bearing);
    }
    // A loop has a span now, but no low end to measure a position above: what
    // `along` counts there is distance from the drawn pose, not a place in a
    // stroke. So the fraction stands, as it did when the span was zero.
    if (profile.continuous || !(profile.span > 0)) {
      return `${Math.round(along * 100)}%`;
    }
    return this.nup.formatValueAndUnit(
      (along * profile.span) / MODEL_SCALE,
      this.settings.lengthUnit.value
    );
  }

  /**
   * Which way the input is traveling at this moment, in words.
   *
   * A linear drive extends and retracts; a rotary one turns one way or the
   * other. "Reciprocating" said only that the machine was of a kind that turns
   * around, which is not something the reader needs told twice a cycle.
   */
  private noteFor(index: number): string {
    const profile = this.mechanism.driveProfileOf(index);
    const outward = this.mechanism.travelingForward(index);
    if (profile?.linear) {
      return outward ? 'Opening' : 'Closing';
    }
    return outward ? 'Clockwise' : 'Counter-clockwise';
  }

  /**
   * The note as it fits. "Counter-clockwise" is the longest thing on a reading
   * line that also has to hold a chip and a time, and cut to "Counter-cl…" it
   * says nothing; "CCW" says the whole thing in the room there is. Whether
   * there is room is measured, per row, after every layout.
   */
  noteText(row: PlaybackRow): string {
    if (!this.shortNotes.has(row.index)) return row.note;
    if (row.note === 'Clockwise') return 'CW';
    if (row.note === 'Counter-clockwise') return 'CCW';
    return row.note;
  }

  /** The rows whose reading line cannot hold the note in full. */
  private shortNotes = new Set<number>();
  private noteFitKey = '';

  /**
   * Measure the notes against the room they have, and remember which need
   * shortening. Done after each check rather than on a resize alone, because
   * what shares the line -- the start chip, a refusal -- comes and goes with
   * the state, not the window.
   */
  private fitNotes(): void {
    const host = this.host.nativeElement as HTMLElement;
    const notes = [...host.querySelectorAll<HTMLElement>('.rowNote[data-row]')];
    const key = notes
      .map((note) => `${note.dataset['row']}:${note.dataset['full']}:${note.parentElement?.clientWidth}`)
      .join('|');
    if (key === this.noteFitKey) return;
    this.noteFitKey = key;
    let changed = false;
    for (const note of notes) {
      const index = Number(note.dataset['row']);
      const line = note.parentElement;
      if (!line) continue;
      // The room is what the line has left once everything else on it is
      // placed; the full note's own width is measured off screen.
      const others = [...line.children].filter((child) => child !== note) as HTMLElement[];
      const gap = parseFloat(getComputedStyle(line).columnGap) || 0;
      const taken = others.reduce((sum, child) => sum + child.offsetWidth, 0) + gap * others.length;
      const room = line.clientWidth - taken;
      const full = this.widthOf(note, note.dataset['full'] ?? '');
      const wants = full > room + 0.5;
      if (wants !== this.shortNotes.has(index)) {
        if (wants) this.shortNotes.add(index);
        else this.shortNotes.delete(index);
        changed = true;
      }
    }
    if (changed) this.changeDetector.detectChanges();
  }

  private widthOf(like: HTMLElement, text: string): number {
    const probe = document.createElement('span');
    probe.textContent = text;
    probe.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:${getComputedStyle(like).font}`;
    like.parentElement?.appendChild(probe);
    const width = probe.offsetWidth;
    probe.remove();
    return width;
  }

  /** Only worth offering when there is more than one machine to get out of step. */
  get canSync(): boolean {
    return this.mechanism.mechanisms.filter((m) => m.isMechanismValid()).length > 1;
  }

  get synced(): boolean {
    return this.mechanism.syncMechanisms;
  }

  toggleSync(): void {
    this.mechanism.setSyncMechanisms(!this.mechanism.syncMechanisms);
  }

  /** The chip names a machine, so pressing it selects that machine. */
  selectMechanism(row: PlaybackRow): void {
    if (row.index >= 0) {
      this.activeObj.selectMechanism(row.index);
    }
  }

  /** Light the machine up on the canvas while the reader points at its name. */
  hoverMechanism(row: PlaybackRow, over: boolean): void {
    this.mechanism.hoveredMechanismIndex = over && row.index >= 0 ? row.index : -1;
  }

  isSelected(row: PlaybackRow): boolean {
    return (
      this.activeObj.getSelectedObjType() === 'Mechanism' &&
      this.activeObj.selectedMechanismIndex === row.index
    );
  }

  toggleRow(row: PlaybackRow): void {
    // Any transport action is the reader moving on from the news that the
    // start moved, so the row stops carrying it.
    this.mechanism.clearStartMoved();
    this.mechanism.toggleMechanismPlaying(row.index);
  }

  /**
   * Drag a row's handle to a place along its input's travel.
   *
   * The handle is a position, so this is a position. What time that is, is the
   * service's problem -- and on a machine that turns back it is two times, one
   * on each leg, which is why it is told where the machine is now.
   */
  scrubRow(row: PlaybackRow, event: Event): void {
    // Any transport action is the reader moving on from the news that the
    // start moved, so the row stops carrying it.
    this.mechanism.clearStartMoved();
    const along = Number((event.target as HTMLInputElement).value) / 1000;
    if (row.index === -1) {
      // The combined row stands for all of them, so all of them go -- led by
      // the longest cycle, which is the one whose frames the handle spans.
      this.mechanism.seekAllAlong(row.leader, along);
      return;
    }
    this.mechanism.seekMechanismTo(row.index, along);
    this.publishMotion();
  }

  /**
   * Keep the app's "is anything moving" answer honest.
   *
   * `settings.animating` is a mirror this bar pushes, and the shared sample
   * index it is read beside cannot answer for a drawing whose machines run on
   * their own clocks: seeking an unsynced row that is not the master leaves
   * `mechanismTimeStep` at 0 over a visibly displaced machine. Five surfaces
   * decide "may I edit now" from that pair, and two of them -- Undo and the
   * unit controls -- write to the drawing on the strength of it.
   *
   * So the value pushed is the model's own, rather than a fact about whichever
   * seek happened to run last.
   */
  private publishMotion(): void {
    this.settings.animating.next(!this.mechanism.isAtStartPose());
  }

  /**
   * Which handle this is, for a reader who cannot see which row it is on.
   *
   * Unsynced, the card carries one identical 0–1000 slider per machine, and
   * the name of the machine is the only thing that tells them apart.
   */
  scrubLabel(row: PlaybackRow): string {
    return row.isMechanism
      ? `${row.id} position in its cycle`
      : 'Position in the cycle, all mechanisms together';
  }

  /** What the machine is called, everywhere the transport has to name it. */
  private nameOf(index: number): string {
    return this.mechanism.partitions[index]?.id ?? `M${index + 1}`;
  }

  /**
   * What this machine does when its handle reaches the end of the track.
   *
   * The row said where the input was and which way it was going, and nothing at
   * all about either end of the track -- so a handle that jumped back to the
   * start and a handle that turned round and came back looked the same until
   * you watched one happen.
   */
  private endOf(index: number): CycleEnd {
    return this.endWords(!this.mechanism.mechanisms[index].reciprocates);
  }

  private endWords(loops: boolean): CycleEnd {
    return { glyph: loops ? 'loop' : 'swap_horiz', text: loops ? 'Loops' : 'Reverses' };
  }

  /**
   * The same fact about several machines at once.
   *
   * Grouped by behavior rather than listed per machine: what the reader wants
   * from the combined row is how many kinds of ending there are, and with one
   * kind the names are noise -- the row is already called All.
   */
  private combinedEnds(indices: number[]): CycleEnd[] {
    const groups = new Map<boolean, string[]>();
    indices.forEach((index) => {
      const loops = !this.mechanism.mechanisms[index].reciprocates;
      groups.set(loops, [...(groups.get(loops) ?? []), this.nameOf(index)]);
    });
    if (groups.size === 1) {
      return [this.endWords([...groups.keys()][0])];
    }
    return [...groups].map(([loops, names]) => {
      // One machine is the subject of a singular verb, several of a plural one.
      const verb = loops ? 'loop' : 'reverse';
      return {
        glyph: this.endWords(loops).glyph,
        text: `${names.join(', ')} ${names.length === 1 ? verb + 's' : verb}`,
      };
    });
  }

  /**
   * One frame along, and round the cycle rather than up against its end.
   *
   * Measured in *time*, which is what a frame is. A machine's own handle
   * measures how far its input has come -- degrees of crank, centimeters of ram
   * -- and stepping in those units is only the same motion while the input
   * never turns round. A ram's travel stops changing at each end of its stroke,
   * so a step of one frame's worth of travel asked for a position past the end
   * of the stroke, got the end of the stroke back, and the key stopped working:
   * `Cylinder_Boom` and `Backhoe_Bucket` moved not at all, `Cylinder_Gripper`
   * and `Chebyshev_Straight_Line` a couple of frames before sticking. Time has
   * no turning points, and one frame is the period over the frame count
   * wherever in the cycle it is taken.
   *
   * It also stops the reading being rounded on the way through: the handle's
   * position is a whole number of thousandths, and a cycle of more than a
   * thousand frames -- or one merely near it -- loses frames to that rounding.
   * The combined handle reached 334 of a 359-frame cycle.
   *
   * Wrapped, because the cycle is a loop and holding an arrow down should go on
   * round it. `seekMechanism` wraps seconds itself; the fraction the combined
   * handle takes is clamped, so it is wrapped here before it is handed over.
   *
   * Paused first, because a step is a look at one pose and playback would carry
   * it off before it could be read.
   */
  stepBy(delta: number): void {
    // Any transport action is the reader moving on from the news that the
    // start moved, so the row stops carrying it.
    this.mechanism.clearStartMoved();
    if (!this.canPlay) return;
    const master = this.rows.find((row) => row.master);
    if (!master) return;
    const period = this.mechanism.mechanisms[master.leader]?.cyclePeriod ?? 0;
    if (!(period > 0)) return;
    if (this.mechanism.isPlaying) this.mechanism.setAllPlaying(false);
    // By frame, and asked of the cycle rather than of the clock. Stepping a
    // fixed amount of time works only while the samples are evenly spread
    // through the cycle, and it loses the last one either way: a cycle's period
    // *is* the time of its final sample, so the step that should land on it
    // computes exactly one period and wraps to zero instead. Asking
    // `timeAtStep` for the frame reads the sample's own time, whatever the
    // spacing, and the frame is what an arrow key means.
    //
    // Round `frames`, not `frames + 1`: the last sample closes the cycle on the
    // first, so those two are one position and stepping through both would show
    // the same pose twice at the seam.
    const frames = Math.max(this.maxStep, 1);
    const current = this.mechanism.mechanismTimeStep;
    const next = (((current + delta) % frames) + frames) % frames;
    const seconds = this.mechanism.timeAtStep(next);
    if (master.index === -1) {
      this.mechanism.seekAllAlong(master.leader, seconds / period);
    } else {
      this.mechanism.seekMechanism(master.leader, seconds);
    }
    this.publishMotion();
  }

  play(): void {
    // Any transport action is the reader moving on from the news that the
    // start moved, so the row stops carrying it.
    this.mechanism.clearStartMoved();
    if (!this.canPlay) return;
    // A drawing large enough to have had its solve deferred has no cycle to
    // play yet. Pressing Play is the request for one, and it takes the thread
    // for seconds -- so it goes behind the same cover the mode buttons use
    // rather than freezing the window with no sign that anything is happening.
    if (this.mechanism.solvingIsDeferred) {
      void this.loading
        .during('Working out the motion…', () => this.mechanism.solveNow())
        .then(() => this.startPlaying());
      return;
    }
    this.startPlaying();
  }

  private startPlaying(): void {
    if (!this.mechanism.oneValidMechanismExists()) return;
    // Every row, not just the shared flag: unsynced it is the rows that run,
    // and a master button that left them alone showed a pause icon over a
    // drawing standing still.
    this.mechanism.setAllPlaying(!this.mechanism.isPlaying);
    this.publishMotion();
  }

  /**
   * Whether there is anything to come back from.
   *
   * A machine at the start of its cycle is already showing the pose it was
   * drawn in, and a button that does nothing when pressed is worse than one
   * that says so.
   */
  get canStop(): boolean {
    return this.canPlay && !this.mechanism.isAtStartPose();
  }

  /**
   * Back to the pose the mechanism was drawn in.
   *
   * Eased rather than cut, and by whichever way round is shorter for each
   * machine: a linkage that teleports reads as the drawing breaking, where the
   * same move played over a fifth of a second reads as playback ending.
   */
  stop(): void {
    // Any transport action is the reader moving on from the news that the
    // start moved, so the row stops carrying it.
    this.mechanism.clearStartMoved();
    if (!this.canPlay) return;
    this.mechanism.setAllPlaying(false);
    this.settings.animating.next(false);
    this.mechanism.easeToStart();
  }

  cycleSpeed(): void {
    // 1x plays back in real time: one revolution takes 60/RPM seconds. The
    // other stops are explicit fast-forwards for slow input speeds.
    const rates = [1, 2, 4];
    const next = rates.indexOf(this.mechanism.animationSpeedMultiplier) + 1;
    this.mechanism.animationSpeedMultiplier = rates[next % rates.length];
  }

  /**
   * Turn this machine round.
   *
   * A continuously driven machine is turned round by reversing its drive; a
   * machine whose input already reverses on its own has no other direction to
   * be driven in, so the only thing left to turn round is playback, and that is
   * a view of the same motion rather than a change to the drawing.
   *
   * Either way nothing moves. The linkage holds the pose it was in and the
   * handle holds its place; the time is what jumps.
   */
  flipDirection(row: PlaybackRow): void {
    // Any transport action is the reader moving on from the news that the
    // start moved, so the row stops carrying it.
    this.mechanism.clearStartMoved();
    const mechanism = this.mechanism.mechanisms[row.index];
    if (mechanism?.reciprocates) {
      this.mechanism.setPlaybackDirection(row.index, -this.mechanism.directionOf(row.index));
      return;
    }
    this.mechanism.reverseDrive(row.index);
  }

  /**
   * Dragging one machine's handle stops that machine, not the drawing.
   *
   * The rows have their own clocks precisely so they can be read apart; pausing
   * everything to scrub one of them threw that away.
   */
  onScrubDown(row?: PlaybackRow): void {
    if (row && row.ownPlay && row.index >= 0) {
      this.wasRowAnimating = this.mechanism.isMechanismPlaying(row.index);
      if (this.wasRowAnimating) this.mechanism.toggleMechanismPlaying(row.index);
      return;
    }
    this.wasAnimating = this.mechanism.isPlaying;
    this.mechanism.isPlaying = false;
  }

  onScrubUp(row?: PlaybackRow): void {
    if (row && row.ownPlay && row.index >= 0) {
      if (this.wasRowAnimating && !this.mechanism.isMechanismPlaying(row.index)) {
        this.mechanism.toggleMechanismPlaying(row.index);
      }
      this.wasRowAnimating = false;
      return;
    }
    if (this.wasAnimating) {
      this.mechanism.isPlaying = true;
      this.mechanism.animate(this.mechanism.mechanismTimeStep, true);
    }
  }

  onScrub(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.mechanism.animate(value, this.mechanism.isPlaying);
    this.publishMotion();
  }
}
