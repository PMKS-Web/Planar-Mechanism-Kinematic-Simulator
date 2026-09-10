import { bodyNullSpace, factorBodyRows, solveBodyRows } from './body-linear-algebra';

function factor(rows: number[][], width = rows[0]?.length ?? 0) {
  const value = factorBodyRows(rows, width);
  if (!value) throw new Error('Invalid test matrix');
  return value;
}

describe('native rectangular linear algebra', () => {
  it('solves independent and redundant rows without requiring a square matrix', () => {
    const rows = [
      [1, 2, -1],
      [3, -2, 4],
      [2, 1, 1],
      [4, 0, 3],
      [6, 3, 3],
    ];
    const expected = [0.7, -1.3, 2.1];
    const rhs = rows.map((row) => row.reduce((sum, v, i) => sum + v * expected[i], 0));
    for (const reverse of [false, true]) {
      const f = factor(reverse ? [...rows].reverse() : rows);
      const actual = solveBodyRows(f, reverse ? [...rhs].reverse() : rhs)!;
      expect(f.rank).toBe(3);
      actual.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 12));
      expect(bodyNullSpace(f)).toEqual([]);
    }
  });

  it('preserves a small independent direction that normal equations would lose', () => {
    const rows = [
      [1, 1],
      [1, 1 + 1e-7],
      [0, 1e-7],
    ];
    const f = factor(rows);
    expect(f.rank).toBe(2);
    const answer = solveBodyRows(f, [1, 1 - 2e-7, -2e-7])!;
    expect(answer[0]).toBeCloseTo(3, 7);
    expect(answer[1]).toBeCloseTo(-2, 7);
  });

  it('reports least-squares output without claiming an inconsistent right side is solved', () => {
    const rows = [[1], [1]],
      f = factor(rows);
    expect(solveBodyRows(f, [1, 3])![0]).toBeCloseTo(2, 12);
    const residual = rows.map((row, i) => row[0] * 2 - [1, 3][i]);
    expect(residual).toEqual([1, -1]);
  });

  it('returns the complete nullspace of underdetermined and redundant rows in original column order', () => {
    for (const rows of [
      [
        [1, 2, 4, 0],
        [2, 4, 8, 0],
      ],
      [[0, 0, 0, 0]],
      [],
    ]) {
      const f = factor(rows, 4),
        basis = bodyNullSpace(f);
      expect(basis.length).toBe(4 - f.rank);
      for (const vector of basis) {
        expect(Math.hypot(...vector)).toBeCloseTo(1, 12);
        for (const row of rows)
          expect(row.reduce((sum, v, i) => sum + v * vector[i], 0)).toBeCloseTo(0, 12);
      }
      expect(
        solveBodyRows(
          f,
          rows.map(() => 0)
        )
      ).toBeUndefined();
    }
  });

  it('is rank invariant under uniform rescaling and refuses malformed arithmetic', () => {
    for (const scale of [1e-15, 1, 1e15]) {
      const f = factor(
        [
          [1, 2],
          [3, 4],
        ].map((row) => row.map((v) => v * scale))
      );
      expect(f.rank).toBe(2);
      const answer = solveBodyRows(f, [5 * scale, 11 * scale])!;
      expect(answer[0]).toBeCloseTo(1, 12);
      expect(answer[1]).toBeCloseTo(2, 12);
    }
    expect(factorBodyRows([[NaN]], 1)).toBeUndefined();
    expect(factorBodyRows([[1, 2]], 1)).toBeUndefined();
    expect(solveBodyRows(factor([[1]]), [Infinity])).toBeUndefined();
  });
});
