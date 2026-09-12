/** Unrounded parallel-axis trace in model lengths and stored mass/inertia units.
 * Callers establish that G is the centroid for the supplied mass distribution. */
export function parallelAxis(
  mass: number,
  center: { x: number; y: number },
  centroidalInertia: number,
  point: { x: number; y: number },
  factor: number
) {
  const dx = center.x - point.x;
  const dy = center.y - point.y;
  const distanceSq = dx ** 2 + dy ** 2;
  const shift = mass * distanceSq * factor;
  return { dx, dy, distanceSq, shift, inertia: centroidalInertia + shift };
}
export type ParallelAxisTrace = ReturnType<typeof parallelAxis>;
