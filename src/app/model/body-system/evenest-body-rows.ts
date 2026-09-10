import { factorBodyRows, solveBodyRows } from './body-linear-algebra';

/** Regularization chooses a stated support split; it does not prove a unique physical reaction. */
export function evenestBodyRows(
  matrix: readonly (readonly number[])[],
  rhs: readonly number[],
  width: number
): number[] | undefined {
  const ridgeRoot = 1e-4;
  // The augmented QR avoids squaring the condition number in normal equations.
  const augmented = [
    ...matrix,
    ...Array.from({ length: width }, (_, i) =>
      Array.from({ length: width }, (_, j) => (i === j ? ridgeRoot : 0))
    ),
  ];
  const factor = factorBodyRows(augmented, width, 1e-12);
  if (!factor || rhs.length !== matrix.length) return undefined;
  const solve = (target: readonly number[]) =>
    solveBodyRows(factor, [...target, ...Array(width).fill(0)]);
  const initial = solve(rhs);
  if (!initial) return undefined;
  let answer: number[] = initial;
  // Match the established support policy's three refinements against the unregularized equations.
  for (let pass = 0; pass < 3; pass++) {
    const current = answer;
    const leftover = matrix.map((row, i) =>
      row.reduce((sum, value, j) => sum - value * current[j], rhs[i])
    );
    const correction = solve(leftover);
    if (!correction) return undefined;
    answer = current.map((value, i) => value + correction[i]);
  }
  return answer.every(Number.isFinite) ? answer : undefined;
}
