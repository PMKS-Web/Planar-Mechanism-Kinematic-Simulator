import { BodyId } from './body-id';
import { GroupPoses, bodyRowsJacobian } from './body-constraint-rows';
import { CompiledBodyPartition } from './compiled-body-system';
import { bodyPositionScale } from './body-position-scale';
import { bodyNullSpace, factorBodyRows, fitBodyRows } from './body-linear-algebra';
import { finiteWrench, Wrench } from './joint-wrenches';
import { finitePose } from './body-frame';
import { evenestBodyRows } from './evenest-body-rows';

export type RowEffort =
  | { readonly ok: true; readonly value: number; readonly basis: 'unique' | 'evenest' }
  | { readonly ok: false; readonly reason: 'indeterminate' };
export type BodyEfforts =
  | { readonly ok: false; readonly reason: 'invalid' | 'unbalanced' }
  | {
      readonly ok: true;
      /** N for length rows, N·m for angular rows. No arbitrary pivot-basis split is exposed. */
      readonly efforts: ReadonlyMap<string, RowEffort>;
      readonly sharedSupport: boolean;
      readonly rank: number;
      readonly nullity: number;
      readonly freeEquilibriumDirections: number;
      readonly residual: number;
      readonly roundoffAllowance: number;
    };

/** Use one support policy for a whole cycle; an isolated toggle must not select an even split. */
export function solveBodyEfforts(
  partition: CompiledBodyPartition,
  poses: GroupPoses,
  required: ReadonlyMap<BodyId, Wrench>,
  supportPolicy: 'unique' | 'evenest' = 'unique',
  arithmeticScale: ReadonlyMap<BodyId, Wrench> = new Map()
): BodyEfforts {
  const ids = [...partition.unknowns, ...partition.boundary];
  if (
    new Set(ids).size !== ids.length ||
    ids.some((id) => !poses.has(id) || !finitePose(poses.get(id)!)) ||
    partition.rows.some(
      (row) => !ids.includes(row.pair.groupA) || !ids.includes(row.pair.groupB)
    ) ||
    new Set(partition.rows.map((row) => row.key)).size !== partition.rows.length ||
    partition.unknowns.some((id) => !required.has(id) || !finiteWrench(required.get(id)!)) ||
    [...arithmeticScale.values()].some(
      (wrench) =>
        !finiteWrench(wrench) || wrench.force.x < 0 || wrench.force.y < 0 || wrench.moment < 0
    )
  )
    return { ok: false, reason: 'invalid' };
  const scaling = bodyPositionScale(partition, poses);
  const jacobian = bodyRowsJacobian(partition.rows, poses, partition.unknowns);
  // Js = Dr J Dc, so Jsᵀ λs = Dc w and physical λ = Dr λs.
  const matrix = scaling.columns.map((column, j) =>
    jacobian.map((row, i) => row[j] * column * scaling.rows[i])
  );
  const rhs = partition.unknowns
    .flatMap((id) => {
      const wrench = required.get(id)!;
      return [wrench.force.x, wrench.force.y, wrench.moment];
    })
    .map((value, i) => value * scaling.columns[i]);
  const factor = factorBodyRows(matrix, partition.rows.length);
  const sharedSupport = supportPolicy === 'evenest';
  const answer = sharedSupport
    ? evenestBodyRows(matrix, rhs, partition.rows.length)
    : factor && fitBodyRows(factor, rhs);
  if (!factor || !answer) return { ok: false, reason: 'invalid' };
  const error = Math.hypot(
    ...matrix.map((row, i) => row.reduce((sum, value, j) => sum + value * answer[j], -rhs[i]))
  );
  const load = Math.hypot(...rhs);
  const residual = load === 0 ? error : error / load;
  const roundoffAllowance =
    128 *
    Number.EPSILON *
    Math.hypot(
      ...partition.unknowns
        .flatMap((id) => {
          const terms = arithmeticScale.get(id);
          return terms ? [terms.force.x, terms.force.y, terms.moment] : [0, 0, 0];
        })
        .map((value, i) => value * scaling.columns[i])
    );
  // Scale to the applied loads, not large canceling reactions that could conceal a failed balance.
  if (
    !Number.isFinite(residual) ||
    !Number.isFinite(roundoffAllowance) ||
    error > (sharedSupport ? 1e-3 : 1e-8) * load + roundoffAllowance
  )
    return { ok: false, reason: 'unbalanced' };
  const nullspace = bodyNullSpace(factor);
  const efforts = new Map<string, RowEffort>();
  for (const [i, row] of partition.rows.entries()) {
    const arbitrary = nullspace.some(
      (vector) => Math.abs(vector[i]) > 128 * Number.EPSILON * partition.rows.length
    );
    const value = answer[i] * scaling.rows[i];
    if (!Number.isFinite(value)) return { ok: false, reason: 'invalid' };
    // A condensed internal relationship is not an external support to share a load.
    const internal = row.pair.groupA === row.pair.groupB;
    efforts.set(
      row.key,
      arbitrary && (!sharedSupport || internal)
        ? { ok: false, reason: 'indeterminate' }
        : { ok: true, value, basis: sharedSupport ? 'evenest' : 'unique' }
    );
  }
  return {
    ok: true,
    efforts,
    sharedSupport,
    rank: factor.rank,
    nullity: partition.rows.length - factor.rank,
    freeEquilibriumDirections: matrix.length - factor.rank,
    residual,
    roundoffAllowance,
  };
}
