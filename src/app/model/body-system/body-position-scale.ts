import { localToWorld, Point } from './body-frame';
import { CommandValues, GroupPoses } from './body-constraint-rows';
import { CompiledBodyPartition } from './compiled-body-system';

export interface BodyPositionScale {
  readonly length: number;
  readonly rows: readonly number[];
  readonly columns: readonly number[];
}

/** Only this partition's constraint attachments set scale; artwork and remote tracers do not. */
export function bodyPositionScale(
  partition: CompiledBodyPartition,
  poses: GroupPoses,
  commands: CommandValues = new Map()
): BodyPositionScale {
  const points: Point[] = [];
  for (const row of partition.rows) {
    points.push(localToWorld(poses.get(row.pair.groupA)!, row.pair.anchorA));
    points.push(localToWorld(poses.get(row.pair.groupB)!, row.pair.anchorB));
  }
  let length = 0;
  if (points.length)
    for (const point of points)
      length = Math.max(length, Math.hypot(point.x - points[0].x, point.y - points[0].y));
  for (const row of partition.rows)
    if (row.kind === 'travel')
      length = Math.max(
        length,
        Math.abs(row.zero),
        Math.abs(row.commandId ? (commands.get(row.commandId) ?? 0) : 0)
      );
  for (const limit of partition.limits)
    if (limit.row.kind === 'travel') length = Math.max(length, Math.abs(limit.upper - limit.lower));
  // A lone coincident pin has no physical length in its equations; translations remain SI there.
  if (length === 0) length = 1;
  return {
    length,
    rows: partition.rows.map((row) => (row.kind === 'angle' ? 1 : 1 / length)),
    columns: partition.unknowns.flatMap(() => [length, length, 1]),
  };
}
