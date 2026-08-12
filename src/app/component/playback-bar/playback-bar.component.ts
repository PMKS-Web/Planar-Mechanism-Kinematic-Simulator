import { ChangeDetectionStrategy, Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { MechanismService } from '../../services/mechanism.service';
import { SettingsService } from '../../services/settings.service';
import { NumberUnitParserService } from '../../services/number-unit-parser.service';
import { ActiveObjService } from '../../services/active-obj.service';
import { SelectedTabService } from '../../selected-tab.service';
import { TimeUnit } from '../../model/utils';
import { Mechanism } from '../../model/mechanism/mechanism';
import { PrisJoint, RealJoint } from '../../model/joint';

/** One line in the transport: a machine, or all of them together. */
export interface PlaybackRow {
  id: string;
  /** -1 for the combined row, which stands for every machine at once. */
  index: number;
  /** Whether this line is one machine, and so has a direction to flip. */
  isMechanism: boolean;
  /** The line the shared scrubber and the time field belong to. */
  master: boolean;
  /** Where this machine is in its own cycle, as text. */
  time: string;
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
  timeDisplay = '';
  private positionSub?: Subscription;
  private dragging = false;
  private wasAnimating = false;

  constructor(
    public mechanism: MechanismService,
    public settings: SettingsService,
    public activeObj: ActiveObjService,
    public tabs: SelectedTabService,
    private nup: NumberUnitParserService
  ) {}

  ngOnInit(): void {
    // Seed it: the subject only emits when the pose moves, so a mechanism
    // sitting at zero would show an empty time until something played.
    this.timeDisplay = this.format(this.mechanism.currentTimeSeconds());
    this.positionSub = this.mechanism.onMechPositionChange.subscribe(() => {
      // Playback sits between samples, so read the drawn time rather than the
      // time of the sample it was blended from.
      this.timeDisplay = this.format(this.mechanism.currentTimeSeconds());
    });
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

    if (this.mechanism.syncMechanisms) {
      const period = this.mechanism.cyclePeriod() || 1;
      const now = this.mechanism.currentTimeSeconds();
      const lead = runnable[0];
      return [
        {
          id: runnable.length === 1 ? (this.mechanism.partitions[lead.index]?.id ?? 'M1') : 'All',
          index: runnable.length === 1 ? lead.index : -1,
          isMechanism: runnable.length === 1,
          master: true,
          time: this.format(now),
          scrub: this.trackPosition(lead.mechanism, now, period),
          clockwise: this.drivenSpeedOf(lead.mechanism) < 0,
          note: this.noteFor(lead.mechanism, now, lead.index),
          playing: this.playing,
          ownPlay: false,
          period,
        },
      ];
    }

    return runnable.map(({ mechanism, index }, position) => {
      const period = mechanism.cyclePeriod || 1;
      const local = this.mechanism.secondsOf(index);
      return {
        id: this.mechanism.partitions[index]?.id ?? `M${index + 1}`,
        index,
        isMechanism: true,
        master: position === 0,
        time: this.format(local),
        scrub: this.trackPosition(mechanism, local, period),
        clockwise: this.drivenSpeedOf(mechanism) < 0,
        note: this.noteFor(mechanism, local, index),
        playing: this.mechanism.isMechanismPlaying(index),
        ownPlay: runnable.length > 1,
        period,
      };
    });
  }

  /**
   * Where along the track to draw the handle.
   *
   * The handle carries the direction: a clockwise input runs it left to right,
   * a counter-clockwise one right to left. A machine that reverses runs it out
   * and back, because its input does -- its samples go to the limit and return
   * as one cycle, so reading the handle off position in that array would send
   * it round and round, which is the one thing the reversal was worth showing
   * instead of.
   */
  private trackPosition(mechanism: Mechanism, seconds: number, period: number): number {
    const fraction = period > 0 ? Math.min(Math.max(seconds / period, 0), 1) : 0;
    if (this.isReciprocating(mechanism)) {
      return Math.round((fraction <= 0.5 ? fraction * 2 : (1 - fraction) * 2) * 1000);
    }
    const along = this.drivenSpeedOf(mechanism) < 0 ? fraction : 1 - fraction;
    return Math.round(along * 1000);
  }

  /**
   * Which way the input is travelling at this moment, in words.
   *
   * A linear drive extends and retracts; a rotary one turns one way or the
   * other. "Reciprocating" said only that the machine was of a kind that turns
   * around, which is not something the reader needs told twice a cycle.
   */
  private noteFor(mechanism: Mechanism, seconds: number, index: number): string {
    const outward = this.travellingForward(mechanism, seconds, index);
    if (this.isLinearInput(mechanism)) {
      return outward ? 'Extending' : 'Retracting';
    }
    return outward ? 'Clockwise' : 'CCW';
  }

  /**
   * Whether the input is going the way its own drive speed says, right now.
   *
   * Two things can turn it around: the second half of a reversing machine's
   * cycle, and playback being run backwards. Either one on its own flips the
   * answer; both together cancel.
   */
  private travellingForward(mechanism: Mechanism, seconds: number, index: number): boolean {
    const period = mechanism.cyclePeriod || 1;
    const onReturnLeg = this.isReciprocating(mechanism) && seconds / period > 0.5;
    const rewinding = this.mechanism.directionOf(Math.max(index, 0)) < 0;
    const driveIsForward = this.drivenSpeedOf(mechanism) < 0;
    return (driveIsForward !== onReturnLeg) !== rewinding;
  }

  /** A slider or cylinder drive, which extends rather than turns. */
  private isLinearInput(mechanism: Mechanism): boolean {
    return (
      mechanism.joints[0]?.some(
        (joint) => joint instanceof PrisJoint && (joint as RealJoint).input
      ) ?? false
    );
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
   * Drag a row's handle without stopping the animation.
   *
   * The handle is the drive's position, so on a reversing machine the same
   * place on the track means two different times — the way out and the way
   * back. Dragging keeps whichever leg it was already on.
   */
  scrubRow(row: PlaybackRow, event: Event): void {
    const along = Number((event.target as HTMLInputElement).value) / 1000;
    const source =
      row.index === -1 ? this.mechanism.mechanisms[0] : this.mechanism.mechanisms[row.index];
    let fraction = along;
    if (source && this.isReciprocating(source)) {
      const wasReturning = this.mechanism.secondsOf(Math.max(row.index, 0)) / row.period > 0.5;
      fraction = wasReturning ? 1 - along / 2 : along / 2;
    } else if (source && this.drivenSpeedOf(source) >= 0) {
      fraction = 1 - along;
    }
    if (row.index === -1) {
      this.mechanism.animate(this.mechanism.stepAtTime(fraction * row.period), this.playing);
      return;
    }
    this.mechanism.seekMechanism(row.index, fraction * row.period);
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

  onScrubDown(): void {
    this.dragging = true;
    this.wasAnimating = this.mechanism.isPlaying;
    this.mechanism.isPlaying = false;
  }

  onScrubUp(): void {
    this.dragging = false;
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

  onTimeSubmit(): void {
    const [ok, requested] = this.nup.parseTimeString(this.timeDisplay, TimeUnit.SECOND);
    const clamped = Math.min(Math.max(ok ? requested : 0, 0), this.mechanism.cyclePeriod());
    this.mechanism.animate(this.mechanism.stepAtTime(clamped), this.mechanism.isPlaying);
    this.timeDisplay = this.format(this.mechanism.currentTimeSeconds());
  }
}
