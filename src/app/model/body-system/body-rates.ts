import { BodyId, DriverId } from './body-id';
import { finitePose } from './body-frame';
import { BodyTwist, bodyRowQuadratic, GroupTwists } from './body-row-quadratic';
import {
  bodyRowGradient,
  bodyRowValue,
  GroupPoses,
  BodyRowGradient,
  pairGeometry,
} from './body-constraint-rows';
import { CompiledBodyPartition, BodyConstraintRow } from './compiled-body-system';
import { bodyPositionScale } from './body-position-scale';
import { factorBodyRows, solveBodyRows, RowFactorization } from './body-linear-algebra';

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
  const solve = (rhs: number[], uncertainty: readonly number[] = []) => {
    const scaled = rhs.map((value, i) => value * scaling.rows[i]);
    const answer = solveBodyRows(factor, scaled);
    if (
      !answer ||
      !rateRowsConsistent(
        matrix,
        answer,
        scaled,
        projectedRowRoundoff(
          factor,
          uncertainty.map((value, i) => value * scaling.rows[i])
        )
      )
    )
      return undefined;
    return answer.map((value, j) => value * scaling.columns[j]);
  };
  const velocityInput = bodyRatePrescription(partition, gradients, commands, boundary, 'velocity');
  const velocity = solve(velocityInput.rhs, velocityInput.roundoff);
  if (!velocity) return { ok: false, reason: 'velocity-inconsistent' };
  const twists = new Map(partition.boundary.map((id) => [id, boundary.get(id)!.velocity]));
  partition.unknowns.forEach((id, i) =>
    twists.set(id, { vx: velocity[3 * i], vy: velocity[3 * i + 1], omega: velocity[3 * i + 2] })
  );
  const velocityRoundoff =
    128 * Number.EPSILON * Math.hypot(...velocity.map((value, i) => value / scaling.columns[i]));
  const errors = new Map(
    partition.unknowns.map((id, i) => [
      id,
      {
        linear: Math.SQRT2 * velocityRoundoff * scaling.columns[3 * i],
        angular: velocityRoundoff * scaling.columns[3 * i + 2],
      },
    ])
  );
  // Gamma follows the complete velocity, including a moving boundary. Its acceleration
  // enters through the boundary columns separately; differentiating only q loses both terms.
  const accelerationInput = bodyRatePrescription(
    partition,
    gradients,
    commands,
    boundary,
    'acceleration'
  );
  const acceleration = solve(
    partition.rows.map((row, i) => accelerationInput.rhs[i] - bodyRowQuadratic(row, poses, twists)),
    partition.rows.map(
      (row, i) => quadraticRoundoff(row, poses, twists, errors) + accelerationInput.roundoff[i]
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

/** A boundary-only row may cancel a command in algebra but not in floating point.
 * Keep the operands' arithmetic scale before subtracting them into a near-zero RHS.
 */
export function bodyRatePrescription(
  partition: CompiledBodyPartition,
  gradients: readonly BodyRowGradient[],
  commands: ReadonlyMap<DriverId, CommandMotion>,
  boundary: ReadonlyMap<BodyId, BodyMotion>,
  order: 'velocity' | 'acceleration'
) {
  const rhs: number[] = [],
    roundoff: number[] = [];
  for (const [i, row] of partition.rows.entries()) {
    let value = row.commandId ? commands.get(row.commandId)![order] : 0;
    let magnitude = Math.abs(value);
    for (const id of partition.boundary) {
      const coefficients = gradients[i].get(id);
      if (!coefficients) continue;
      const motion = boundary.get(id)!;
      const values =
        order === 'velocity'
          ? [motion.velocity.vx, motion.velocity.vy, motion.velocity.omega]
          : [motion.acceleration.ax, motion.acceleration.ay, motion.acceleration.alpha];
      for (let j = 0; j < 3; j++) {
        const term = coefficients[j] * values[j];
        value -= term;
        magnitude += Math.abs(term);
      }
    }
    rhs.push(value);
    roundoff.push(128 * Number.EPSILON * magnitude);
  }
  return { rhs, roundoff };
}

/** Absolute component uncertainty, in the same physical units as the twist. */
export interface TwistRoundoff {
  readonly linear: number;
  readonly angular: number;
}

/** A mathematically zero angular velocity can inherit QR round-off from translation.
 * Its Coriolis term must not make consistent redundant acceleration rows contradict.
 * Propagate only that arithmetic uncertainty through the actual row's quadratic terms;
 * a remote boundary or an absolute unit of acceleration supplies no tolerance.
 */
export function quadraticRoundoff(
  row: BodyConstraintRow,
  poses: GroupPoses,
  twists: GroupTwists,
  errors: ReadonlyMap<BodyId, TwistRoundoff>
): number {
  if (row.kind === 'angle') return 0;
  const { a, b, d } = pairGeometry(row.pair, poses);
  const va = twists.get(row.pair.groupA)!,
    vb = twists.get(row.pair.groupB)!;
  const ea = errors.get(row.pair.groupA),
    eb = errors.get(row.pair.groupB);
  const da = ea?.angular ?? 0,
    db = eb?.angular ?? 0;
  const wa = Math.abs(va.omega),
    wb = Math.abs(vb.omega);
  const ra = Math.hypot(a.x, a.y),
    rb = Math.hypot(b.x, b.y);
  const squareA = 2 * wa * da + da * da,
    squareB = 2 * wb * db + db * db;
  let error = ra * squareA + rb * squareB;
  let magnitude = ra * wa * wa + rb * wb * wb;
  if (row.kind === 'lateral' || row.kind === 'travel') {
    const speed = Math.hypot(
      vb.vx - va.vx - b.y * vb.omega + a.y * va.omega,
      vb.vy - va.vy + b.x * vb.omega - a.x * va.omega
    );
    const speedError = (ea?.linear ?? 0) + (eb?.linear ?? 0) + ra * da + rb * db;
    const span = Math.hypot(d.x, d.y);
    error += 2 * (da * speed + wa * speedError + da * speedError) + squareA * span;
    magnitude += 2 * wa * speed + wa * wa * span;
  }
  return error + 128 * Number.EPSILON * magnitude;
}

/** Least squares projects RHS noise into other rows. Bound that same residual projection,
 * rather than giving an unrelated row the largest uncertainty anywhere in the mechanism.
 */
export function projectedRowRoundoff(
  factor: RowFactorization,
  uncertainty: readonly number[]
): number[] {
  const result = new Array<number>(factor.height).fill(0);
  for (const [column, error] of uncertainty.entries()) {
    if (error === 0) continue;
    const vector = new Array<number>(factor.height).fill(0);
    vector[column] = error;
    const reflect = ({ start, vector: axis }: (typeof factor.reflectors)[number]) => {
      const projection = axis.reduce((sum, value, i) => sum + value * vector[start + i], 0);
      for (let i = 0; i < axis.length; i++) vector[start + i] -= 2 * axis[i] * projection;
    };
    for (const reflector of factor.reflectors) reflect(reflector);
    vector.fill(0, 0, factor.rank);
    for (let i = factor.reflectors.length - 1; i >= 0; i--) reflect(factor.reflectors[i]);
    for (let i = 0; i < result.length; i++) result[i] += Math.abs(vector[i]);
  }
  return result;
}

/** A least-squares fit must satisfy every row, including a redundant row with tiny rates. */
export function rateRowsConsistent(
  matrix: readonly number[][],
  answer: readonly number[],
  rhs: readonly number[],
  uncertainty: readonly number[] = []
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
      Number.isFinite(uncertainty[i] ?? 0) &&
      Math.abs(residual) <= 1e-9 * magnitude + roundoff + (uncertainty[i] ?? 0)
    );
  });
}
