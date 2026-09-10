import { bodyRowsJacobian, bodyRowValue, CommandValues, GroupPoses } from './body-constraint-rows';
import { CompiledBodyPartition } from './compiled-body-system';
import { bodyNullSpace, factorBodyRows, fitBodyRows } from './body-linear-algebra';
import { bodyPositionScale } from './body-position-scale';
import { BodyTwist, bodyRowQuadratic } from './body-row-quadratic';
import { BodyId } from './body-id';

export interface BodyMobility {
  readonly status:
    'regular' | 'second-order' | 'isolated' | 'singular' | 'inconsistent' | 'invalid';
  readonly infinitesimal: number;
  readonly dof: number | undefined;
  readonly rank: number;
  readonly obstruction: number;
}

/** Rank counts tangent directions; quadratic compatibility rejects a false freedom at tangency. */
export function bodyMobility(
  partition: CompiledBodyPartition,
  poses: GroupPoses,
  commands: CommandValues = new Map()
): BodyMobility {
  const passive = {
    ...partition,
    rows: partition.rows.filter((row) => row.commandId === undefined),
  };
  const scale = bodyPositionScale(passive, poses, commands);
  const width = partition.unknowns.length * 3;
  const matrix = bodyRowsJacobian(passive.rows, poses, partition.unknowns).map((row, i) =>
    row.map((value, j) => value * scale.rows[i] * scale.columns[j])
  );
  const factor = factorBodyRows(matrix, width);
  if (!factor)
    return {
      status: 'invalid',
      infinitesimal: width,
      dof: undefined,
      rank: 0,
      obstruction: Infinity,
    };
  const infinitesimal = width - factor.rank;
  const base = { infinitesimal, rank: factor.rank, obstruction: 0 };
  const residual = Math.max(
    0,
    ...passive.rows.map((row, i) => Math.abs(bodyRowValue(row, poses) * scale.rows[i]))
  );
  if (!Number.isFinite(residual) || residual > 1e-9)
    return { ...base, status: 'inconsistent', dof: undefined };
  if (infinitesimal === 0 || factor.rank === passive.rows.length)
    return { ...base, status: 'regular', dof: infinitesimal };
  const basis = bodyNullSpace(factor);
  const directions = [...basis];
  // Cross terms can obstruct a combination even when individual basis directions survive.
  for (let i = 0; i < basis.length; i++)
    for (let j = i + 1; j < basis.length; j++)
      directions.push(basis[i].map((value, k) => (value + basis[j][k]) / Math.SQRT2));
  let obstruction = 0;
  for (const direction of directions) {
    const twists = new Map<BodyId, BodyTwist>(
      partition.boundary.map((id) => [id, { vx: 0, vy: 0, omega: 0 }])
    );
    partition.unknowns.forEach((id, i) =>
      twists.set(id, {
        vx: direction[3 * i] * scale.columns[3 * i],
        vy: direction[3 * i + 1] * scale.columns[3 * i + 1],
        omega: direction[3 * i + 2],
      })
    );
    const rhs = passive.rows.map((row, i) => -bodyRowQuadratic(row, poses, twists) * scale.rows[i]);
    const acceleration = fitBodyRows(factor, rhs);
    if (!acceleration) return { ...base, status: 'invalid', dof: undefined, obstruction: Infinity };
    const error = matrix.map((row, i) =>
      row.reduce((sum, value, j) => sum + value * acceleration[j], -rhs[i])
    );
    obstruction = Math.max(obstruction, Math.hypot(...error) / Math.max(1, Math.hypot(...rhs)));
  }
  if (obstruction <= 1e-8)
    return { ...base, status: 'second-order', dof: infinitesimal, obstruction };
  // Several tangent directions may have compatible mixtures; do not infer isolation from a basis alone.
  return {
    ...base,
    status: infinitesimal === 1 ? 'isolated' : 'singular',
    dof: infinitesimal === 1 ? 0 : undefined,
    obstruction,
  };
}
