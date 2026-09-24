/** Notation shared by the worksheet pages. Names are escaped before entering TeX. */
export function texName(value: string): string {
  const escapes: Record<string, string> = {
    '\\': '\\backslash',
    '{': '\\{',
    '}': '\\}',
    _: '\\_',
    $: '\\$',
    '&': '\\&',
    '#': '\\#',
    '%': '\\%',
    '~': '\\sim',
    '^': '\\hat{}',
  };
  return value.replace(/[\\{}_$&#%~^]/g, (char) => escapes[char]);
}

export function texNumber(value: number): string {
  if (!Number.isFinite(value)) return '\\text{unavailable}';
  if (Math.abs(value) < 1e-10) return '0';
  const [mantissa, exponent] = Number(value.toPrecision(5)).toString().split('e');
  return exponent ? `${mantissa}\\times10^{${Number(exponent)}}` : mantissa;
}

export const vector = (symbol: string, subscript: string) => `\\vec{${symbol}}_{${subscript}}`;
export const column = (values: (number | string)[]) =>
  `\\begin{bmatrix}${values.map((v) => (typeof v === 'number' ? texNumber(v) : v)).join('\\\\')}\\end{bmatrix}`;
export const signedSum = (terms: { coefficient: number; symbol: string }[]) =>
  terms
    .filter((t) => Math.abs(t.coefficient) > 1e-12)
    .map(
      (t, i) =>
        `${t.coefficient < 0 ? '-' : i ? '+' : ''}${Math.abs(t.coefficient) === 1 ? '' : texNumber(Math.abs(t.coefficient)) + '\\,'}${t.symbol}`
    )
    .join(' ') || '0';

export function numericEquation(row: number[], x: number[], known: number, inertia: number) {
  return `${signedSum(row.map((a, i) => ({ coefficient: a, symbol: `(${texNumber(x[i])})` })))} + (${texNumber(known)}) = ${texNumber(inertia)}`;
}
