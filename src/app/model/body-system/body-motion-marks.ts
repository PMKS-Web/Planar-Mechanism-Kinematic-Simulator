import { bodyForceEnds } from './body-force-edit';
import { BodyDocument } from './body-document';
import { BodyId } from './body-id';
import { add, compose, localToWorld, Point, Pose } from './body-frame';
import { SimulationSnapshot } from './simulation-snapshot';
import { solveFramePoint } from './body-solve-frame';
import { bodyDrawingPoints } from './body-material-marks';
import { unitFactors } from './body-units';

/** One material's full accepted path, converted from numerical SI frames to drawing coordinates. */
export function bodyMotionPoses(snapshot: SimulationSnapshot, bodyId: BodyId): readonly Pose[] {
  const groupId = snapshot.system.groupOf.get(bodyId);
  if (!groupId) return [];
  const group = snapshot.system.groups.get(groupId)!;
  const member = group.members.get(bodyId)!;
  const length = unitFactors(snapshot.document.units).length;
  const drawing = (pose: Pose): Pose => ({
    x: pose.x / length,
    y: pose.y / length,
    angle: pose.angle,
  });
  if (group.fixed) return [drawing(compose(group.pose, member))];
  const key = snapshot.bodyPartition.get(bodyId),
    partition = key && snapshot.partitions.get(key);
  if (!partition || !partition.ok) return [];
  const local = { ...solveFramePoint(partition.frame, groupId, member), angle: member.angle };
  return partition.path.samples.flatMap((sample) => {
    const groupPose = sample.state.poses.get(groupId);
    if (!groupPose) return [];
    const pose = compose(groupPose, local);
    return [drawing({ ...add(pose, partition.frame.origin), angle: pose.angle })];
  });
}
export function bodyMotionBounds(
  document: BodyDocument,
  snapshot?: SimulationSnapshot
): readonly Point[] {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const include = (points: readonly Point[]) => {
    for (const p of points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  };
  include(bodyDrawingPoints(document));
  for (const force of document.forces) include(bodyForceEnds(document, force));
  if (snapshot)
    for (const body of document.bodies) {
      if (body.kind !== 'material') continue;
      for (const pose of bodyMotionPoses(snapshot, body.id)) {
        const posed = { ...document, bodies: [{ ...body, pose }] };
        include(bodyDrawingPoints(posed));
        for (const force of document.forces.filter((f) => f.bodyId === body.id))
          include(bodyForceEnds(posed, force));
      }
    }
  return minX === Infinity
    ? []
    : [
        { x: minX, y: minY },
        { x: maxX, y: maxY },
      ];
}
export function bodyTraceMarks(document: BodyDocument, snapshot?: SimulationSnapshot) {
  if (!snapshot) return [];
  return document.attachments
    .filter((point) => point.trace)
    .map((point) => ({
      id: point.id,
      path: bodyMotionPoses(snapshot, point.bodyId)
        .map((pose, i) => {
          const at = localToWorld(pose, point.point);
          return `${i ? 'L' : 'M'} ${at.x} ${at.y}`;
        })
        .join(' '),
    }));
}
