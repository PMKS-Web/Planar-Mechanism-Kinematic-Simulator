/** Same-sign endpoint slopes can enclose two turns. A Hermite derivative exposes that
 * possibility without requiring a sample to land inside the small reversed interval.
 * This is an adaptive subdivision signal, never by itself proof of a physical stop.
 */
export function arcMayTurn(
  jump: number,
  leftSlope: number,
  rightSlope: number,
  distance: number
): boolean {
  const a = -6 * jump + 3 * distance * (leftSlope + rightSlope);
  const b = 6 * jump - distance * (4 * leftSlope + 2 * rightSlope);
  const c = distance * leftSlope;
  const vertex = a === 0 ? -1 : -b / (2 * a);
  if (vertex <= 0 || vertex >= 1) return false;
  const minimum = a * vertex * vertex + b * vertex + c;
  return minimum <= 128 * Number.EPSILON * (Math.abs(a) + Math.abs(b) + Math.abs(c));
}
