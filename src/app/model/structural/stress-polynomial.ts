/** Low-degree power polynomials in dimensionless interval coordinates. */
export type Polynomial = readonly number[];
export function value(p: Polynomial, x: number): number {
  return p.reduceRight((result, coefficient) => result * x + coefficient, 0);
}
export function derivative(p: Polynomial): number[] {
  return p.slice(1).map((c, i) => c * (i + 1));
}
export function add(a: Polynomial, b: Polynomial): number[] {
  return Array.from({ length: Math.max(a.length, b.length) }, (_, i) => (a[i] ?? 0) + (b[i] ?? 0));
}
export function multiply(a: Polynomial, b: Polynomial): number[] {
  const result = Array(a.length + b.length - 1).fill(0) as number[];
  a.forEach((c, i) => b.forEach((d, j) => (result[i + j] += c * d)));
  return result;
}
export function scale(p: Polynomial, factor: number): number[] {
  return p.map((c) => c * factor);
}
export function choose(n: number, k: number): number {
  let result = 1;
  for (let i = 1; i <= k; i++) result *= (n + 1 - i) / i;
  return result;
}
/** p(offset+span*u), for u in [0,1]. */
export function composeAffine(p: Polynomial, offset: number, span: number): number[] {
  return p.map((_, k) =>
    p.reduce(
      (sum, c, i) => (i < k ? sum : sum + c * choose(i, k) * offset ** (i - k) * span ** k),
      0
    )
  );
}

/** Derivative isolation partitions into monotone intervals, retaining repeated real roots. */
export function realRoots(p: Polynomial, low: number, high: number): number[] {
  const coefficients = [...p];
  while (coefficients.length && coefficients[coefficients.length - 1] === 0) coefficients.pop();
  if (coefficients.length <= 1) return [];
  const norm = Math.max(...coefficients.map(Math.abs));
  if (!Number.isFinite(norm)) throw new Error('Nonfinite polynomial.');
  const normalized = coefficients.map((c) => c / norm);
  if (normalized.length === 2) {
    const root = -normalized[0] / normalized[1];
    return root >= low && root <= high ? [root] : [];
  }
  const cuts = [
    low,
    ...realRoots(derivative(normalized), low, high).filter((x) => x > low && x < high),
    high,
  ];
  const roots: number[] = [];
  const residualTolerance = 2e-13 * normalized.reduce((sum, c) => sum + Math.abs(c), 0);
  for (const cut of cuts)
    if (Math.abs(value(normalized, cut)) <= residualTolerance) roots.push(cut);
  for (let i = 0; i + 1 < cuts.length; i++) {
    let a = cuts[i],
      b = cuts[i + 1],
      fa = value(normalized, a);
    const fb = value(normalized, b);
    if (fa === 0 || fb === 0 || Math.sign(fa) === Math.sign(fb)) continue;
    for (let iteration = 0; iteration < 60; iteration++) {
      const mid = (a + b) / 2,
        fm = value(normalized, mid);
      if (fm === 0) {
        a = b = mid;
        break;
      }
      if (Math.sign(fm) === Math.sign(fa)) {
        a = mid;
        fa = fm;
      } else b = mid;
    }
    roots.push((a + b) / 2);
  }
  return roots.sort((a, b) => a - b).filter((x, i, all) => i === 0 || x - all[i - 1] > 1e-12);
}
