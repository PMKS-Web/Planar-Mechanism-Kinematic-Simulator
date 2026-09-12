import {
  add,
  choose,
  composeAffine,
  derivative,
  multiply,
  realRoots,
  scale,
  value,
  Polynomial,
} from './stress-polynomial';

/** sigma=a(x)+b(x)t, tau=d(x)(1-t²), t=y/c; all stresses normalized before squaring. */
export interface StressField {
  readonly a: Polynomial;
  readonly b: Polynomial;
  readonly d: Polynomial;
}
export interface BoundedMaximum {
  readonly x: number;
  readonly t: number;
  readonly squared: number;
  readonly upperSquared: number;
  readonly subdivisions: number;
}
export const STRESS_SEARCH = Object.freeze({ relativeSquaredGap: 1e-10, maxSubdivisions: 20000 });

export function sectionCandidates(a: number, b: number, d: number): number[] {
  const norm = Math.max(Math.abs(a), Math.abs(b), Math.abs(d));
  if (norm === 0) return [-1, 0, 1];
  a /= norm;
  b /= norm;
  d /= norm;
  return [-1, 0, 1, ...realRoots([a * b, b * b - 6 * d * d, 0, 6 * d * d], -1, 1)];
}
export function squaredStress(field: StressField, x: number, t: number): number {
  return (
    (value(field.a, x) + value(field.b, x) * t) ** 2 + 3 * (value(field.d, x) * (1 - t * t)) ** 2
  );
}
function fixedDepth(field: StressField, t: number): number[] {
  const normal = add(field.a, scale(field.b, t));
  return add(multiply(normal, normal), scale(multiply(field.d, field.d), 3 * (1 - t * t) ** 2));
}

/** Power coefficients f(x,t), rows x, columns t. */
function powerSurface(field: StressField): number[][] {
  const aa = multiply(field.a, field.a),
    ab = multiply(field.a, field.b),
    bb = multiply(field.b, field.b),
    dd = multiply(field.d, field.d);
  const degree = Math.max(aa.length, ab.length, bb.length, dd.length);
  return Array.from({ length: degree }, (_, i) => [
    (aa[i] ?? 0) + 3 * (dd[i] ?? 0),
    2 * (ab[i] ?? 0),
    (bb[i] ?? 0) - 6 * (dd[i] ?? 0),
    0,
    3 * (dd[i] ?? 0),
  ]);
}
/** Convert t=-1+2v, then power -> tensor Bernstein on the unit square. */
function bernstein(surface: number[][]): number[][] {
  const power = surface.map((row) => composeAffine(row, -1, 2));
  const nx = power.length - 1,
    nt = power[0].length - 1;
  return power.map((row, i) =>
    row.map((_, j) => {
      let sum = 0;
      for (let k = 0; k <= i; k++)
        for (let l = 0; l <= j; l++)
          sum += (((power[k][l] * choose(i, k)) / choose(nx, k)) * choose(j, l)) / choose(nt, l);
      return sum;
    })
  );
}
function splitCurve(curve: readonly number[]): [number[], number[]] {
  const left = [curve[0]],
    right = [curve[curve.length - 1]];
  let row = [...curve];
  while (row.length > 1) {
    row = row.slice(1).map((c, i) => (row[i] + c) / 2);
    left.push(row[0]);
    right.unshift(row[row.length - 1]);
  }
  return [left, right];
}
function splitSurface(net: number[][], alongX: boolean): [number[][], number[][]] {
  if (!alongX) {
    const split = net.map(splitCurve);
    return [split.map((row) => row[0]), split.map((row) => row[1])];
  }
  const columns = net[0].map((_, j) => splitCurve(net.map((row) => row[j])));
  return [
    net.map((row, i) => row.map((_, j) => columns[j][0][i])),
    net.map((row, i) => row.map((_, j) => columns[j][1][i])),
  ];
}
interface Box {
  net: number[][];
  x0: number;
  x1: number;
  t0: number;
  t1: number;
  upper: number;
}

/** Adaptive global bound, never a uniform sampling grid. Throws rather than returning an unbounded maximum. */
export function maximizeStress(field: StressField): BoundedMaximum {
  const net = bernstein(powerSurface(field));
  if (!net.flat().every(Number.isFinite)) throw new Error('Stress bound overflow.');
  // Conservative roundoff allowance, relative to the original control net, retained through subdivision.
  const padding = 2e-12 * Math.max(...net.flat().map(Math.abs), 1e-30);
  const bound = (net: number[][]) => Math.max(...net.flat()) + padding;
  let best = { x: 0, t: 0, squared: -1 };
  const consider = (x: number, t: number) => {
    const squared = squaredStress(field, x, t);
    if (squared > best.squared) best = { x, t, squared };
  };
  const atX = (x: number) =>
    sectionCandidates(value(field.a, x), value(field.b, x), value(field.d, x)).forEach((t) =>
      consider(x, t)
    );
  [0, 0.5, 1].forEach(atX);
  // Boundary roots and neutral-axis roots provide exact interval candidates before subdivision.
  for (const t of [-1, 0, 1])
    for (const x of realRoots(derivative(fixedDepth(field, t)), 0, 1)) consider(x, t);
  const polish = () => {
    for (let i = 0; i < 12; i++) {
      const before = best.squared;
      for (const x of realRoots(derivative(fixedDepth(field, best.t)), 0, 1)) consider(x, best.t);
      atX(best.x);
      if (best.squared === before) break;
    }
  };
  polish();
  const boxes: Box[] = [{ net, x0: 0, x1: 1, t0: -1, t1: 1, upper: bound(net) }];
  let subdivisions = 0;
  while (boxes.length) {
    let index = 0;
    for (let i = 1; i < boxes.length; i++) if (boxes[i].upper > boxes[index].upper) index = i;
    const box = boxes[index];
    const gap = STRESS_SEARCH.relativeSquaredGap * Math.max(best.squared, 1e-24) + 2 * padding;
    if (box.upper - best.squared <= gap)
      return { ...best, upperSquared: Math.max(best.squared, box.upper), subdivisions };
    if (++subdivisions > STRESS_SEARCH.maxSubdivisions)
      throw new Error('Whole-member stress bounds did not converge.');
    boxes.splice(index, 1);
    const alongX = box.x1 - box.x0 >= (box.t1 - box.t0) / 2;
    const halves = splitSurface(box.net, alongX);
    const midX = (box.x0 + box.x1) / 2,
      midT = (box.t0 + box.t1) / 2;
    atX(midX);
    polish();
    for (let half = 0; half < 2; half++) {
      const child: Box = {
        net: halves[half],
        x0: alongX && half === 1 ? midX : box.x0,
        x1: alongX && half === 0 ? midX : box.x1,
        t0: !alongX && half === 1 ? midT : box.t0,
        t1: !alongX && half === 0 ? midT : box.t1,
        upper: bound(halves[half]),
      };
      consider((child.x0 + child.x1) / 2, (child.t0 + child.t1) / 2);
      // Retain the box until its upper bound is dominated; no unreported sampled gap.
      if (child.upper > best.squared) boxes.push(child);
    }
  }
  return { ...best, upperSquared: best.squared, subdivisions };
}
