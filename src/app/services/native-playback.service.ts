import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NativeEditorService } from './native-editor.service';
import { buildSimulationSnapshot } from '../model/body-system/build-simulation-snapshot';
import { selectSimulationView } from '../model/body-system/simulation-view';
import { SimulationPartition, SimulationSnapshot } from '../model/body-system/simulation-snapshot';
import { Subject } from 'rxjs';
import { refusalFor } from '../model/edit-permission';

export type NativeMachine = Extract<SimulationPartition, { ok: true }>;

/** Clocks select immutable samples; animation never writes the design pose. */
@Injectable({ providedIn: 'root' })
export class NativePlaybackService {
  readonly editor = inject(NativeEditorService);
  readonly snapshot = signal<SimulationSnapshot | undefined>(undefined);
  readonly machines = computed(() =>
    [...(this.snapshot()?.partitions.values() ?? [])].filter((p): p is NativeMachine => p.ok)
  );
  readonly indices = signal<ReadonlyMap<string, number>>(new Map());
  readonly speed = signal(1);
  readonly independent = signal<ReadonlySet<string>>(new Set());
  readonly positionsChanged = new Subject<number>();
  readonly directions = signal<ReadonlyMap<string, 1 | -1>>(new Map());
  direction(key: string): 1 | -1 {
    return this.directions().get(key) ?? 1;
  }
  travelDirection(machine: NativeMachine): number {
    const index = this.indices().get(machine.key) ?? 0;
    const sample = machine.path.samples[index],
      direction = this.direction(machine.key);
    if (sample.stop && machine.path.kind === 'retrace') {
      const next = machine.path.samples[index + direction];
      const delta = next && next.state.command - sample.state.command;
      if (delta) return Math.sign(delta);
    }
    return sample.direction * direction;
  }
  setDirection(key: string, direction: number) {
    cancelAnimationFrame(this.resetId);
    const next = new Map(this.directions());
    next.set(key, direction < 0 ? -1 : 1);
    this.directions.set(next);
    this.present();
  }
  seconds(key: string) {
    return this.elapsed.get(key) ?? 0;
  }
  isRunning(machine: NativeMachine) {
    return this.independent().has(machine.key);
  }
  seekTime(machine: NativeMachine, seconds: number) {
    this.seek(
      machine.key,
      this.indexAt(machine, Math.max(0, Math.min(machine.path.duration, seconds)))
    );
  }
  private elapsed = new Map<string, number>();
  private tickId = 0;
  private resetId = 0;
  private lastTime = 0;
  constructor() {
    const destroy = inject(DestroyRef);
    this.editor.store.changes.pipe(takeUntilDestroyed(destroy)).subscribe(() => this.rebuild());
    destroy.onDestroy(() => {
      cancelAnimationFrame(this.tickId);
      cancelAnimationFrame(this.resetId);
    });
  }
  rebuild() {
    cancelAnimationFrame(this.resetId);
    const store = this.editor.store;
    const result = buildSimulationSnapshot(store.document, store.revision, {
      mode: store.document.settings.forceAnalysis,
      path: { maxTravelStepFraction: 1 / 360 },
      gravity: { x: 0, y: store.document.settings.gravity ? -9.81 : 0 },
    });
    this.snapshot.set(result.ok ? result.snapshot : undefined);
    const indices = new Map<string, number>();
    const directions = new Map<string, 1 | -1>();
    this.elapsed.clear();
    for (const machine of this.machines()) {
      const clock = store.local.clocks.find((c) =>
        machine.frame.partition.drivers.some((d) => d.id === c.driverId)
      );
      const time = clock?.time ?? 0;
      const index = this.indexAt(machine, Math.min(time, machine.path.duration));
      indices.set(machine.key, index);
      directions.set(
        machine.key,
        (clock?.direction ?? machine.inputs[index].sample.direction) *
          machine.inputs[index].sample.direction <
          0
          ? -1
          : 1
      );
      this.elapsed.set(machine.key, machine.path.samples[index].time);
    }
    this.indices.set(indices);
    this.directions.set(directions);
    this.independent.set(new Set([...this.independent()].filter((key) => indices.has(key))));
    // A paused edit's captured display is more precise than the closest precomputed sample.
    if (!store.display) this.present();
    if (!this.machines().length || !this.independent().size) this.pause();
  }
  private indexAt(machine: NativeMachine, time: number) {
    let low = 0,
      high = machine.path.samples.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (machine.path.samples[mid].time <= time) low = mid;
      else high = mid - 1;
    }
    return low;
  }
  present() {
    const snapshot = this.snapshot();
    if (!snapshot) return;
    const selected = selectSimulationView(snapshot, {
      revision: this.editor.store.revision,
      indices: this.indices(),
      directions: this.directions(),
    });
    if (selected.ok && this.editor.store.setSimulationView(selected.value)) {
      this.editor.refresh();
      this.positionsChanged.next(this.indices().get(this.machines()[0]?.key) ?? 0);
    }
  }
  seek(key: string, index: number) {
    cancelAnimationFrame(this.resetId);
    if (refusalFor('transport', this.editor.state())) return;
    const machine = this.machines().find((m) => m.key === key);
    if (!machine) return;
    index = Math.max(0, Math.min(machine.path.samples.length - 1, Math.round(index)));
    const next = new Map(this.indices());
    next.set(key, index);
    this.indices.set(next);
    this.elapsed.set(key, machine.path.samples[index].time);
    this.present();
  }
  rewind() {
    if (refusalFor('transport', this.editor.state())) return;
    this.pause();
    for (const m of this.machines()) {
      this.elapsed.set(m.key, 0);
    }
    this.indices.set(new Map(this.machines().map((m) => [m.key, 0])));
    this.present();
  }
  easeToStart(durationMs = 220) {
    if (refusalFor('transport', this.editor.state())) return;
    this.pause();
    if (durationMs <= 0 || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      this.rewind();
      return;
    }
    const machines = this.machines(),
      from = machines.map((machine) => this.seconds(machine.key));
    const deltas = machines.map((machine, i) =>
      machine.path.kind !== 'window' && from[i] > machine.path.duration / 2
        ? machine.path.duration - from[i]
        : -from[i]
    );
    if (deltas.every((delta) => delta === 0)) return;
    let start: number | undefined;
    const frame = (now: number) => {
      start ??= now;
      const t = Math.min(1, (now - start) / durationMs),
        eased = 1 - (1 - t) ** 3;
      const next = new Map(this.indices());
      machines.forEach((machine, i) => {
        const ahead = from[i] + deltas[i] * eased;
        const seconds =
          t === 1
            ? 0
            : machine.path.kind === 'window'
              ? ahead
              : (ahead + machine.path.duration) % machine.path.duration;
        this.elapsed.set(machine.key, seconds);
        next.set(machine.key, this.indexAt(machine, seconds));
      });
      this.indices.set(next);
      this.present();
      if (t < 1) this.resetId = requestAnimationFrame(frame);
    };
    this.resetId = requestAnimationFrame(frame);
  }
  pause() {
    cancelAnimationFrame(this.resetId);
    this.independent.set(new Set());
    this.editor.playing.set(false);
    cancelAnimationFrame(this.tickId);
  }
  toggle() {
    if (this.editor.playing()) {
      this.pause();
      return;
    }
    if (refusalFor('transport', this.editor.state()) || !this.machines().length) return;
    cancelAnimationFrame(this.resetId);
    this.independent.set(new Set(this.machines().map((machine) => machine.key)));
    this.editor.playing.set(true);
    this.lastTime = performance.now();
    this.tickId = requestAnimationFrame((time) => this.tick(time));
  }
  isSynced(machine: NativeMachine) {
    this.editor.version();
    return (
      this.editor.store.local.clocks.find((c) =>
        machine.frame.partition.drivers.some((d) => d.id === c.driverId)
      )?.synced ?? true
    );
  }
  toggleMachine(machine: NativeMachine) {
    if (refusalFor('transport', this.editor.state())) return;
    cancelAnimationFrame(this.resetId);
    const next = new Set(this.independent());
    if (next.has(machine.key)) next.delete(machine.key);
    else next.add(machine.key);
    this.independent.set(next);
    if (!next.size) {
      this.pause();
      return;
    }
    if (!this.editor.playing()) {
      this.editor.playing.set(true);
      this.lastTime = performance.now();
      this.tickId = requestAnimationFrame((time) => this.tick(time));
    }
  }
  sync(machine: NativeMachine, synced: boolean) {
    const ids = new Set(machine.frame.partition.drivers.map((d) => d.id));
    const store = this.editor.store;
    store.setLocalState({
      ...store.local,
      clocks: store.local.clocks.map((c) => (ids.has(c.driverId) ? { ...c, synced } : c)),
    });
    this.present();
  }
  setAllSynced(synced: boolean) {
    const machines = this.machines();
    if (machines.every((machine) => this.isSynced(machine) === synced)) return;
    const running = this.editor.playing();
    const leader = machines.reduce<NativeMachine | undefined>(
      (best, machine) => (!best || machine.path.duration > best.path.duration ? machine : best),
      undefined
    );
    const time = this.seconds(leader?.key ?? '');
    const store = this.editor.store;
    store.setLocalState({
      ...store.local,
      clocks: store.local.clocks.map((clock) => ({ ...clock, synced })),
    });
    if (synced) {
      const indices = new Map(this.indices());
      for (const machine of machines) {
        const seconds =
          machine.path.kind === 'window'
            ? Math.min(time, machine.path.duration)
            : time % machine.path.duration;
        this.elapsed.set(machine.key, seconds);
        indices.set(machine.key, this.indexAt(machine, seconds));
      }
      this.indices.set(indices);
      this.independent.set(new Set(running ? machines.map((machine) => machine.key) : []));
    }
    this.present();
  }
  private tick(time: number) {
    if (!this.editor.playing()) return;
    const delta = ((time - this.lastTime) / 1000) * this.speed();
    this.lastTime = time;
    const next = new Map(this.indices());
    const running = new Set(this.independent());
    for (const machine of this.machines()) {
      if (!this.isRunning(machine)) continue;
      let elapsed = (this.elapsed.get(machine.key) ?? 0) + delta * this.direction(machine.key);
      if (machine.path.kind === 'window') {
        if (elapsed <= 0 || elapsed >= machine.path.duration) running.delete(machine.key);
        elapsed = Math.max(0, Math.min(elapsed, machine.path.duration));
      } else
        elapsed =
          ((elapsed % machine.path.duration) + machine.path.duration) % machine.path.duration;
      this.elapsed.set(machine.key, elapsed);
      next.set(machine.key, this.indexAt(machine, elapsed));
    }
    this.indices.set(next);
    this.independent.set(running);
    this.present();
    if (running.size) this.tickId = requestAnimationFrame((t) => this.tick(t));
    else this.pause();
  }
}
