import { sampleAlong } from '../../../model/mechanism/drive-profile';
import { Injectable, inject } from '@angular/core';
import { NativeEditorService } from '../../native-editor.service';
import { NativePlaybackService, NativeMachine } from '../../native-playback.service';
import { nativeMotionRefusal } from '../../../model/body-system/native-motion-refusal';
import { unitFactors } from '../../../model/body-system/body-units';
import { MODEL_SCALE } from '../../../model/render-scale';
import type { ChromeMechanism, ChromePart } from '../chrome-contracts';
import { nativeForceRequirements } from '../../../model/body-system/native-force-readiness';
import { WORLD } from '../../../model/body-system/body-id';

/** Stable partition keys own clocks; numeric row indices are only the shared transport's view. */
@Injectable({ providedIn: 'root' })
export class NativeChromeMechanismService implements ChromeMechanism {
  private readonly editor = inject(NativeEditorService);
  private readonly playback = inject(NativePlaybackService);
  readonly onMechPositionChange = this.playback.positionsChanged.asObservable();
  hoveredMechanismIndex = -1;
  startMovedOn: string | null = null;
  readonly solvingIsDeferred = false;
  private get results() {
    return [...(this.playback.snapshot()?.partitions.values() ?? [])];
  }
  private machine(index: number): NativeMachine | undefined {
    const part = this.results[index];
    return part?.ok ? part : undefined;
  }
  get mechanisms() {
    return this.results.map((part) => ({
      dof: part.ok ? 1 : part.reason === 'immobile' ? 0 : NaN,
      cyclePeriod: part.ok ? part.path.duration : 0,
      reciprocates: part.ok && part.path.kind === 'retrace',
      hasAddedSamples: part.ok && part.path.samples.some((sample) => sample.stop?.kind === 'fold'),
      sampleCount: part.ok ? part.path.samples.length : 0,
      isMechanismValid: () => part.ok,
    }));
  }
  get partitions() {
    return this.results.map((part, i) => ({
      id: `M${i + 1}`,
      ownJoints: part.ok ? part.frame.partition.materialIds.map((id) => ({ id })) : [],
    }));
  }
  get joints() {
    return this.editor.document().attachments.map((a) => ({ id: a.id, showCurve: a.trace }));
  }
  hasParts() {
    return this.editor.document().bodies.some((b) => b.kind === 'material');
  }
  hasMassiveLink() {
    return [...(this.playback.snapshot()?.system.groups.values() ?? [])].some(
      (g) => g.mass.mass > 0
    );
  }
  oneValidMechanismExists() {
    return this.playback.machines().length > 0;
  }
  forceAnalysisReady() {
    return this.forceAnalysisRequirements().every((row) => row.met || row.warning);
  }
  forceAnalysisRequirements() {
    return nativeForceRequirements(this.playback.snapshot());
  }
  readinessOfEachMechanism() {
    const snapshot = this.playback.snapshot();
    return this.results.map((part, i) => ({
      id: `M${i + 1}`,
      checks: part.ok
        ? []
        : [
            {
              state: 'blocker',
              title: nativeMotionRefusal(
                snapshot && { ...snapshot, partitions: new Map([[part.key, part]]) }
              )!.long,
            },
          ],
    }));
  }
  blockerCount() {
    return this.results.filter((p) => !p.ok).length;
  }
  warningCount() {
    return 0;
  }
  masterMechanism() {
    return this.mechanisms[this.masterIndex()];
  }
  private masterIndex() {
    return this.results.reduce(
      (best, part, index) =>
        part.ok && part.path.duration > (this.machine(best)?.path.duration ?? -1) ? index : best,
      -1
    );
  }
  cyclePeriod() {
    return this.masterMechanism()?.cyclePeriod ?? 0;
  }
  get mechanismTimeStep() {
    const m = this.machine(this.masterIndex());
    return m ? (this.playback.indices().get(m.key) ?? 0) : 0;
  }
  set mechanismTimeStep(step: number) {
    this.animate(step);
  }
  timeAtStep(step: number) {
    return this.machine(this.masterIndex())?.path.samples[Math.max(0, Math.floor(step))]?.time ?? 0;
  }
  get animationSpeedMultiplier() {
    return this.playback.speed();
  }
  set animationSpeedMultiplier(speed: number) {
    this.playback.speed.set(speed);
  }
  get isPlaying() {
    return this.editor.playing();
  }
  set isPlaying(playing: boolean) {
    this.setAllPlaying(playing);
  }
  setAllPlaying(playing: boolean) {
    if (playing !== this.isPlaying) this.playback.toggle();
  }
  isMechanismPlaying(index: number) {
    const m = this.machine(index);
    return !!m && this.playback.isRunning(m);
  }
  toggleMechanismPlaying(index: number) {
    const m = this.machine(index);
    if (m) this.playback.toggleMachine(m);
  }
  get syncMechanisms() {
    return this.playback.machines().every((m) => this.playback.isSynced(m));
  }
  set syncMechanisms(sync: boolean) {
    this.setSyncMechanisms(sync);
  }
  setSyncMechanisms(sync: boolean) {
    this.playback.setAllSynced(sync);
  }
  secondsOf(index: number) {
    const m = this.machine(index);
    return m ? this.playback.seconds(m.key) : 0;
  }
  isAtStartPose() {
    return this.editor.state().atStart;
  }
  clearStartMoved() {
    this.startMovedOn = null;
  }
  solveNow() {
    this.playback.rebuild();
  }
  easeToStart(durationMs?: number) {
    this.playback.easeToStart(durationMs);
  }
  animate(progress: number, animationState?: boolean) {
    if (animationState !== undefined) this.setAllPlaying(animationState);
    const m = this.machine(this.masterIndex());
    if (m) this.playback.seek(m.key, progress);
  }
  seekMechanism(index: number, seconds: number) {
    const m = this.machine(index);
    if (m) this.playback.seekTime(m, seconds);
  }
  seekAllAlong(leader: number, along: number) {
    const period = this.machine(leader)?.path.duration;
    if (!period) return;
    const time = Math.min(1, Math.max(0, along)) * period;
    for (const [index, part] of this.results.entries())
      if (part.ok)
        this.seekMechanism(
          index,
          part.path.kind === 'window'
            ? Math.min(time, part.path.duration)
            : time % part.path.duration
        );
  }
  driveProfileOf(index: number) {
    const m = this.machine(index);
    if (!m) return undefined;
    const commands = m.path.samples.map((s) => s.state.command);
    const min = Math.min(...commands),
      max = Math.max(...commands),
      span = max - min;
    const continuous = m.path.kind === 'rotation',
      linear = m.frame.partition.drivers[0].row.kind === 'travel';
    return {
      continuous,
      linear,
      span: span * (linear ? MODEL_SCALE / unitFactors(this.editor.document().units).length : 1),
      along: commands.map((c) =>
        continuous ? Math.abs(c - commands[0]) / span : (c - min) / span
      ),
    };
  }
  travelOf(index: number) {
    const m = this.machine(index);
    return m
      ? this.driveProfileOf(index)?.along[this.playback.indices().get(m.key) ?? 0]
      : undefined;
  }
  seekMechanismTo(index: number, along: number) {
    const m = this.machine(index),
      profile = this.driveProfileOf(index);
    if (!m || !profile) return;
    const current = this.playback.indices().get(m.key) ?? 0;
    // The shared track chooses the outgoing leg at a turnaround and keeps a scrub on its own branch.
    const best = sampleAlong(profile, Math.max(0, Math.min(1, along)), current);
    this.playback.seek(m.key, best);
  }
  directionOf(index: number) {
    const m = this.machine(index);
    return m ? this.playback.direction(m.key) : 1;
  }
  setPlaybackDirection(index: number, direction: number) {
    const m = this.machine(index);
    if (m) this.playback.setDirection(m.key, direction);
  }
  reverseDrive(index: number) {
    const m = this.machine(index);
    if (!m) return false;
    this.setPlaybackDirection(index, -this.directionOf(index));
    return true;
  }
  travelingForward(index: number) {
    const m = this.machine(index);
    if (!m) return true;
    const sign = this.playback.travelDirection(m);
    return m.frame.partition.drivers[0].row.kind === 'angle' ? sign < 0 : sign > 0;
  }
  drivenJointOf(index: number) {
    const m = this.machine(index);
    return m?.frame.partition.drivers[0];
  }
  driveSpeedOf(part: ChromePart | undefined) {
    const index = this.results.findIndex(
      (m) => m.ok && m.frame.partition.drivers.some((d) => d.id === part?.id)
    );
    const m = this.machine(index);
    return m ? m.frame.partition.drivers[0].speed * this.directionOf(index) : 0;
  }
  inputAngleDegrees(index: number) {
    const m = this.machine(index);
    if (!m || m.frame.partition.drivers[0].row.kind !== 'angle') return undefined;
    const drawing = this.editor.drawing();
    const joint = drawing.joints.find(
      (joint) => joint.id === m.frame.partition.drivers[0].row.jointId
    )!;
    let angle = m.path.samples[this.playback.indices().get(m.key) ?? 0].state.command;
    if (joint.bodyA === WORLD || joint.bodyB === WORLD) {
      const id = joint.bodyA === WORLD ? joint.bodyB : joint.bodyA;
      const body = drawing.bodies.find((body) => body.id === id);
      if (body?.kind === 'material' && body.geometry.kind === 'bar') {
        const [a, b] = body.geometry.vertices;
        const at = drawing.attachments.find(
          (point) => point.id === (joint.bodyA === WORLD ? joint.frameB : joint.frameA).attachmentId
        )!;
        const nearA =
          Math.hypot(a.x - at.point.x, a.y - at.point.y) <=
          Math.hypot(b.x - at.point.x, b.y - at.point.y);
        angle =
          body.pose.angle +
          Math.atan2((b.y - a.y) * (nearA ? 1 : -1), (b.x - a.x) * (nearA ? 1 : -1));
      }
    }
    return ((((angle * 180) / Math.PI) % 360) + 360) % 360;
  }
  isLockedTarget(part: ChromePart) {
    const d = this.editor.document();
    return (
      d.bodies.some((b) => b.id === part.id && b.kind === 'material' && b.locked) ||
      d.locks.some((id) => id === part.id)
    );
  }
  setCurrentPoseAsStart(part: ChromePart): boolean {
    const body = this.editor.document().bodies.find((body) => body.id === part.id);
    return !!body && this.editor.apply({ kind: 'set-start', bodyId: body.id });
  }
}
