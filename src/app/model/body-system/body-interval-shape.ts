import { resolvedScalarInterval } from './scalar-interval-shape';
import { BodyIntervalPoint } from './body-interval-types';
import { BodyIntervalProbes } from './body-interval-probes';

/** Hermite checks are an adaptive numerical search, not an interval-arithmetic proof of a nonlinear path. */
export function resolvedBodyInterval(
  probes: BodyIntervalProbes,
  left: BodyIntervalPoint,
  middle: BodyIntervalPoint,
  right: BodyIntervalPoint
): boolean {
  const h = right.state.command - left.state.command;
  if (Math.abs(h) > 0.1 * probes.commandScale) return false;
  for (const id of probes.admitted.frame.partition.unknowns) {
    const angles = [left, middle, right].map((point) => point.state.poses.get(id)!.angle);
    if (Math.abs(angles[1] - angles[0]) + Math.abs(angles[2] - angles[1]) > 0.1) return false;
  }
  if (right.fold) {
    const driver = probes.admitted.frame.partition.drivers[0].row;
    // The commanded coordinate is affine in the command even at a geometric fold.
    // Only passive coordinates need a small geometric enclosure and passive tangents;
    // forcing driver-only limits into that enclosure asks Newton to resolve a singularity.
    if (
      probes.admitted.frame.partition.limits.every(
        (limit) => limit.row.jointId === driver.jointId && limit.row.kind === driver.kind
      )
    )
      return true;
    // At a proved fold use a short geometric leaf and the oriented passive tangent.
    // Command derivatives diverge there; these probe slopes are never analysis rates.
    const spread = Math.max(
      0,
      ...probes.admitted.frame.partition.unknowns.flatMap((id) => {
        const a = left.state.poses.get(id)!,
          b = middle.state.poses.get(id)!,
          c = right.state.poses.get(id)!;
        return [
          Math.hypot(b.x - a.x, b.y - a.y) / probes.admitted.scale.length +
            Math.hypot(c.x - b.x, c.y - b.y) / probes.admitted.scale.length,
          Math.abs(b.angle - a.angle) + Math.abs(c.angle - b.angle),
        ];
      })
    );
    return (
      spread <= 1e-5 &&
      [left, middle, right].every((point) => point.limits.every((limit) => limit !== undefined))
    );
  }
  return probes.admitted.frame.partition.limits.every((_, i) => {
    const l = left.limits[i],
      m = middle.limits[i],
      r = right.limits[i];
    if (!l || !m || !r) return false;
    const tolerance = probes.scale(i);
    return resolvedScalarInterval(l, m, r, h, tolerance);
  });
}
