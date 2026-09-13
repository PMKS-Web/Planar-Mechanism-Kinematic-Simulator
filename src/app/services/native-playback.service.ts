import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NativeEditorService } from './native-editor.service';
import { buildSimulationSnapshot } from '../model/body-system/build-simulation-snapshot';
import { selectSimulationView } from '../model/body-system/simulation-view';
import { SimulationPartition, SimulationSnapshot } from '../model/body-system/simulation-snapshot';
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
  private sharedRunning = false;
  private elapsed = new Map<string, number>();
  private tickId = 0;
  private lastTime = 0;
  constructor() {
    const destroy = inject(DestroyRef);
    this.editor.store.changes.pipe(takeUntilDestroyed(destroy)).subscribe(() => this.rebuild());
    destroy.onDestroy(() => cancelAnimationFrame(this.tickId));
  }
  rebuild() {
    const store = this.editor.store;
    const result = buildSimulationSnapshot(store.document, store.revision, {
      mode: store.document.settings.forceAnalysis,
      gravity: { x: 0, y: store.document.settings.gravity ? -9.81 : 0 },
    });
    this.snapshot.set(result.ok ? result.snapshot : undefined);
    const indices = new Map<string, number>();
    this.elapsed.clear();
    for (const machine of this.machines()) {
      const clock = store.local.clocks.find((c) =>
        machine.frame.partition.drivers.some((d) => d.id === c.driverId)
      );
      const time = clock?.time ?? 0;
      const index = this.indexAt(machine, Math.min(time, machine.path.duration));
      indices.set(machine.key, index);
      this.elapsed.set(machine.key, machine.path.samples[index].time);
    }
    this.indices.set(indices);
    // A paused edit's captured display is more precise than the closest precomputed sample.
    if (!store.display) this.present();
    if (!this.machines().length) this.pause();
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
    });
    if (selected.ok && this.editor.store.setSimulationView(selected.value)) this.editor.refresh();
  }
  seek(key: string, index: number) {
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
  pause() {
    this.sharedRunning = false;
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
    this.sharedRunning = true;
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
    const next = new Set(this.independent());
    if (next.has(machine.key)) next.delete(machine.key);
    else next.add(machine.key);
    this.independent.set(next);
    if (!this.sharedRunning && !next.size) {
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
  private tick(time: number) {
    if (!this.editor.playing()) return;
    const delta = ((time - this.lastTime) / 1000) * this.speed();
    this.lastTime = time;
    const next = new Map(this.indices());
    for (const machine of this.machines()) {
      const clock = this.editor.store.local.clocks.find((c) =>
        machine.frame.partition.drivers.some((d) => d.id === c.driverId)
      );
      if (!(clock?.synced !== false && this.sharedRunning) && !this.independent().has(machine.key))
        continue;
      let elapsed = (this.elapsed.get(machine.key) ?? 0) + delta;
      if (machine.path.kind === 'window') elapsed = Math.min(elapsed, machine.path.duration);
      else elapsed %= machine.path.duration;
      this.elapsed.set(machine.key, elapsed);
      next.set(machine.key, this.indexAt(machine, elapsed));
    }
    this.indices.set(next);
    this.present();
    this.tickId = requestAnimationFrame((t) => this.tick(t));
  }
}
