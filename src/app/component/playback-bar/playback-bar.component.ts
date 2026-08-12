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

/** One machine's line in the transport. */
export interface PlaybackRow {
  id: string;
  index: number;
  /** Where this machine is in its own cycle, as text. */
  time: string;
  /** 0–1000, its own position within its own cycle. */
  scrub: number;
  clockwise: boolean;
  /** Out-and-back, rather than round and round. */
  reciprocating: boolean;
  playing: boolean;
  /** Seconds, for its own scrubber. */
  seconds: number;
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

  /** Only the machines that can run. */
  get rows(): PlaybackRow[] {
    return this.mechanism.mechanisms
      .map((mechanism, index) => ({ mechanism, index }))
      .filter(({ mechanism }) => mechanism.isMechanismValid())
      .map(({ mechanism, index }) => {
        const period = mechanism.cyclePeriod || 1;
        const local = this.mechanism.secondsOf(index);
        return {
          id: this.mechanism.partitions[index]?.id ?? `M${index + 1}`,
          index,
          time: this.format(local),
          scrub: Math.round((local / period) * 1000),
          clockwise: this.drivenSpeedOf(mechanism, index) < 0,
          reciprocating: this.isReciprocating(mechanism),
          playing: this.mechanism.isMechanismPlaying(index),
          seconds: local,
          period,
        };
      });
  }

  /** Only worth offering when there is more than one machine to get out of step. */
  get canSync(): boolean {
    return this.rows.length > 1;
  }

  get synced(): boolean {
    return this.mechanism.syncMechanisms;
  }

  toggleSync(): void {
    this.mechanism.setSyncMechanisms(!this.mechanism.syncMechanisms);
  }

  toggleRow(row: PlaybackRow): void {
    this.mechanism.toggleMechanismPlaying(row.index);
  }

  scrubRow(row: PlaybackRow, event: Event): void {
    const fraction = Number((event.target as HTMLInputElement).value) / 1000;
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

  private drivenSpeedOf(mechanism: Mechanism, index: number): number {
    return mechanism.inputAngularVelocities[0] ?? 0;
  }

  play(): void {
    if (!this.canPlay) return;
    this.mechanism.isPlaying = !this.mechanism.isPlaying;
    this.mechanism.animate(this.mechanism.mechanismTimeStep, this.mechanism.isPlaying);
    this.settings.animating.next(this.mechanism.mechanismTimeStep !== 0);
  }

  cycleSpeed(): void {
    // 1x plays back in real time: one revolution takes 60/RPM seconds. The
    // other stops are explicit fast-forwards for slow input speeds.
    const rates = [1, 2, 4];
    const next = rates.indexOf(this.mechanism.animationSpeedMultiplier) + 1;
    this.mechanism.animationSpeedMultiplier = rates[next % rates.length];
  }

  /** Turn this machine's drive the other way. An edit, so it is undoable. */
  flipDirection(row: PlaybackRow): void {
    const partition = this.mechanism.partitions[row.index];
    const driven = partition?.joints.find((joint) => (joint as { input?: boolean }).input) as
      { driveSpeed: number } | undefined;
    if (!driven) return;
    const current =
      driven.driveSpeed !== 0
        ? driven.driveSpeed
        : (this.settings.isInputCW.value ? -1 : 1) * this.settings.inputSpeed.value;
    driven.driveSpeed = -current;
    this.mechanism.updateMechanism(true);
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
