import { BodyId, DriverId } from './body-id';
import { add, dot, perpendicular, Pose, rotate, subtract } from './body-frame';
import { BodyConstraintRow, ConstraintPair } from './compiled-body-system';

export type GroupPoses = ReadonlyMap<BodyId, Pose>;
export type CommandValues = ReadonlyMap<DriverId, number>;
export type BodyRowGradient = ReadonlyMap<BodyId, readonly [number, number, number]>;

export function pairGeometry(pair: ConstraintPair, poses: GroupPoses) {
  const poseA = poses.get(pair.groupA);
  const poseB = poses.get(pair.groupB);
  if (!poseA || !poseB) throw new Error('Missing compiled body pose');
  const a = rotate(pair.anchorA, poseA.angle);
  const b = rotate(pair.anchorB, poseB.angle);
  const u = rotate({ x: 1, y: 0 }, poseA.angle + pair.axisA);
  // Subtract origins before adding offsets, so a distant world origin does not erase local detail.
  const d = add(subtract(poseB, poseA), subtract(b, a));
  return { poseA, poseB, a, b, u, n: perpendicular(u), d };
}

export function bodyRowValue(
  row: BodyConstraintRow,
  poses: GroupPoses,
  commands: CommandValues = new Map()
): number {
  const { poseA, poseB, d, u, n } = pairGeometry(row.pair, poses);
  let value: number;
  switch (row.kind) {
    case 'coincidence-x':
      value = d.x;
      break;
    case 'coincidence-y':
      value = d.y;
      break;
    case 'lateral':
      value = dot(n, d);
      break;
    case 'travel':
      value = dot(u, d);
      break;
    case 'angle':
      value = poseB.angle - poseA.angle + row.pair.memberAngleB - row.pair.memberAngleA;
      break;
  }
  if (row.commandId !== undefined) {
    const command = commands.get(row.commandId);
    if (command === undefined || !Number.isFinite(command))
      throw new Error('Missing finite command');
    value -= command;
  }
  return value - row.zero;
}

/** Physical, unscaled derivatives are also the virtual-work map for reaction efforts. */
export function bodyRowGradient(row: BodyConstraintRow, poses: GroupPoses): BodyRowGradient {
  const { a, b, u, n, d } = pairGeometry(row.pair, poses);
  const ea = perpendicular(a),
    eb = perpendicular(b);
  let ga: [number, number, number];
  let gb: [number, number, number];
  switch (row.kind) {
    case 'coincidence-x':
      ga = [-1, 0, -ea.x];
      gb = [1, 0, eb.x];
      break;
    case 'coincidence-y':
      ga = [0, -1, -ea.y];
      gb = [0, 1, eb.y];
      break;
    case 'lateral':
      ga = [-n.x, -n.y, -dot(u, d) - dot(n, ea)];
      gb = [n.x, n.y, dot(n, eb)];
      break;
    case 'travel':
      ga = [-u.x, -u.y, dot(n, d) - dot(u, ea)];
      gb = [u.x, u.y, dot(u, eb)];
      break;
    case 'angle':
      ga = [0, 0, -1];
      gb = [0, 0, 1];
      break;
  }
  const gradient = new Map<BodyId, [number, number, number]>([[row.pair.groupA, ga]]);
  const previous = gradient.get(row.pair.groupB);
  // Internal relationships retain their residual even when both derivative blocks cancel.
  gradient.set(
    row.pair.groupB,
    previous ? [previous[0] + gb[0], previous[1] + gb[1], previous[2] + gb[2]] : gb
  );
  return gradient;
}

export function bodyRowsJacobian(
  rows: readonly BodyConstraintRow[],
  poses: GroupPoses,
  ids: readonly BodyId[]
): number[][] {
  return rows.map((row) => {
    const gradient = bodyRowGradient(row, poses);
    return ids.flatMap((id) => gradient.get(id) ?? [0, 0, 0]);
  });
}
