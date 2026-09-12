import { BodyDocument } from './body-document';
import { BodyEditFrame } from './body-edit-frame';
import { BodyAnchorChange } from './body-anchor-change';
import { CompiledBodySystem } from './compiled-body-system';
import { sameBodyRecord } from './body-edit-effects';
import { jointCoordinate } from './joint-coordinate';
import { hasCoordinate } from './joint-record';
import { BodyId } from './body-id';
import { Pose } from './body-frame';

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
