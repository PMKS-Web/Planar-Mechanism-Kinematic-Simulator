import { BodyId, DriverId } from './body-id';
import { finitePose } from './body-frame';
import { BodyTwist, bodyRowQuadratic } from './body-row-quadratic';
import { bodyRowGradient, bodyRowValue, GroupPoses } from './body-constraint-rows';
import { CompiledBodyPartition } from './compiled-body-system';
import { bodyPositionScale } from './body-position-scale';
import { factorBodyRows, solveBodyRows } from './body-linear-algebra';

export interface BodyAcceleration {
  readonly ax: number;
  readonly ay: number;
  readonly alpha: number;
}
export interface BodyMotion {
  readonly velocity: BodyTwist;
  readonly acceleration: BodyAcceleration;
}
export interface CommandMotion {
  readonly value: number;
  readonly velocity: number;
  readonly acceleration: number;
}
export type BodyRatesResult =
  | { readonly ok: true; readonly motions: ReadonlyMap<BodyId, BodyMotion> }
  | {
      readonly ok: false;
      readonly reason:
        | 'invalid'
        | 'pose'
        | 'rank'
        | 'reversal'
        | 'velocity-inconsistent'
        | 'acceleration-inconsistent';
    };

/** No caches or fallback: an unavailable sample cannot inherit a previous sample's rates. */
export function solveBodyRates(
  partition: CompiledBodyPartition,
  poses: GroupPoses,
  commands: ReadonlyMap<DriverId, CommandMotion>,
  boundary: ReadonlyMap<BodyId, BodyMotion>
): BodyRatesResult {
  const ids = [...partition.unknowns, ...partition.boundary];
  const idSet = new Set(ids);
  if (idSet.size !== ids.length || ids.some((id) => !poses.has(id) || !finitePose(poses.get(id)!)))
    return { ok: false, reason: 'invalid' };
  for (const id of partition.boundary) {
    const motion = boundary.get(id);
    if (!motion || !finiteMotion(motion)) return { ok: false, reason: 'invalid' };
  }
  const values = new Map<DriverId, number>();
  for (const row of partition.rows) {
    if (!idSet.has(row.pair.groupA) || !idSet.has(row.pair.groupB))
      return { ok: false, reason: 'invalid' };
    if (!row.commandId) continue;
    const motion = commands.get(row.commandId);
    if (!motion || ![motion.value, motion.velocity, motion.acceleration].every(Number.isFinite))
      return { ok: false, reason: 'invalid' };
    values.set(row.commandId, motion.value);
  }
  const scaling = bodyPositionScale(partition, poses, values);
  for (const [i, row] of partition.rows.entries()) {
    const residual = bodyRowValue(row, poses, values) * scaling.rows[i];
    if (!Number.isFinite(residual) || Math.abs(residual) > 1e-9)
      return { ok: false, reason: 'pose' };
  }
  const gradients = partition.rows.map((row) => bodyRowGradient(row, poses));
  const matrix = gradients.map((gradient, i) =>
    partition.unknowns
      .flatMap((id) => gradient.get(id) ?? [0, 0, 0])
      .map((value, j) => value * scaling.rows[i] * scaling.columns[j])
  );
  const factor = factorBodyRows(matrix, partition.unknowns.length * 3);
  if (!factor || factor.rank !== partition.unknowns.length * 3)
    return { ok: false, reason: 'rank' };
  const prescribed = (index: number, order: 'velocity' | 'acceleration') => {
    let value = 0;
    for (const id of partition.boundary) {
      const row = gradients[index].get(id);
      if (!row) continue;
      const motion = boundary.get(id)!;
      const vector =
        order === 'velocity'
          ? [motion.velocity.vx, motion.velocity.vy, motion.velocity.omega]
          : [motion.acceleration.ax, motion.acceleration.ay, motion.acceleration.alpha];
      value += row.reduce((sum, coefficient, j) => sum + coefficient * vector[j], 0);
    }
    return value;
  };
  const solve = (rhs: number[]) => {
    const scaled = rhs.map((value, i) => value * scaling.rows[i]);
    const answer = solveBodyRows(factor, scaled);
    if (!answer || !rateRowsConsistent(matrix, answer, scaled)) return undefined;
    return answer.map((value, j) => value * scaling.columns[j]);
  };
  const velocity = solve(
    partition.rows.map(
      (row, i) =>
        (row.commandId ? commands.get(row.commandId)!.velocity : 0) - prescribed(i, 'velocity')
    )
  );
  if (!velocity) return { ok: false, reason: 'velocity-inconsistent' };
  const twists = new Map(partition.boundary.map((id) => [id, boundary.get(id)!.velocity]));
  partition.unknowns.forEach((id, i) =>
    twists.set(id, { vx: velocity[3 * i], vy: velocity[3 * i + 1], omega: velocity[3 * i + 2] })
  );
  // Gamma follows the complete velocity, including a moving boundary. Its acceleration
  // enters through the boundary columns separately; differentiating only q loses both terms.
  const acceleration = solve(
    partition.rows.map(
      (row, i) =>
        (row.commandId ? commands.get(row.commandId)!.acceleration : 0) -
        prescribed(i, 'acceleration') -
        bodyRowQuadratic(row, poses, twists)
    )
  );
  if (!acceleration) return { ok: false, reason: 'acceleration-inconsistent' };
  const motions = new Map(partition.boundary.map((id) => [id, boundary.get(id)!]));
  partition.unknowns.forEach((id, i) =>
    motions.set(id, {
      velocity: twists.get(id)!,
      acceleration: {
        ax: acceleration[3 * i],
        ay: acceleration[3 * i + 1],
        alpha: acceleration[3 * i + 2],
      },
    })
  );
  return [...motions.values()].every(finiteMotion)
    ? { ok: true, motions }
    : { ok: false, reason: 'invalid' };
}

function finiteMotion(motion: BodyMotion): boolean {
  return [
    motion.velocity.vx,
    motion.velocity.vy,
    motion.velocity.omega,
    motion.acceleration.ax,
    motion.acceleration.ay,
    motion.acceleration.alpha,
  ].every(Number.isFinite);
}

/** A least-squares fit must satisfy every row, including a redundant row with tiny rates. */
function rateRowsConsistent(
  matrix: readonly number[][],
  answer: readonly number[],
  rhs: readonly number[]
): boolean {
  const solutionNorm = Math.hypot(...answer);
  return matrix.every((row, i) => {
    const terms = row.map((value, j) => value * answer[j]);
    const residual = terms.reduce((sum, value) => sum + value, -rhs[i]);
    const magnitude = terms.reduce((sum, value) => sum + Math.abs(value), Math.abs(rhs[i]));
    // A mathematically zero component can inherit elimination round-off from another
    // column. This allowance scales with the solve, never with an absolute unit of rate.
    const roundoff = 128 * Number.EPSILON * Math.hypot(...row) * solutionNorm;
    return (
      Number.isFinite(residual) &&
      Number.isFinite(magnitude) &&
      Number.isFinite(roundoff) &&
      Math.abs(residual) <= 1e-9 * magnitude + roundoff
    );
  });
}
