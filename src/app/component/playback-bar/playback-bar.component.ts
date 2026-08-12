import { ChangeDetectionStrategy, Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { MechanismService } from '../../services/mechanism.service';
import { SettingsService } from '../../services/settings.service';
import { NumberUnitParserService } from '../../services/number-unit-parser.service';
import { ActiveObjService } from '../../services/active-obj.service';
import { SelectedTabService } from '../../selected-tab.service';
import { TimeUnit } from '../../model/utils';
import { Mechanism } from '../../model/mechanism/mechanism';
import { RealJoint } from '../../model/joint';
import { MODEL_SCALE } from '../../model/render-scale';

/** One line in the transport: a machine, or all of them together. */
export interface PlaybackRow {
  id: string;
  /** -1 for the combined row, which stands for every machine at once. */
  index: number;
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
  /** Which way the input is going right now: "Clockwise", "Retracting", ... */
  note: string;
  playing: boolean;
  /** Whether this line carries a play button of its own. */
  ownPlay: boolean;
  period: number;
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
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class PlaybackBarComponent implements OnInit, OnDestroy {
  private positionSub?: Subscription;
  private dragging = false;
  private wasAnimating = false;
  private wasRowAnimating = false;

  constructor(
    public mechanism: MechanismService,
    public settings: SettingsService,
    public activeObj: ActiveObjService,
    public tabs: SelectedTabService,
    private nup: NumberUnitParserService
  ) {}

  ngOnInit(): void {
    // The rows are rebuilt from the service on every change detection, and the
    // pose moving is what has to trigger one.
    this.positionSub = this.mechanism.onMechPositionChange.subscribe(() => undefined);
  }

  ngOnDestroy(): void {
    this.positionSub?.unsubscribe();
  }

  private format(seconds: number): string {
    return this.nup.formatValueAndUnit(seconds, TimeUnit.SECOND);
  }

  get playing(): boolean {
    return this.mechanism.isPlaying;
  }

  get canPlay(): boolean {
    return this.mechanism.oneValidMechanismExists();
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

    if (runnable.length === 0) {
      return [];
    }

    // Synced, the machines are started and stopped together and there is one
    // answer about what is running -- but not one answer about where anything
    // is, because each measures a different thing. The combined row follows the
    // first machine and says nothing about direction.
    if (this.mechanism.syncMechanisms) {
      const lead = runnable[0];
      const alone = runnable.length === 1;
      return [this.rowFor(lead.index, true, false, alone ? undefined : 'All')];
    }

    return runnable.map(({ index }, position) =>
      this.rowFor(index, position === 0, runnable.length > 1)
    );
  }

  private rowFor(index: number, master: boolean, ownPlay: boolean, name?: string): PlaybackRow {
    const mechanism = this.mechanism.mechanisms[index];
    const seconds = this.mechanism.secondsOf(index);
    const combined = name !== undefined;
    return {
      id: name ?? this.mechanism.partitions[index]?.id ?? `M${index + 1}`,
      index: combined ? -1 : index,
      isMechanism: !combined,
      master,
      time: this.format(seconds),
      position: combined ? '' : this.positionLabel(index),
      scrub: Math.round((this.mechanism.travelOf(index) ?? 0) * 1000),
      clockwise: this.drivenSpeedOf(mechanism) < 0,
      note: combined ? '' : this.noteFor(index),
      playing: this.mechanism.isMechanismPlaying(index),
      ownPlay,
      period: mechanism.cyclePeriod || 1,
    };
  }

  /**
   * Where the input is, in the units the input is measured in.
   *
   * The handle says how far along; this says how far along *what*. A crank
   * reads in degrees of its own turn, a ram in the length its rod has come out.
   */
  private positionLabel(index: number): string {
    const profile = this.mechanism.driveProfileOf(index);
    const along = this.mechanism.travelOf(index);
    if (!profile || along === undefined) {
      return '';
    }
    if (!profile.linear) {
      return `${Math.round(along * 360)}\u00b0`;
    }
    const stroke = this.strokeLength(index);
    return stroke === undefined
      ? `${Math.round(along * 100)}%`
      : this.nup.formatValueAndUnit(along * stroke, this.settings.lengthUnit.value);
  }

  /** How far the input slide travels end to end, in the drawing's own units. */
  private strokeLength(index: number): number | undefined {
    const mechanism = this.mechanism.mechanisms[index];
    const frames = mechanism?.joints ?? [];
    const at = frames[0]?.findIndex((joint) => (joint as RealJoint).input) ?? -1;
    if (at === -1 || frames.length < 2) return undefined;
    let far = 0;
    frames.forEach((frame) => {
      const d = Math.hypot(frame[at].x - frames[0][at].x, frame[at].y - frames[0][at].y);
      if (d > far) far = d;
    });
    return far > 0 ? far / MODEL_SCALE : undefined;
  }

  /**
   * Which way the input is travelling at this moment, in words.
   *
   * A linear drive extends and retracts; a rotary one turns one way or the
   * other. "Reciprocating" said only that the machine was of a kind that turns
   * around, which is not something the reader needs told twice a cycle.
   */
  private noteFor(index: number): string {
    const profile = this.mechanism.driveProfileOf(index);
    const outward = this.mechanism.travellingForward(index);
    if (profile?.linear) {
      return outward ? 'Extending' : 'Retracting';
    }
    return outward ? 'Clockwise' : 'CCW';
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
    const along = Number((event.target as HTMLInputElement).value) / 1000;
    const index = row.index === -1 ? this.mechanism.masterMechanismIndex() : row.index;
    if (index === -1) return;
    if (row.index === -1) {
      // The combined row stands for all of them, so all of them go.
      this.mechanism.seekAllAlong(index, along);
      return;
    }
    this.mechanism.seekMechanismTo(index, along);
  }

  /**
   * Out-and-back rather than round and round.
   *
   * From the sign of the recorded input velocity, which the solver flips at
   * each reversal: a cycle holding both signs is one that turned around.
   */
  private isReciprocating(mechanism: Mechanism): boolean {
    const speeds = mechanism.inputAngularVelocities;
    return speeds.some((speed) => speed > 0) && speeds.some((speed) => speed < 0);
  }

  private drivenSpeedOf(mechanism: Mechanism): number {
    return mechanism.inputAngularVelocities[0] ?? 0;
  }

  play(): void {
    if (!this.canPlay) return;
    // Every row, not just the shared flag: unsynced it is the rows that run,
    // and a master button that left them alone showed a pause icon over a
    // drawing standing still.
    this.mechanism.setAllPlaying(!this.mechanism.isPlaying);
    this.settings.animating.next(this.mechanism.mechanismTimeStep !== 0);
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
    const mechanism = this.mechanism.mechanisms[row.index];
    if (mechanism && this.isReciprocating(mechanism)) {
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
    this.dragging = true;
    if (row && row.ownPlay && row.index >= 0) {
      this.wasRowAnimating = this.mechanism.isMechanismPlaying(row.index);
      if (this.wasRowAnimating) this.mechanism.toggleMechanismPlaying(row.index);
      return;
    }
    this.wasAnimating = this.mechanism.isPlaying;
    this.mechanism.isPlaying = false;
  }

  onScrubUp(row?: PlaybackRow): void {
    this.dragging = false;
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
    this.settings.animating.next(value !== 0);
  }
}
