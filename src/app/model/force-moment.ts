/** Right-handed planar cross product: positive means counterclockwise. Use
 * consistent physical length/force units; the result has their product unit. */
export function forceMoment(
  application: { x: number; y: number },
  about: { x: number; y: number },
  fx: number,
  fy: number,
  distanceFactor = 1
) {
  const rx = (application.x - about.x) * distanceFactor;
  const ry = (application.y - about.y) * distanceFactor;
  return { rx, ry, fx, fy, moment: rx * fy - ry * fx };
}
