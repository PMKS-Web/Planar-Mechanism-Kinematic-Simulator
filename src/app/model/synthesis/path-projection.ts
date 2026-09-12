import { FourBarParameters, FourBarPose, PathPoint } from './path-types';
import { fourBarPose } from './four-bar';
import { linearFit } from './linear-fit';

export function poseAtProgress(p: FourBarParameters, progress: number): FourBarPose {
  const pose = fourBarPose(
    p,
    p.theta0 + (p.direction === 'clockwise' ? -1 : 1) * p.sweep * progress
  );
  if (typeof pose === 'string') throw new Error(pose);
  return pose;
}

/** Six-coefficient variable projection remains linear for any fixed ordered timing. */
export function projectPath(
  p: FourBarParameters,
  progress: readonly number[],
  target: readonly PathPoint[]
): number[] | undefined {
  const rows: number[][] = [],
    rhs: number[] = [];
  progress.forEach((t, i) => {
    const { B, C } = poseAtProgress(p, t);
    const ex = (C.x - B.x) / p.coupler,
      ey = (C.y - B.y) / p.coupler;
    rows.push([1, 0, B.x, -B.y, ex, -ey], [0, 1, B.y, B.x, ey, ex]);
    rhs.push(target[i].x, target[i].y);
  });
  return linearFit(rows, rhs);
}

export function projectedPoint(
  pose: FourBarPose,
  coupler: number,
  coefficients: readonly number[]
): PathPoint {
  const [tx, ty, a, b, c, d] = coefficients,
    { B, C } = pose;
  const ex = (C.x - B.x) / coupler,
    ey = (C.y - B.y) / coupler;
  return {
    x: tx + a * B.x - b * B.y + c * ex - d * ey,
    y: ty + b * B.x + a * B.y + d * ex + c * ey,
  };
}
