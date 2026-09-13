import { evenestBodyRows } from './evenest-body-rows';
import { EditScalar } from './body-edit-scalar';

/** Underdetermined sketches use the smallest normalized correction, never an arbitrary QR free-column choice. */
export function relaxBodyEdit(
  seed: readonly number[],
  rowsAt: (values: readonly number[]) => readonly EditScalar[],
  angularColumns: readonly number[]
): readonly number[] | undefined {
  let values = [...seed];
  for (let round = 0; round <= 60; round++) {
    const rows = rowsAt(values);
    if (rows.some((row) => !Number.isFinite(row.value) || !Number.isFinite(row.roundoff)))
      return undefined;
    const withinRoundoff = () =>
      rows.every((row) => Math.abs(row.value) <= 4 * Number.EPSILON + row.roundoff);
    if (Math.max(0, ...rows.map((row) => Math.abs(row.value))) <= 4 * Number.EPSILON) return values;
    if (round === 60) return withinRoundoff() ? values : undefined;
    const delta = evenestBodyRows(
      rows.map((row) => row.gradient),
      rows.map((row) => -row.value),
      values.length
    );
    if (!delta) return undefined;
    const limit = Math.min(
      1,
      0.2 / Math.max(0.2, ...angularColumns.map((column) => Math.abs(delta[column])))
    );
    const merit = Math.hypot(...rows.map((row) => row.value));
    let improved = false;
    for (let cut = 0; cut <= 14; cut++) {
      const next = values.map((v, i) => v + delta[i] * limit * 2 ** -cut);
      if (!next.every(Number.isFinite)) continue;
      const nextRows = rowsAt(next);
      if (Math.hypot(...nextRows.map((row) => row.value)) < merit) {
        values = next;
        improved = true;
        break;
      }
    }
    // Keep refining small drawings to the original precision; only a stalled correction
    // may use its own arithmetic bound. A distant row cannot excuse another row's error.
    if (!improved) return withinRoundoff() ? values : undefined;
  }
  return undefined;
}
