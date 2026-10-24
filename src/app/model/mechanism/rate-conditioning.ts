/** A rank test in column-normalized units, before differentiating a pose. */
export function regularRateMatrix(rows: number[][]): boolean {
  const width = rows[0]?.length ?? 0;
  if (width === 0) return true;
  if (rows.length < width) return false;
  const basis: number[][] = [];
  for (let column = 0; column < width; column++) {
    const raw = rows.map((row) => row[column]);
    const size = Math.hypot(...raw);
    if (!Number.isFinite(size) || size === 0) return false;
    const remainder = raw.map((value) => value / size);
    for (let pass = 0; pass < 2; pass++) {
      for (const vector of basis) {
        const along = vector.reduce((sum, value, index) => sum + value * remainder[index], 0);
        remainder.forEach((_, index) => (remainder[index] -= along * vector[index]));
      }
    }
    const remaining = Math.hypot(...remainder);
    // A true change point has no unique differentiated solution. The solved
    // trajectory can supply a branch limit instead; a round-off pivot cannot.
    if (remaining < 1e-8) return false;
    basis.push(remainder.map((value) => value / remaining));
  }
  return true;
}
