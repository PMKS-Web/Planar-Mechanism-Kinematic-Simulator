import { PathPoint, PathTarget, PreparedPath, SynthesisStatus } from './path-types';

export const distance = (a: PathPoint, b: PathPoint): number => Math.hypot(a.x - b.x, a.y - b.y);

export type TargetPreparation =
  { valid: true; path: PreparedPath } | { valid: false; status: SynthesisStatus; message: string };

/** Uniform samples of the same Catmull–Rom cubics drawn by the editor, then arc-length resampled. */
export function preparePath(target: PathTarget, count: number): TargetPreparation {
  const fail = (status: SynthesisStatus, message: string): TargetPreparation => ({
    valid: false,
    status,
    message,
  });
  if (
    !Number.isInteger(count) ||
    count < 12 ||
    count > 512 ||
    !['polyline', 'catmull-rom'].includes(target.interpolation) ||
    typeof target.closed !== 'boolean' ||
    target.points.length > 4096 ||
    target.points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))
  )
    return fail('invalid-settings', 'Use finite target coordinates and 12–512 evaluation samples.');
  if (target.points.length < 3)
    return fail('insufficient-points', 'Add at least three distinct path points.');
  const xs = target.points.map((p) => p.x),
    ys = target.points.map((p) => p.y);
  const bounds = {
    min: { x: Math.min(...xs), y: Math.min(...ys) },
    max: { x: Math.max(...xs), y: Math.max(...ys) },
  };
  const dimension = distance(bounds.min, bounds.max);
  const magnitude = Math.max(...xs.map(Math.abs), ...ys.map(Math.abs), 1);
  if (!Number.isFinite(dimension) || dimension <= Math.max(1e-12, magnitude * Number.EPSILON * 64))
    return fail('degenerate-target', 'The target path has no resolvable size.');
  const tolerance = dimension * 1e-8;
  const points: PathPoint[] = [];
  for (const p of target.points) {
    if (!points.length || distance(p, points[points.length - 1]) > tolerance)
      points.push({ x: p.x, y: p.y });
  }
  if (
    target.closed &&
    points.length > 1 &&
    distance(points[0], points[points.length - 1]) <= tolerance
  )
    points.pop();
  let repeatedPoints = 0;
  points.forEach((p, i) => {
    if (points.slice(0, i).some((q) => distance(p, q) <= tolerance)) repeatedPoints++;
  });
  if (points.length - repeatedPoints < 3)
    return fail('insufficient-points', 'Add at least three distinct path points.');
  const at = (i: number) =>
    points[
      target.closed
        ? (i + points.length) % points.length
        : Math.max(0, Math.min(points.length - 1, i))
    ];
  const dense: PathPoint[] = [points[0]];
  const segments = target.closed ? points.length : points.length - 1;
  for (let i = 0; i < segments; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const steps = target.interpolation === 'catmull-rom' ? 64 : 1;
    for (let j = 1; j <= steps; j++) {
      const t = j / steps;
      const axis = (k: 'x' | 'y') =>
        steps === 1
          ? p2[k]
          : 0.5 *
            (2 * p1[k] +
              (-p0[k] + p2[k]) * t +
              (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t +
              (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t * t * t);
      dense.push({ x: axis('x'), y: axis('y') });
    }
  }
  const cumulativeArcLength = [0];
  for (let i = 1; i < dense.length; i++)
    cumulativeArcLength.push(cumulativeArcLength[i - 1] + distance(dense[i - 1], dense[i]));
  const totalArcLength = cumulativeArcLength[cumulativeArcLength.length - 1];
  if (!Number.isFinite(totalArcLength) || totalArcLength <= tolerance)
    return fail('degenerate-target', 'The target path has no resolvable arc length.');
  let segment = 1;
  const samples = Array.from({ length: count }, (_, i) => {
    const length = (totalArcLength * i) / (target.closed ? count : count - 1);
    while (segment < dense.length - 1 && cumulativeArcLength[segment] < length) segment++;
    const span = cumulativeArcLength[segment] - cumulativeArcLength[segment - 1];
    const t = span ? (length - cumulativeArcLength[segment - 1]) / span : 0;
    const a = dense[segment - 1],
      b = dense[segment];
    return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
  });
  const centroid = samples.reduce((a, p) => ({ x: a.x + p.x / count, y: a.y + p.y / count }), {
    x: 0,
    y: 0,
  });
  return {
    valid: true,
    path: {
      points,
      samples,
      normalized: samples.map((p) => ({
        x: (p.x - centroid.x) / dimension,
        y: (p.y - centroid.y) / dimension,
      })),
      closed: target.closed,
      bounds,
      centroid,
      dimension,
      cumulativeArcLength,
      totalArcLength,
      removedDuplicates: target.points.length - points.length,
      repeatedPoints,
    },
  };
}
