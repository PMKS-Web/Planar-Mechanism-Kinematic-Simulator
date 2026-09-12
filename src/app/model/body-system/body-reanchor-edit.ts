import { unchangedBodyMotion } from './body-unchanged-motion';
import { restoreBodyPartitionAnchor } from './body-anchor-partition';
import { BodyDocument } from './body-document';
import { BodyEditFrame } from './body-edit-frame';
import { BodyId, DriverId, JointId } from './body-id';
import { BodyClockState } from './body-document-authority';
import { bodyEditEffects } from './body-edit-effects';
import { compileBodyDocument } from './constraint-compiler';
import { unitFactors } from './body-units';
import { BodyAnchorChange } from './body-anchor-change';

/** A valid edit can outlive its old start. Failure to solve is never reported as proof of unreachable travel. */
export function reanchorBodyEdit(
  source: BodyDocument,
  displayed: BodyDocument,
  proposed: BodyDocument,
  frame: BodyEditFrame,
  axisEdits: ReadonlySet<JointId> = new Set()
):
  | {
      readonly document: BodyDocument;
      readonly display: BodyEditFrame;
      readonly anchors: readonly BodyAnchorChange[];
    }
  | undefined {
  const before = compileBodyDocument(displayed),
    after = compileBodyDocument(proposed);
  if (!before.ok || !after.ok) return undefined;
  const changes = bodyEditEffects(displayed, proposed, 'motion');
  const affected = new Set<BodyId>(changes.invalidatedBodies);
  for (const system of [before.system, after.system])
    for (const part of system.partitions)
      if (changes.invalidatedPartitions.includes(part.key))
        part.materialIds.forEach((id) => affected.add(id));
  const poses = new Map(
    proposed.bodies.map((body) => [
      body.id,
      affected.has(body.id)
        ? body.pose
        : (source.bodies.find((old) => old.id === body.id)?.pose ?? body.pose),
    ])
  );
  const clocks = new Map<DriverId, BodyClockState>(
    frame.clocks.flatMap((clock) => {
      const driver = proposed.drivers.find((item) => item.id === clock.driverId);
      const joint = driver && proposed.joints.find((item) => item.id === driver.coordinate.jointId);
      return joint && !affected.has(joint.bodyA) && !affected.has(joint.bodyB)
        ? [[clock.driverId, clock] as const]
        : [];
    })
  );
  const shownPoses = new Map(proposed.bodies.map((body) => [body.id, body.pose]));
  const anchors: BodyAnchorChange[] = [];
  const initials = new Map(
    proposed.drivers.map((driver) => [
      driver.id,
      source.drivers.find((old) => old.id === driver.id)?.profile.initial ?? driver.profile.initial,
    ])
  );
  const length = unitFactors(proposed.units).length;
  const reset = (id: DriverId, status: BodyAnchorChange['status']) => {
    const driver = proposed.drivers.find((item) => item.id === id)!;
    const old = frame.clocks.find((clock) => clock.driverId === id);
    initials.set(id, driver.profile.initial);
    clocks.set(id, {
      driverId: id,
      anchor: driver.profile.initial,
      command: driver.profile.initial,
      time: 0,
      synced: old?.synced ?? true,
      direction: driver.profile.speed < 0 ? -1 : 1,
    });
    anchors.push({ driverId: id, status, previous: old?.anchor, anchor: driver.profile.initial });
  };
  for (const part of after.system.partitions) {
    const oldPart = before.system.partitions.find((item) => item.key === part.key);
    if (unchangedBodyMotion(displayed, proposed, oldPart, part)) {
      part.materialIds.forEach((id) =>
        poses.set(id, source.bodies.find((body) => body.id === id)!.pose)
      );
      for (const driver of part.drivers) {
        const old = frame.clocks.find((clock) => clock.driverId === driver.id);
        if (old) clocks.set(driver.id, old);
      }
      continue;
    }
    if (!part.materialIds.some((id) => affected.has(id))) {
      for (const driver of part.drivers) {
        const old = frame.clocks.find((clock) => clock.driverId === driver.id);
        if (old) clocks.set(driver.id, old);
        else reset(driver.id, 'coordinate-changed');
      }
      continue;
    }
    const restored = restoreBodyPartitionAnchor(
      source,
      proposed,
      frame,
      after.system,
      part,
      length,
      axisEdits
    );
    if (!restored.ok) {
      part.drivers.forEach((driver) => reset(driver.id, restored.status));
      continue;
    }
    restored.poses.forEach((pose, id) => poses.set(id, pose));
    // Equivalent physical angles must still use the same integer turn as the selected coordinate.
    restored.shownPoses?.forEach((pose, id) => {
      const original = shownPoses.get(id)!;
      shownPoses.set(id, {
        ...original,
        angle:
          original.angle + 2 * Math.PI * Math.round((pose.angle - original.angle) / (2 * Math.PI)),
      });
    });
    initials.set(restored.clock.driverId, restored.clock.anchor);
    clocks.set(restored.clock.driverId, restored.clock);
    anchors.push(restored.change);
  }
  for (const driver of proposed.drivers)
    if (!clocks.has(driver.id)) reset(driver.id, 'motion-unavailable');
  const document: BodyDocument = {
    ...proposed,
    bodies: proposed.bodies.map((body) => ({ ...body, pose: poses.get(body.id)! })),
    drivers: proposed.drivers.map((driver) => ({
      ...driver,
      profile: { ...driver.profile, initial: initials.get(driver.id)! },
    })),
    holds: proposed.holds.map((hold) =>
      hold.angle === undefined
        ? hold
        : {
            ...hold,
            angle:
              hold.angle +
              poses.get(hold.bodyId)!.angle -
              proposed.bodies.find((body) => body.id === hold.bodyId)!.pose.angle,
          }
    ),
  };
  return {
    document,
    anchors,
    display: {
      ...frame,
      poses: shownPoses,
      clocks: proposed.drivers.map((driver) => clocks.get(driver.id)!),
      paths: new Map([...frame.paths].filter(([id]) => clocks.has(id))),
    },
  };
}
