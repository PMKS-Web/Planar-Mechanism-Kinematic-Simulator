import { bodyNullSpace, factorBodyRows } from './body-linear-algebra';
import { evenestBodyRows } from './evenest-body-rows';
import { EditScalar } from './body-edit-scalar';
import { relaxBodyEdit } from './body-edit-relaxation';

/** Pointer goals may project onto holds; physical equations are still satisfied before publishing a pose. */
export function projectBodyEdit(
  seed: readonly number[],
  rowsAt: (values: readonly number[]) => readonly EditScalar[],
  angularColumns: readonly number[]
): readonly number[] | undefined {
  const hard = (values: readonly number[]) => rowsAt(values).slice(0, -2);
  let current = relaxBodyEdit(seed, hard, angularColumns);
  if (!current) return undefined;
  for (let round = 0; round < 60; round++) {
    const rows = rowsAt(current),
      goals = rows.slice(-2);
    const delta = tangentStep(rows, current.length);
    if (!delta) return undefined;
    if (Math.hypot(...delta) <= 1e-11) {
      const escape = escapeStationaryPoint(current, rows, rowsAt, hard, angularColumns);
      if (!escape) return current;
      current = escape;
      continue;
    }
    const limit = Math.min(
      1,
      0.2 / Math.max(0.2, ...angularColumns.map((column) => Math.abs(delta[column])))
    );
    const merit = Math.hypot(...goals.map((row) => row.value));
    let accepted: readonly number[] | undefined;
    for (let cut = 0; cut <= 14; cut++) {
      const proposed = current.map((v, i) => v + delta[i] * limit * 2 ** -cut);
      const next = relaxBodyEdit(proposed, hard, angularColumns);
      if (!next) continue;
      const nextRows = rowsAt(next),
        nextMerit = Math.hypot(...nextRows.slice(-2).map((row) => row.value));
      const nextDelta =
        nextMerit <= merit + 8 * Number.EPSILON * Math.max(1, merit)
          ? tangentStep(nextRows, current.length)
          : undefined;
      // Near a minimum, the squared improvement rounds away before its first derivative does.
      if (
        nextMerit < merit ||
        (nextDelta && Math.hypot(...nextDelta) < 0.5 * Math.hypot(...delta))
      ) {
        accepted = next;
        break;
      }
    }
    // A stalled search is not proof of a stationary constrained solution.
    if (!accepted) return undefined;
    current = accepted;
  }
  return undefined;
}
/** A radial target on the far side of a held circle has zero slope at a maximum, not at the nearest point. */
function escapeStationaryPoint(
  current: readonly number[],
  rows: readonly EditScalar[],
  rowsAt: (values: readonly number[]) => readonly EditScalar[],
  hard: (values: readonly number[]) => readonly EditScalar[],
  angularColumns: readonly number[]
): readonly number[] | undefined {
  const merit = Math.hypot(...rows.slice(-2).map((row) => row.value));
  if (merit <= 1e-11) return undefined;
  const factor = factorBodyRows(
    rows.slice(0, -2).map((row) => row.gradient),
    current.length
  );
  if (!factor) return undefined;
  for (const direction of orthogonalDirections(bodyNullSpace(factor)))
    for (const sign of [1, -1]) {
      const probe = current.map((v, i) => v + sign * 0.05 * direction[i]);
      const next = relaxBodyEdit(probe, hard, angularColumns);
      if (
        next &&
        Math.hypot(
          ...rowsAt(next)
            .slice(-2)
            .map((row) => row.value)
        ) <
          merit - 32 * Number.EPSILON * Math.max(1, merit)
      )
        return next;
    }
  return undefined;
}
function tangentStep(rows: readonly EditScalar[], width: number): number[] | undefined {
  const goals = rows.slice(-2);
  const factor = factorBodyRows(
    rows.slice(0, -2).map((row) => row.gradient),
    width
  );
  if (!factor) return undefined;
  const basis = orthogonalDirections(bodyNullSpace(factor));
  if (!basis.length) return Array(width).fill(0);
  const jacobian = goals.map((row) => basis.map((direction) => dot(row.gradient, direction)));
  const coefficients = evenestBodyRows(
    jacobian,
    goals.map((row) => -row.value),
    basis.length
  );
  return (
    coefficients &&
    Array.from({ length: width }, (_, i) =>
      coefficients.reduce((sum, v, j) => sum + v * basis[j][i], 0)
    )
  );
}
function dot(a: readonly number[], b: readonly number[]): number {
  return a.reduce((sum, v, i) => sum + v * b[i], 0);
}
function orthogonalDirections(directions: readonly (readonly number[])[]): number[][] {
  const result: number[][] = [];
  for (const direction of directions) {
    let v = [...direction];
    for (let pass = 0; pass < 2; pass++)
      for (const q of result) {
        const projection = dot(v, q);
        v = v.map((value, i) => value - projection * q[i]);
      }
    const norm = Math.hypot(...v);
    if (norm > 1e-10) result.push(v.map((value) => value / norm));
  }
  return result;
}
