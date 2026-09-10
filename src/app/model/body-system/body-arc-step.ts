import { CompiledBodyPartition } from './compiled-body-system';
import { bodyRowsJacobian, bodyRowValue, GroupPoses } from './body-constraint-rows';
import { BodyPositionScale } from './body-position-scale';
import { bodyNullSpace, factorBodyRows, solveBodyRows } from './body-linear-algebra';

export interface BodyArcPoint {
  readonly poses: GroupPoses;
  readonly tangent: readonly number[];
}

export function passiveBodyMatrix(
  partition: CompiledBodyPartition,
  poses: GroupPoses,
  scale: BodyPositionScale
) {
  const indices = partition.rows.flatMap((row, i) => (row.commandId === undefined ? [i] : []));
  const rows = indices.map((i) => partition.rows[i]);
  const factors = indices.map((i) => scale.rows[i]);
  const matrix = bodyRowsJacobian(rows, poses, partition.unknowns).map((row, i) =>
    row.map((v, j) => v * factors[i] * scale.columns[j])
  );
  return { rows, factors, matrix };
}

export function passiveBodyTangent(
  partition: CompiledBodyPartition,
  poses: GroupPoses,
  scale: BodyPositionScale,
  orientation: readonly number[]
): number[] | undefined {
  const { matrix } = passiveBodyMatrix(partition, poses, scale);
  const factor = factorBodyRows(matrix, partition.unknowns.length * 3);
  if (!factor || factor.rank !== factor.width - 1) return undefined;
  const tangent = bodyNullSpace(factor)[0];
  const alignment = tangent.reduce((sum, v, i) => sum + v * orientation[i], 0);
  if (Math.abs(alignment) < 0.2) return undefined;
  return tangent.map((value) => value * Math.sign(alignment));
}

/** An arc plane can follow a regular mechanism through a turning point of its chosen input. */
export function stepBodyArc(
  partition: CompiledBodyPartition,
  start: BodyArcPoint,
  distance: number,
  scale: BodyPositionScale
): BodyArcPoint | undefined {
  const predicted = shiftPoses(
    partition,
    start.poses,
    start.tangent.map((v) => v * distance),
    scale
  );
  let poses = predicted;
  const passive = passiveBodyMatrix(partition, poses, scale);
  const residual = (candidate: GroupPoses) => [
    ...passive.rows.map((row, i) => bodyRowValue(row, candidate) * passive.factors[i]),
    scaledDifference(partition, candidate, predicted, scale).reduce(
      (sum, v, i) => sum + v * start.tangent[i],
      0
    ),
  ];
  for (let iteration = 0; iteration < 20; iteration++) {
    const values = residual(poses),
      norm = Math.hypot(...values);
    if (!Number.isFinite(norm)) return undefined;
    if (norm <= 1e-11) {
      const tangent = passiveBodyTangent(partition, poses, scale, start.tangent);
      return tangent && { poses, tangent };
    }
    const matrix = [...passiveBodyMatrix(partition, poses, scale).matrix, [...start.tangent]];
    const factor = factorBodyRows(matrix, partition.unknowns.length * 3);
    const correction =
      factor &&
      solveBodyRows(
        factor,
        values.map((v) => -v)
      );
    if (!correction) return undefined;
    let improved = false;
    for (let cut = 0; cut < 10; cut++) {
      const candidate = shiftPoses(
        partition,
        poses,
        correction.map((v) => v * 2 ** -cut),
        scale
      );
      if (Math.hypot(...residual(candidate)) < norm) {
        poses = candidate;
        improved = true;
        break;
      }
    }
    if (!improved) return undefined;
  }
  return undefined;
}

export function scaledDifference(
  partition: CompiledBodyPartition,
  a: GroupPoses,
  b: GroupPoses,
  scale: BodyPositionScale
): number[] {
  return partition.unknowns.flatMap((id, i) => {
    const first = a.get(id)!,
      second = b.get(id)!;
    return [
      (first.x - second.x) / scale.columns[3 * i],
      (first.y - second.y) / scale.columns[3 * i + 1],
      first.angle - second.angle,
    ];
  });
}

function shiftPoses(
  partition: CompiledBodyPartition,
  source: GroupPoses,
  delta: readonly number[],
  scale: BodyPositionScale
): GroupPoses {
  const result = new Map(source);
  partition.unknowns.forEach((id, i) => {
    const pose = source.get(id)!,
      j = 3 * i;
    result.set(id, {
      x: pose.x + delta[j] * scale.columns[j],
      y: pose.y + delta[j + 1] * scale.columns[j + 1],
      angle: pose.angle + delta[j + 2],
    });
  });
  return result;
}
