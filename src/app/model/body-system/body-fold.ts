import { BodyId } from './body-id';
import { bodyRowGradient, bodyRowValue, GroupPoses } from './body-constraint-rows';
import { BodyConstraintRow, CompiledBodyPartition } from './compiled-body-system';
import { BodyPositionScale } from './body-position-scale';
import {
  BodyArcPoint,
  passiveBodyMatrix,
  passiveBodyTangent,
  scaledDifference,
  stepBodyArc,
} from './body-arc-step';
import { BodyTwist, bodyRowQuadratic } from './body-row-quadratic';
import { factorBodyRows, solveBodyRows } from './body-linear-algebra';
import { checkBodyLimits } from './body-limits';

export interface BodyFold {
  readonly command: number;
  readonly poses: GroupPoses;
  readonly curvature: number;
}

/** A solver refusal becomes a physical reversal only after a regular curve brackets an input extremum. */
export function findBodyFold(
  partition: CompiledBodyPartition,
  poses: GroupPoses,
  physicalTangent: readonly number[],
  target: number,
  scale: BodyPositionScale
): BodyFold | undefined {
  const coordinate = { ...partition.drivers[0].row, commandId: undefined };
  const current = bodyRowValue(coordinate, poses),
    direction = Math.sign(target - current);
  if (!direction) return undefined;
  const oriented = physicalTangent.map((v, i) => (direction * v) / scale.columns[i]);
  const norm = Math.hypot(...oriented);
  const tangent = passiveBodyTangent(
    partition,
    poses,
    scale,
    oriented.map((v) => v / norm)
  );
  if (!tangent) return undefined;
  let left: BodyArcPoint = { poses, tangent };
  const slope = (point: BodyArcPoint) =>
    coordinateSlope(partition, coordinate, point, scale) * direction;
  if (slope(left) < -1e-10) return undefined;
  const coordinateScale = coordinate.kind === 'angle' ? 1 : scale.length;
  for (let step = 0; step < 24; step++) {
    const right = stepBodyArc(partition, left, 0.02, scale);
    if (!right || checkBodyLimits(partition, right.poses, scale)) return undefined;
    if (slope(right) >= 0) {
      if (direction * (bodyRowValue(coordinate, right.poses) - target) >= 0) return undefined;
      left = right;
      continue;
    }
    let low = left,
      high = right;
    for (let cut = 0; cut < 36; cut++) {
      const width = scaledDifference(partition, high.poses, low.poses, scale).reduce(
        (sum, v, i) => sum + v * low.tangent[i],
        0
      );
      if (width <= 1e-10) break;
      const middle = stepBodyArc(partition, low, width / 2, scale);
      if (!middle) return undefined;
      if (slope(middle) > 0) low = middle;
      else high = middle;
    }
    const point = Math.abs(slope(low)) < Math.abs(slope(high)) ? low : high;
    const command = bodyRowValue(coordinate, point.poses);
    const curvature = coordinateCurvature(partition, coordinate, point, scale);
    if (
      curvature === undefined ||
      direction * curvature >= -1e-7 * coordinateScale ||
      Math.abs(slope(point)) > 1e-7 * coordinateScale ||
      direction * (target - command) <= 1e-9 * coordinateScale ||
      checkBodyLimits(partition, point.poses, scale)
    )
      return undefined;
    return { command, poses: point.poses, curvature };
  }
  return undefined;
}

function coordinateSlope(
  partition: CompiledBodyPartition,
  coordinate: BodyConstraintRow,
  point: BodyArcPoint,
  scale: BodyPositionScale
): number {
  const gradient = bodyRowGradient(coordinate, point.poses);
  return partition.unknowns.reduce(
    (sum, id, i) =>
      sum +
      (gradient.get(id) ?? [0, 0, 0]).reduce(
        (v, g, j) => v + g * point.tangent[3 * i + j] * scale.columns[3 * i + j],
        0
      ),
    0
  );
}

function coordinateCurvature(
  partition: CompiledBodyPartition,
  coordinate: BodyConstraintRow,
  point: BodyArcPoint,
  scale: BodyPositionScale
): number | undefined {
  const passive = passiveBodyMatrix(partition, point.poses, scale);
  const matrix = [...passive.matrix, [...point.tangent]];
  const twists = new Map<BodyId, BodyTwist>(
    partition.boundary.map((id) => [id, { vx: 0, vy: 0, omega: 0 }])
  );
  partition.unknowns.forEach((id, i) =>
    twists.set(id, {
      vx: point.tangent[3 * i] * scale.columns[3 * i],
      vy: point.tangent[3 * i + 1] * scale.columns[3 * i + 1],
      omega: point.tangent[3 * i + 2],
    })
  );
  const rhs = [
    ...passive.rows.map(
      (row, i) => -bodyRowQuadratic(row, point.poses, twists) * passive.factors[i]
    ),
    0,
  ];
  const factor = factorBodyRows(matrix, partition.unknowns.length * 3);
  const acceleration = factor && solveBodyRows(factor, rhs);
  if (!acceleration) return undefined;
  const error = matrix.map((row, i) =>
    row.reduce((sum, v, j) => sum + v * acceleration[j], -rhs[i])
  );
  if (Math.hypot(...error) > 1e-8 * Math.max(1, Math.hypot(...rhs))) return undefined;
  const gradient = bodyRowGradient(coordinate, point.poses);
  return (
    bodyRowQuadratic(coordinate, point.poses, twists) +
    partition.unknowns.reduce(
      (sum, id, i) =>
        sum +
        (gradient.get(id) ?? [0, 0, 0]).reduce(
          (v, g, j) => v + g * acceleration[3 * i + j] * scale.columns[3 * i + j],
          0
        ),
      0
    )
  );
}
