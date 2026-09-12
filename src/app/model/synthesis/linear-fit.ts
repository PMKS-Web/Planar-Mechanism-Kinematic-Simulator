/** Small Householder QR fit: rank failure is an invalid trial, never a regularized fake geometry. */
export function linearFit(rows: readonly number[][], rhs: readonly number[]): number[] | undefined {
  const a = rows.map((row) => [...row]),
    y = [...rhs],
    n = a[0]?.length ?? 0;
  if (!n || a.length < n || a.length !== y.length) return undefined;
  for (let k = 0; k < n; k++) {
    let norm = 0;
    for (let i = k; i < a.length; i++) norm = Math.hypot(norm, a[i][k]);
    if (!Number.isFinite(norm) || norm < 1e-9) return undefined;
    const alpha = a[k][k] >= 0 ? -norm : norm;
    const v = a.slice(k).map((row) => row[k]);
    v[0] -= alpha;
    const vv = v.reduce((sum, value) => sum + value * value, 0);
    for (let j = k; j < n; j++) {
      let dot = 0;
      for (let i = k; i < a.length; i++) dot += v[i - k] * a[i][j];
      for (let i = k; i < a.length; i++) a[i][j] -= (2 * v[i - k] * dot) / vv;
    }
    let dot = 0;
    for (let i = k; i < a.length; i++) dot += v[i - k] * y[i];
    for (let i = k; i < a.length; i++) y[i] -= (2 * v[i - k] * dot) / vv;
  }
  const x = Array(n).fill(0) as number[];
  for (let i = n - 1; i >= 0; i--) {
    let value = y[i];
    for (let j = i + 1; j < n; j++) value -= a[i][j] * x[j];
    x[i] = value / a[i][i];
  }
  return x.every(Number.isFinite) ? x : undefined;
}
