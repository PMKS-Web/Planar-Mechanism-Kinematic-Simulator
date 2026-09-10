import { dot, Point } from './body-frame';
import { BodyId } from './body-id';
import { CommandValues, GroupPoses, pairGeometry } from './body-constraint-rows';
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
  const anchors = new Map<BodyId, Point[]>();
  let length = 0;
  for (const row of partition.rows) {
    const { pair } = row;
    for (const [id, point] of [
      [pair.groupA, pair.anchorA],
      [pair.groupB, pair.anchorB],
    ] as const) {
      const points = anchors.get(id) ?? [];
      points.push(point);
      anchors.set(id, points);
    }
    if (row.kind === 'lateral' || row.kind === 'travel') {
      const { u, d } = pairGeometry(pair, poses);
      length = Math.max(length, Math.abs(dot(u, d)));
    }
  }
  // A pin's mismatch is an error, not a physical dimension. In particular, a
  // rounding gap after rebasing a one-pin body must not normalize itself to one.
  for (const points of anchors.values())
    for (const point of points)
      length = Math.max(length, Math.hypot(point.x - points[0].x, point.y - points[0].y));
  const moving = new Set(partition.unknowns);
  // A single pin's coincident points have no span, but an offset moving origin
  // still couples angular and linear motion. WORLD's absolute anchor is not a lever arm.
  for (const { pair } of partition.rows) {
    if (moving.has(pair.groupA))
      length = Math.max(length, Math.hypot(pair.anchorA.x, pair.anchorA.y));
    if (moving.has(pair.groupB))
      length = Math.max(length, Math.hypot(pair.anchorB.x, pair.anchorB.y));
  }
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
