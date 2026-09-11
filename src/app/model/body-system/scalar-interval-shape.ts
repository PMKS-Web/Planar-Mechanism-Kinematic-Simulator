export interface ScalarIntervalPoint {
  readonly value: number;
  readonly slope: number;
}

/** A cubic predicts where more sampling is needed; it cannot certify an arbitrary nonlinear interval. */
export function resolvedScalarInterval(
  l: ScalarIntervalPoint,
  m: ScalarIntervalPoint,
  r: ScalarIntervalPoint,
  h: number,
  tolerance: number
): boolean {
  const predicted = (l.value + r.value) / 2 + (h * (l.slope - r.slope)) / 8;
  const slope = (1.5 * (r.value - l.value)) / h - (l.slope + r.slope) / 4;
  if (
    Math.abs(m.value - predicted) > 1e-7 * tolerance ||
    Math.abs(h * (m.slope - slope)) > 1e-6 * tolerance
  )
    return false;
  // A predicted stationary point must have a real derivative bracket in that half.
  // Otherwise subdivide instead of assuming equal endpoint signs mean monotonicity.
  return [
    [l, m],
    [m, r],
  ].every(([a, b]) => {
    if (a.slope * b.slope <= 0) return true;
    const width = h / 2;
    const qa = 6 * (a.value - b.value) + 3 * width * (a.slope + b.slope);
    const qb = 6 * (b.value - a.value) - width * (4 * a.slope + 2 * b.slope);
    const qc = width * a.slope;
    const vertex = qa === 0 ? -1 : -qb / (2 * qa);
    return vertex <= 0 || vertex >= 1 || (qa * vertex * vertex + qb * vertex + qc) * qc > 0;
  });
}
