import { BodyDocument } from './body-document';
import type { BodyClockState } from './body-document-authority';
import { BodyId } from './body-id';
import { Pose } from './body-frame';
import { SimulationView } from './simulation-view';
import { simulationBodyPose } from './simulation-body-readers';
import { unitFactors } from './body-units';
import { sameBodyRecord } from './body-edit-effects';
import { snapshotCopy } from './sample-results';

/** A displayed frame is local history, never authored geometry or shared URL state. */
export interface BodyEditFrame {
  readonly revision: number;
  readonly poses: ReadonlyMap<BodyId, Pose>;
  readonly clocks: readonly BodyClockState[];
}

export function captureBodyEditFrame(
  document: BodyDocument,
  revision: number,
  clocks: readonly BodyClockState[],
  view: SimulationView
): BodyEditFrame | undefined {
  if (view.snapshot.revision !== revision || !sameBodyRecord(document, view.snapshot.document))
    return undefined;
  if (
    clocks.length !== document.drivers.length ||
    new Set(clocks.map((clock) => clock.driverId)).size !== clocks.length ||
    document.drivers.some((driver) => !clocks.some((clock) => clock.driverId === driver.id))
  )
    return undefined;
  const length = unitFactors(document.units).length;
  const poses = new Map<BodyId, Pose>();
  const nextClocks = new Map(clocks.map((clock) => [clock.driverId, clock]));
  for (const body of document.bodies) {
    const key = view.snapshot.bodyPartition.get(body.id);
    const partition = key ? view.snapshot.partitions.get(key) : undefined;
    // A drawing refused at admission stays at its authored pose; a runnable clock must be selected explicitly.
    if (body.kind === 'world' || (partition && !partition.ok)) {
      poses.set(body.id, body.pose);
      continue;
    }
    const placed = simulationBodyPose(view, body.id);
    if (!placed.ok) return undefined;
    poses.set(body.id, {
      x: placed.value.x / length,
      y: placed.value.y / length,
      angle: placed.value.angle,
    });
  }
  for (const [key, partition] of view.snapshot.partitions) {
    if (!partition.ok) continue;
    const selected = view.samples.get(key);
    if (!selected?.ok) return undefined;
    const sample = selected.value.input.sample;
    for (const driver of partition.frame.partition.drivers) {
      const old = nextClocks.get(driver.id);
      if (!old) return undefined;
      nextClocks.set(driver.id, {
        ...old,
        command: sample.command / (driver.row.kind === 'angle' ? 1 : length),
        time: sample.time,
        direction: sample.direction,
      });
    }
  }
  return snapshotCopy({ revision, poses, clocks: [...nextClocks.values()] });
}

/** Holds turn with the displayed material during playback but still constrain edits in world axes. */
export function withBodyEditFrame(document: BodyDocument, frame: BodyEditFrame): BodyDocument {
  return {
    ...document,
    bodies: document.bodies.map((body) => ({ ...body, pose: frame.poses.get(body.id)! })),
    drivers: document.drivers.map((driver) => ({
      ...driver,
      profile: {
        ...driver.profile,
        initial: frame.clocks.find((clock) => clock.driverId === driver.id)!.command,
      },
    })),
    holds: document.holds.map((hold) => {
      const before = document.bodies.find((body) => body.id === hold.bodyId)!.pose;
      return hold.angle === undefined
        ? hold
        : { ...hold, angle: hold.angle + frame.poses.get(hold.bodyId)!.angle - before.angle };
    }),
  };
}
