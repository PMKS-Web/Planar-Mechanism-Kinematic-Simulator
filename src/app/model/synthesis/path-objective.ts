import {
  Assembly,
  FourBarParameters,
  InputDirection,
  PathConstraints,
  PathErrors,
  PathPoint,
  PathSynthesisCandidate,
  PreparedPath,
} from './path-types';
import { distance } from './path-target';
import { evaluateFourBar } from './four-bar';
import { linearFit } from './linear-fit';

export function pathErrors(
  generated: readonly PathPoint[],
  target: readonly PathPoint[],
  dimension: number
): PathErrors {
  if (generated.length !== target.length || !target.length || !(dimension > 0))
    throw new Error('Path error requires paired samples and a positive reference dimension.');
  const pointErrors = generated.map((p, i) => distance(p, target[i]));
  const rms = Math.sqrt(pointErrors.reduce((sum, e) => sum + e * e, 0) / pointErrors.length);
  return { pointErrors, rms, maximum: Math.max(...pointErrors), normalizedRms: rms / dimension };
}

export function withinConstraints(
  p: FourBarParameters,
  target: PreparedPath,
  constraints: PathConstraints
): boolean {
  const dim = target.dimension;
  const ground = constraints.groundLength ?? [0.05 * dim, 8 * dim];
  const link = constraints.linkLength ?? [0.02 * dim, 8 * dim];
  const inRange = (n: number, range: readonly number[]) => n >= range[0] && n <= range[1];
  if (
    !inRange(distance(p.A, p.D), ground) ||
    ![p.crank, p.coupler, p.rocker].every((n) => inRange(n, link)) ||
    Math.hypot(p.u, p.v) > (constraints.maxCouplerOffset ?? 8 * dim)
  )
    return false;
  const box = constraints.pivotBox ?? {
    min: { x: target.centroid.x - 8 * dim, y: target.centroid.y - 8 * dim },
    max: { x: target.centroid.x + 8 * dim, y: target.centroid.y + 8 * dim },
  };
  return [p.A, p.D].every(
    (q) => q.x >= box.min.x && q.x <= box.max.x && q.y >= box.min.y && q.y <= box.max.y
  );
}

export type ObjectiveTrial =
  { candidate: PathSynthesisCandidate; score: number } | { reason: string; score: number };

/**
 * Variable projection eliminates six linear coefficients. Ground is (0,0)→(1,0).
 * P = t + a B + b J B + c e + d J e. Any nonzero (a,b) is a similarity;
 * (c,d)/(a+ib) supplies the local coupler offset. Search only ratios and crank angles.
 */
export function fitFourBar(
  vector: readonly number[],
  assembly: Assembly,
  direction: InputDirection,
  target: PreparedPath,
  constraints: PathConstraints
): ObjectiveTrial {
  const reject = (reason: string): ObjectiveTrial => ({ reason, score: Infinity });
  const canonical: FourBarParameters = {
    A: { x: 0, y: 0 },
    D: { x: 1, y: 0 },
    crank: Math.exp(vector[0]),
    coupler: Math.exp(vector[1]),
    rocker: Math.exp(vector[2]),
    u: 0,
    v: 0,
    theta0: vector[3],
    sweep: target.closed ? 2 * Math.PI : vector[4],
    assembly,
    direction,
  };
  const evaluation = evaluateFourBar(canonical, target.samples.length, target.closed);
  if (!evaluation.valid) return reject(evaluation.reason);
  const rows: number[][] = [],
    rhs: number[] = [];
  evaluation.poses.forEach(({ B, C }, i) => {
    const ex = (C.x - B.x) / canonical.coupler,
      ey = (C.y - B.y) / canonical.coupler;
    rows.push([1, 0, B.x, -B.y, ex, -ey], [0, 1, B.y, B.x, ey, ex]);
    rhs.push(target.normalized[i].x, target.normalized[i].y);
  });
  const coefficients = linearFit(rows, rhs);
  if (!coefficients) return reject('rank-deficient-fit');
  const [tx, ty, a, b, c, d] = coefficients;
  const scale = Math.hypot(a, b),
    rotation = Math.atan2(b, a),
    dim = target.dimension;
  if (scale < 1e-8) return reject('collapsed-ground');
  const world = (x: number, y: number) => ({
    x: target.centroid.x + dim * (tx + a * x - b * y),
    y: target.centroid.y + dim * (ty + b * x + a * y),
  });
  const p: FourBarParameters = {
    ...canonical,
    A: world(0, 0),
    D: world(1, 0),
    crank: canonical.crank * scale * dim,
    coupler: canonical.coupler * scale * dim,
    rocker: canonical.rocker * scale * dim,
    u: ((a * c + b * d) / scale) * dim,
    v: ((a * d - b * c) / scale) * dim,
    theta0: canonical.theta0 + rotation,
  };
  if (!withinConstraints(p, target, constraints)) return reject('geometry-bounds');
  const result = evaluateFourBar(p, target.samples.length, target.closed);
  if (!result.valid) return reject(result.reason);
  const trajectory = result.poses.map((pose) => pose.P),
    errors = pathErrors(trajectory, target.samples, dim);
  if (!Number.isFinite(errors.normalizedRms)) return reject('nonfinite-error');
  return {
    score: errors.normalizedRms * errors.normalizedRms,
    candidate: {
      parameters: p,
      trajectory,
      angles: result.angles,
      errors,
      valid: true,
      minClearance: result.minClearance,
      penalty: 0,
      production: { status: 'unchecked', samples: 0 },
    },
  };
}
