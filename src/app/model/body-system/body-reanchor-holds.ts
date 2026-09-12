import { BodyDocument } from './body-document';
import { sameBodyRecord } from './body-edit-effects';
import { BodyId } from './body-id';
import { Pose } from './body-frame';

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
