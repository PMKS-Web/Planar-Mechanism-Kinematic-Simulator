import {
  CorrespondenceDiagnostics,
  CorrespondenceMode,
  FourBarParameters,
  PathPoint,
} from './path-types';

/** Progress is always increasing in [0,1], even when the physical crank turns clockwise. */
export const TIMING_GRID_FACTOR = 8;
export const TIMING_MIN_STEP = 0.05;
export const TIMING_MAX_STEP = 8;

const squared = (a: PathPoint, b: PathPoint) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

/**
 * Strict ordered assignment, not ordinary DTW's many-to-one steps. Sliding window minima
 * solve D(i,j)=distance(i,j)^2+min D(i-1,k) in O(N M). Both interval boundaries are pinned;
 * closed targets use an implicit endpoint at progress 1 without comparing a duplicate point.
 */
export function orderedTiming(
  target: readonly PathPoint[],
  trajectory: readonly PathPoint[],
  closed: boolean
): number[] {
  const n = target.length,
    m = trajectory.length - 1;
  const intervals = closed ? n : n - 1;
  if (
    n < 2 ||
    m < intervals ||
    ![...target, ...trajectory].every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
  )
    throw new Error(
      'Ordered timing needs finite points and at least one trajectory interval per target gap.'
    );
  const maxStep = Math.floor((TIMING_MAX_STEP * m) / intervals);
  let prior = new Float64Array(m + 1).fill(Infinity);
  prior[0] = squared(target[0], trajectory[0]);
  const parents = new Int32Array(n * (m + 1)).fill(-1);
  const deque = new Int32Array(m + 1);
  for (let i = 1; i < n; i++) {
    const row = new Float64Array(m + 1).fill(Infinity);
    let head = 0,
      tail = 0;
    for (let j = 1; j <= m; j++) {
      const k = j - 1;
      while (tail > head && prior[deque[tail - 1]] > prior[k]) tail--;
      deque[tail++] = k;
      while (tail > head && deque[head] < j - maxStep) head++;
      if (j < i || j > m - (intervals - i)) continue;
      const best = deque[head];
      row[j] = prior[best] + squared(target[i], trajectory[j]);
      parents[i * (m + 1) + j] = best;
    }
    prior = row;
  }
  let end = m;
  if (closed) {
    end = Math.max(n - 1, m - maxStep);
    for (let j = end + 1; j < m; j++) if (prior[j] < prior[end]) end = j;
  }
  if (!Number.isFinite(prior[end])) throw new Error('No strictly ordered correspondence.');
  const progress = Array<number>(n);
  for (let i = n - 1; i >= 0; i--) {
    progress[i] = end / m;
    end = parents[i * (m + 1) + end];
  }
  return progress;
}

/** Continuous coordinate descent between adjacent assigned states. Every accepted step lowers
 * geometric cost and obeys minimum/maximum gaps, including the virtual closed seam. */
export function refineTiming(
  target: readonly PathPoint[],
  initial: readonly number[],
  closed: boolean,
  pointAt: (progress: number) => PathPoint
): number[] {
  const progress = [...initial],
    intervals = closed ? target.length : target.length - 1;
  const minGap = TIMING_MIN_STEP / intervals,
    maxGap = TIMING_MAX_STEP / intervals;
  for (let pass = 0; pass < 2; pass++) {
    for (let step = 1; step < target.length - (closed ? 0 : 1); step++) {
      const i = pass ? target.length - (closed ? 0 : 1) - step : step;
      const prev = progress[i - 1],
        next = progress[i + 1] ?? 1;
      let lo = Math.max(prev + minGap, next - maxGap, progress[i] - 2 / intervals);
      let hi = Math.min(next - minGap, prev + maxGap, progress[i] + 2 / intervals);
      const original = progress[i];
      let best = original,
        bestCost = squared(pointAt(original), target[i]);
      for (let iteration = 0; iteration < 12; iteration++) {
        const a = lo + (hi - lo) * 0.38196601125,
          b = hi - (hi - lo) * 0.38196601125;
        const ca = squared(pointAt(a), target[i]),
          cb = squared(pointAt(b), target[i]);
        if (ca < bestCost) {
          bestCost = ca;
          best = a;
        }
        if (cb < bestCost) {
          bestCost = cb;
          best = b;
        }
        if (ca <= cb) hi = b;
        else lo = a;
      }
      progress[i] = best;
    }
  }
  return progress;
}

export function timingDiagnostics(
  p: FourBarParameters,
  progress: readonly number[],
  closed: boolean,
  mode: CorrespondenceMode,
  geometricCost: number,
  trajectorySamples: number,
  iterations: number
): CorrespondenceDiagnostics {
  const ends = closed ? [...progress, 1] : progress;
  const gaps = ends.slice(1).map((v, i) => (v - ends[i]) * p.sweep);
  const sorted = [...gaps].sort((a, b) => a - b);
  const minDelta = Math.min(...gaps),
    maxDelta = Math.max(...gaps);
  const meanDelta = p.sweep / gaps.length;
  return {
    mode,
    inputStart: p.theta0,
    inputEnd: p.theta0 + (p.direction === 'clockwise' ? -p.sweep : p.sweep),
    minDelta,
    maxDelta,
    meanDelta,
    medianDelta:
      (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2,
    monotone:
      progress[0] === 0 &&
      minDelta > 0 &&
      (!closed ? progress.at(-1) === 1 : progress.at(-1)! < 1) &&
      minDelta >= meanDelta * TIMING_MIN_STEP - 1e-10 &&
      maxDelta <= meanDelta * TIMING_MAX_STEP + 1e-10,
    targetSamples: progress.length,
    trajectorySamples,
    iterations,
    geometricCost,
    regularization: 0,
    totalCost: geometricCost,
  };
}
