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
import { arcMayTurn } from './body-arc-turn';

export interface BodyFold {
  readonly command: number;
  readonly poses: GroupPoses;
  readonly curvature: number;
}

export type BodyFoldSearch =
  { readonly kind: 'fold'; readonly fold: BodyFold } | { readonly kind: 'none' | 'unresolved' };

/** Only a positive fold proof turns a continuation refusal into a physical stop. */
export function findBodyFold(
  partition: CompiledBodyPartition,
  poses: GroupPoses,
  physicalTangent: readonly number[],
  target: number,
  scale: BodyPositionScale
): BodyFold | undefined {
  const result = searchBodyFold(partition, poses, physicalTangent, target, scale);
  return result.kind === 'fold' ? result.fold : undefined;
}

/** An unresolved suspected turn must not clear a playback interval. */
export function searchBodyFold(
  partition: CompiledBodyPartition,
  poses: GroupPoses,
  physicalTangent: readonly number[],
  target: number,
  scale: BodyPositionScale
): BodyFoldSearch {
  const coordinate = { ...partition.drivers[0].row, commandId: undefined };
  const current = bodyRowValue(coordinate, poses),
    direction = Math.sign(target - current);
  if (!direction) return { kind: 'none' };
  const oriented = physicalTangent.map((v, i) => (direction * v) / scale.columns[i]);
  const norm = Math.hypot(...oriented);
  const tangent = passiveBodyTangent(
    partition,
    poses,
    scale,
    oriented.map((v) => v / norm)
  );
  if (!tangent) return { kind: 'none' };
  let left: BodyArcPoint = { poses, tangent };
  const slope = (point: BodyArcPoint) =>
    coordinateSlope(partition, coordinate, point, scale) * direction;
  if (slope(left) < -1e-10) return { kind: 'none' };
  const coordinateScale = coordinate.kind === 'angle' ? 1 : scale.length;
  let distance = 0.02;
  for (let step = 0; step < 48; step++) {
    const right = stepBodyArc(partition, left, distance, scale);
    if (!right || checkBodyLimits(partition, right.poses, scale)) return { kind: 'unresolved' };
    if (slope(right) >= 0) {
      const alignment = right.tangent.reduce((sum, value, i) => sum + value * left.tangent[i], 0);
      const jump =
        direction * (bodyRowValue(coordinate, right.poses) - bodyRowValue(coordinate, left.poses));
      // Arc planes use the left tangent's projection as parameter; convert the right
      // derivative to that same parameter before constructing its Hermite polynomial.
      if (alignment <= 0.2 || arcMayTurn(jump, slope(left), slope(right) / alignment, distance)) {
        distance /= 2;
        continue;
      }
      if (direction * (bodyRowValue(coordinate, right.poses) - target) > 1e-12 * coordinateScale)
        return { kind: 'none' };
      left = right;
      distance = Math.min(0.02, 2 * distance);
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
      if (!middle) return { kind: 'unresolved' };
      if (slope(middle) > 0) low = middle;
      else high = middle;
    }
    const point = Math.abs(slope(low)) < Math.abs(slope(high)) ? low : high;
    const command = bodyRowValue(coordinate, point.poses);
    const curvature = coordinateCurvature(partition, coordinate, point, scale);
    if (direction * (command - target) > 1e-12 * coordinateScale) return { kind: 'none' };
    if (
      curvature === undefined ||
      direction * curvature >= -1e-7 * coordinateScale ||
      Math.abs(slope(point)) > 1e-7 * coordinateScale ||
      checkBodyLimits(partition, point.poses, scale)
    )
      return { kind: 'unresolved' };
    return { kind: 'fold', fold: { command, poses: point.poses, curvature } };
  }
  return { kind: 'unresolved' };
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
