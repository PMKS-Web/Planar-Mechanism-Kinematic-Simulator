import {
  FourBarParameters,
  FourBarPose,
  GeometryFailure,
  TrajectoryEvaluation,
} from './path-types';
import { distance } from './path-target';

const TAU = 2 * Math.PI;

export function parameterFailure(p: FourBarParameters): GeometryFailure | undefined {
  if (
    ![p.A.x, p.A.y, p.D.x, p.D.y, p.crank, p.coupler, p.rocker, p.u, p.v, p.theta0, p.sweep].every(
      Number.isFinite
    ) ||
    Math.min(p.crank, p.coupler, p.rocker, distance(p.A, p.D)) <= 0 ||
    p.sweep <= 0 ||
    p.sweep > TAU + 1e-10 ||
    ![-1, 1].includes(p.assembly) ||
    !['clockwise', 'counterclockwise'].includes(p.direction)
  )
    return 'invalid-geometry';
  return undefined;
}

/** Fixed oriented-circle sign. A root cannot change sign without passing through a rejected tangency. */
export function fourBarPose(p: FourBarParameters, theta: number): FourBarPose | GeometryFailure {
  const failure = parameterFailure(p);
  if (failure || !Number.isFinite(theta)) return failure ?? 'invalid-geometry';
  const B = { x: p.A.x + p.crank * Math.cos(theta), y: p.A.y + p.crank * Math.sin(theta) };
  const dx = p.D.x - B.x,
    dy = p.D.y - B.y,
    d = Math.hypot(dx, dy);
  const scale = Math.max(p.crank, p.coupler, p.rocker, distance(p.A, p.D));
  if (d <= scale * 1e-10) return 'singularity';
  if (d > p.coupler + p.rocker || d < Math.abs(p.coupler - p.rocker)) return 'no-intersection';
  const a = (p.coupler * p.coupler - p.rocker * p.rocker + d * d) / (2 * d);
  const h2 = p.coupler * p.coupler - a * a;
  if (h2 <= scale * scale * 1e-10) return 'near-tangent';
  const h = Math.sqrt(h2) * p.assembly;
  const C = { x: B.x + (a * dx - h * dy) / d, y: B.y + (a * dy + h * dx) / d };
  const ex = (C.x - B.x) / p.coupler,
    ey = (C.y - B.y) / p.coupler;
  const P = { x: B.x + p.u * ex - p.v * ey, y: B.y + p.u * ey + p.v * ex };
  if (![B.x, B.y, C.x, C.y, P.x, P.y].every(Number.isFinite)) return 'invalid-geometry';
  return { B, C, P };
}

/** Exact extrema of |D-B(theta)| certify every angle, including gaps between comparison samples. */
export function sweepClearance(p: FourBarParameters): number {
  const g = distance(p.A, p.D),
    phi = Math.atan2(p.D.y - p.A.y, p.D.x - p.A.x);
  const start = p.theta0 % TAU;
  const end = start + (p.direction === 'clockwise' ? -p.sweep : p.sweep);
  const lo = Math.min(start, end),
    hi = Math.max(start, end);
  const angles = [lo, hi];
  for (let k = Math.ceil((lo - phi) / Math.PI); k <= Math.floor((hi - phi) / Math.PI); k++)
    angles.push(phi + k * Math.PI);
  const ds = angles.map((t) =>
    Math.sqrt(Math.max(0, g * g + p.crank * p.crank - 2 * g * p.crank * Math.cos(t - phi)))
  );
  return Math.min(
    Math.min(...ds) - Math.abs(p.coupler - p.rocker),
    p.coupler + p.rocker - Math.max(...ds)
  );
}

/** Equal input angle is one correspondence strategy, not unrestricted path generation. */
export function inputAngles(p: FourBarParameters, count: number, closed: boolean): number[] {
  return Array.from(
    { length: count },
    (_, i) =>
      p.theta0 +
      ((p.direction === 'clockwise' ? -1 : 1) * p.sweep * i) / (closed ? count : count - 1)
  );
}

export function evaluateFourBar(
  p: FourBarParameters,
  count: number,
  closed: boolean
): TrajectoryEvaluation {
  const failure = parameterFailure(p);
  if (
    failure ||
    !Number.isInteger(count) ||
    count < 2 ||
    count > 10000 ||
    (closed && Math.abs(p.sweep - TAU) > 1e-9)
  )
    return { valid: false, reason: failure ?? 'invalid-geometry' };
  const minClearance = sweepClearance(p);
  const scale = Math.max(p.crank, p.coupler, p.rocker, distance(p.A, p.D));
  if (minClearance <= scale * 1e-5)
    return { valid: false, reason: minClearance < 0 ? 'input-sweep-infeasible' : 'near-tangent' };
  const angles = inputAngles(p, count, closed),
    poses: FourBarPose[] = [];
  for (const theta of angles) {
    const pose = fourBarPose(p, theta);
    if (typeof pose === 'string') return { valid: false, reason: pose };
    const cross =
      (p.D.x - pose.B.x) * (pose.C.y - pose.B.y) - (p.D.y - pose.B.y) * (pose.C.x - pose.B.x);
    if (Math.sign(cross) !== p.assembly) return { valid: false, reason: 'branch-discontinuity' };
    poses.push(pose);
  }
  return { valid: true, poses, angles, minClearance };
}
