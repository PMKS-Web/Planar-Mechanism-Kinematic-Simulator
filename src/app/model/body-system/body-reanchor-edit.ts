import { turnsClockwise } from '../drive-direction';
import { restoreBodyPartitionAnchor } from './body-anchor-recovery';
import { BodyDocument } from './body-document';
import { BodyEditFrame } from './body-edit-frame';
import { BodyId, DriverId, JointId, compareRecordIds } from './body-id';
import { BodyClockState } from './body-document-authority';
import { bodyEditEffects, sameBodyRecord } from './body-edit-effects';
import { compileBodyDocument } from './constraint-compiler';
import { unitFactors } from './body-units';
import { BodyAnchorChange } from './body-anchor-change';
import { CompiledBodyPartition, CompiledBodySystem } from './compiled-body-system';
import { bodyMotionRecord } from './body-motion-record';
import { Pose } from './body-frame';
import { jointCoordinate } from './joint-coordinate';
import { hasCoordinate } from './joint-record';

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
      direction: turnsClockwise(driver.profile.speed) ? -1 : 1,
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
  anchors.push(
    ...removedBodyDriveAnchors(source, proposed, before.system, after.system, frame, poses)
  );
  const document: BodyDocument = {
    ...proposed,
    bodies: proposed.bodies.map((body) => ({ ...body, pose: poses.get(body.id)! })),
    drivers: proposed.drivers.map((driver) => ({
      ...driver,
      profile: { ...driver.profile, initial: initials.get(driver.id)! },
    })),
    holds: reanchorBodyHolds(source, displayed, proposed, poses),
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

/** Adding material to a fixed group invalidates analysis, but cannot change an untouched machine's clock. */
export function unchangedBodyMotion(
  before: BodyDocument,
  after: BodyDocument,
  oldPartition: CompiledBodyPartition | undefined,
  partition: CompiledBodyPartition
): boolean {
  if (
    !oldPartition ||
    !sameBodyRecord(
      [...oldPartition.materialIds].sort(compareRecordIds),
      [...partition.materialIds].sort(compareRecordIds)
    )
  )
    return false;
  const members = new Set(partition.materialIds);
  const records = (document: BodyDocument) => {
    const joints = document.joints.filter(
      (joint) => members.has(joint.bodyA) || members.has(joint.bodyB)
    );
    const jointIds = new Set(joints.map((joint) => joint.id));
    const bodies = new Set<BodyId>([
      ...members,
      ...joints.flatMap((joint) => [joint.bodyA, joint.bodyB]),
    ]);
    const anchors = new Set(
      joints.flatMap((joint) => [joint.frameA.attachmentId, joint.frameB.attachmentId])
    );
    const sorted = <T extends { readonly id: string }>(values: readonly T[]) =>
      [...values].sort((a, b) => compareRecordIds(a.id, b.id));
    return {
      units: document.units,
      bodies: sorted(document.bodies.filter((body) => bodies.has(body.id))).map((body) =>
        bodyMotionRecord({ kind: 'body', id: body.id }, body)
      ),
      joints: sorted(joints).map((joint) =>
        bodyMotionRecord({ kind: 'joint', id: joint.id }, joint)
      ),
      attachments: sorted(
        document.attachments.filter((point) => members.has(point.bodyId) || anchors.has(point.id))
      ).map((point) => bodyMotionRecord({ kind: 'attachment', id: point.id }, point)),
      drivers: sorted(document.drivers.filter((driver) => jointIds.has(driver.coordinate.jointId))),
      limits: sorted(document.limits.filter((limit) => jointIds.has(limit.coordinate.jointId))),
      holds: document.holds.filter((hold) => members.has(hold.bodyId)),
    };
  };
  return sameBodyRecord(records(before), records(after));
}

/** Undoing display transport must not turn round-off into a change to an untouched machine. */
export function reanchorBodyHolds(
  source: BodyDocument,
  displayed: BodyDocument,
  proposed: BodyDocument,
  poses: ReadonlyMap<BodyId, Pose>
): BodyDocument['holds'] {
  return proposed.holds.map((hold) => {
    const old = displayed.holds.find(
      (item) => item.bodyId === hold.bodyId && item.from === hold.from && item.to === hold.to
    );
    const pose = poses.get(hold.bodyId)!;
    if (
      old &&
      sameBodyRecord(old, hold) &&
      pose.angle === source.bodies.find((body) => body.id === hold.bodyId)!.pose.angle
    )
      return source.holds.find(
        (item) => item.bodyId === hold.bodyId && item.from === hold.from && item.to === hold.to
      )!;
    return hold.angle === undefined
      ? hold
      : {
          ...hold,
          angle:
            hold.angle +
            (pose.angle - proposed.bodies.find((body) => body.id === hold.bodyId)!.pose.angle),
        };
  });
}

/** Losing the last input still needs a notice when surviving material adopts the paused pose. */
export function removedBodyDriveAnchors(
  source: BodyDocument,
  proposed: BodyDocument,
  before: CompiledBodySystem,
  after: CompiledBodySystem,
  frame: BodyEditFrame,
  poses: ReadonlyMap<BodyId, Pose>
): BodyAnchorChange[] {
  return source.drivers.flatMap((driver) => {
    if (proposed.drivers.some((next) => next.id === driver.id)) return [];
    const oldPart = before.partitions.find((part) => part.drivers.some((d) => d.id === driver.id));
    const adopted = oldPart?.materialIds.some(
      (id) =>
        poses.has(id) &&
        !sameBodyRecord(poses.get(id), source.bodies.find((body) => body.id === id)?.pose) &&
        after.partitions.some((part) => part.materialIds.includes(id) && part.drivers.length === 0)
    );
    const clock = frame.clocks.find((item) => item.driverId === driver.id);
    if (!adopted || !clock) return [];
    const joint = proposed.joints.find((item) => item.id === driver.coordinate.jointId);
    const anchor =
      joint && hasCoordinate(joint, driver.coordinate.coordinate)
        ? jointCoordinate(
            joint,
            driver.coordinate.coordinate,
            poses,
            new Map(proposed.attachments.map((point) => [point.id, point]))
          )
        : clock.command;
    return [{ driverId: driver.id, status: 'drive-removed', previous: clock.anchor, anchor }];
  });
}
