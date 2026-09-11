import { pairGeometry } from './body-constraint-rows';
import { BodyIntervalPoint } from './body-interval-types';
import { BodyIntervalProbes } from './body-interval-probes';

/** A distant bound need not borrow undefined rates at an isolated singular sample. */
export function clearBodyIntervalEnclosure(
  probes: BodyIntervalProbes,
  left: BodyIntervalPoint,
  middle: BodyIntervalPoint,
  right: BodyIntervalPoint
): boolean {
  const partition = probes.admitted.frame.partition,
    length = probes.admitted.scale.length;
  const radii = new Map(
    [...partition.unknowns, ...partition.boundary].map((id) => {
      const center = middle.state.poses.get(id)!;
      const ends = [left, right].map((point) => point.state.poses.get(id)!);
      return [
        id,
        {
          position:
            2 * Math.max(...ends.map((pose) => Math.hypot(pose.x - center.x, pose.y - center.y))),
          angle: 2 * Math.max(...ends.map((pose) => Math.abs(pose.angle - center.angle))),
        },
      ] as const;
    })
  );
  if ([...radii.values()].some((radius) => radius.position / length > 1e-5 || radius.angle > 1e-5))
    return false;
  return partition.limits.every((limit, index) => {
    const { pair } = limit.row,
      a = radii.get(pair.groupA)!,
      b = radii.get(pair.groupB)!;
    const value = probes.value(middle, index);
    let variation = a.angle + b.angle;
    if (limit.row.kind === 'travel') {
      const geometry = pairGeometry(pair, middle.state.poses);
      // |u'·d' - u·d| <= |d'-d| + |u'-u| |d|; rotations bound each anchor displacement.
      variation =
        a.position +
        b.position +
        Math.min(2, a.angle) * Math.hypot(geometry.a.x, geometry.a.y) +
        Math.min(2, b.angle) * Math.hypot(geometry.b.x, geometry.b.y) +
        Math.min(2, a.angle) * Math.hypot(geometry.d.x, geometry.d.y);
    }
    const allowance = variation + 1e-9 * probes.scale(index);
    return value - limit.lower > allowance && limit.upper - value > allowance;
  });
}
