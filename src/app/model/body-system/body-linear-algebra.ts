export interface RowFactorization {
  readonly width: number;
  readonly height: number;
  readonly rank: number;
  readonly permutation: readonly number[];
  readonly triangular: readonly (readonly number[])[];
  readonly reflectors: readonly { readonly start: number; readonly vector: readonly number[] }[];
}

/** Pivoted Householder QR avoids squaring the condition number at a mechanism toggle. */
export function factorBodyRows(
  rows: readonly (readonly number[])[],
  width: number,
  relativeTolerance = 1e-10
): RowFactorization | undefined {
  if (
    !Number.isInteger(width) ||
    width < 0 ||
    !Number.isFinite(relativeTolerance) ||
    relativeTolerance <= 0 ||
    rows.some((row) => row.length !== width || row.some((value) => !Number.isFinite(value)))
  )
    return undefined;
  const matrix = rows.map((row) => [...row]);
  const height = rows.length;
  const permutation = Array.from({ length: width }, (_, i) => i);
  const reflectors: { start: number; vector: number[] }[] = [];
  const columnNorm = (column: number, start: number) => {
    let norm = 0;
    for (let i = start; i < height; i++) norm = Math.hypot(norm, matrix[i][column]);
    return norm;
  };
  const largest = Math.max(0, ...permutation.map((i) => columnNorm(i, 0)));
  if (!Number.isFinite(largest)) return undefined;
  const threshold = largest * relativeTolerance;
  let rank = 0;
  for (let k = 0; k < Math.min(width, height); k++) {
    let pivot = k,
      norm = columnNorm(k, k);
    for (let column = k + 1; column < width; column++) {
      const candidate = columnNorm(column, k);
      if (candidate > norm) {
        pivot = column;
        norm = candidate;
      }
    }
    if (norm <= threshold || norm === 0) break;
    for (const row of matrix) [row[k], row[pivot]] = [row[pivot], row[k]];
    [permutation[k], permutation[pivot]] = [permutation[pivot], permutation[k]];
    const sign = matrix[k][k] >= 0 ? 1 : -1;
    const vector = matrix.slice(k).map((row) => row[k] / norm);
    vector[0] += sign;
    const length = Math.hypot(...vector);
    for (let i = 0; i < vector.length; i++) vector[i] /= length;
    for (let column = k; column < width; column++) {
      let projection = 0;
      for (let i = k; i < height; i++) projection += vector[i - k] * matrix[i][column];
      for (let i = k; i < height; i++) matrix[i][column] -= 2 * vector[i - k] * projection;
    }
    matrix[k][k] = -sign * norm;
    for (let i = k + 1; i < height; i++) matrix[i][k] = 0;
    reflectors.push({ start: k, vector });
    rank++;
  }
  if (matrix.some((row) => row.some((value) => !Number.isFinite(value)))) return undefined;
  return { width, height, rank, permutation, triangular: matrix, reflectors };
}

/** A least-squares answer alone does not prove consistent constraints; callers check residuals. */
export function solveBodyRows(
  factor: RowFactorization,
  rhs: readonly number[]
): number[] | undefined {
  if (factor.rank !== factor.width || rhs.length !== factor.height || !rhs.every(Number.isFinite))
    return undefined;
  const transformed = [...rhs];
  for (const { start, vector } of factor.reflectors) {
    const projection = vector.reduce((sum, value, i) => sum + value * transformed[start + i], 0);
    for (let i = 0; i < vector.length; i++) transformed[start + i] -= 2 * vector[i] * projection;
  }
  const x = new Array<number>(factor.width).fill(0);
  for (let i = factor.width - 1; i >= 0; i--) {
    let value = transformed[i];
    for (let j = i + 1; j < factor.width; j++) value -= factor.triangular[i][j] * x[j];
    x[i] = value / factor.triangular[i][i];
  }
  if (!x.every(Number.isFinite)) return undefined;
  return unpermute(factor, x);
}

export function bodyNullSpace(factor: RowFactorization): number[][] {
  const basis: number[][] = [];
  for (let free = factor.rank; free < factor.width; free++) {
    const vector = new Array<number>(factor.width).fill(0);
    vector[free] = 1;
    for (let i = factor.rank - 1; i >= 0; i--) {
      let sum = 0;
      for (let j = i + 1; j < factor.width; j++) sum += factor.triangular[i][j] * vector[j];
      vector[i] = -sum / factor.triangular[i][i];
    }
    const length = Math.hypot(...vector);
    basis.push(
      unpermute(
        factor,
        vector.map((value) => value / length)
      )
    );
  }
  return basis;
}

function unpermute(factor: RowFactorization, vector: readonly number[]): number[] {
  const result = new Array<number>(factor.width);
  factor.permutation.forEach((original, pivoted) => {
    result[original] = vector[pivoted];
  });
  return result;
}
