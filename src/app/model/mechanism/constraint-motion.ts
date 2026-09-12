import {
  jacobian,
  PositionMap,
  residuals,
  secondOrderTerms,
  SimultaneousSystem,
} from './simultaneous-solver';

/** Audit the original equations, including rows the reduced solve cannot see. */
export function constraintMotionHolds(
  system: SimultaneousSystem,
  positions: PositionMap,
  velocity: PositionMap,
  acceleration: PositionMap,
  scale: number
): boolean {
  const ids = system.unknownIds;
  if (ids.some((id) => !positions.has(id) || !velocity.has(id) || !acceleration.has(id)))
    return false;
  if (
    residuals(system, positions, 0).some(
      (value) => !Number.isFinite(value) || Math.abs(value) > scale * 1e-6
    )
  )
    return false;
  const j = jacobian(system, positions, new Map(ids.map((id, index) => [id, index])), 0);
  const v = ids.flatMap((id) => velocity.get(id)!);
  const a = ids.flatMap((id) => acceleration.get(id)!);
  const gamma = secondOrderTerms(system, positions, velocity, 0, 0);
  return j.every((row, index) => {
    const first = row.map((value, col) => value * v[col]);
    const second = row.map((value, col) => value * a[col]);
    const agrees = (values: number[], offset: number) => {
      const sum = values.reduce((total, value) => total + value, offset);
      const magnitude = values.reduce((total, value) => total + Math.abs(value), Math.abs(offset));
      return Number.isFinite(sum) && Math.abs(sum) <= 1e-6 * Math.max(scale, magnitude);
    };
    return agrees(first, 0) && agrees(second, gamma[index]);
  });
}
