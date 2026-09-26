import { Joint, PrisJoint, RealJoint } from '../joint';
import { Mechanism } from '../mechanism/mechanism';

/** Measurement helpers shared by the fact sheet and its relations. */

export interface Samples {
  mechanism: Mechanism;
  /** Joint id -> [x, y] per sample, in the reader's length unit, y up. */
  paths: Map<string, [number, number][]>;
  time: number[];
  /** Seconds for one full input revolution, when the input turns fully. */
  period?: number;
}

export const deg = (rad: number) => (rad * 180) / Math.PI;

export const fmt = (value: number, digits = 2) => {
  const rounded = Number(value.toFixed(digits));
  return Object.is(rounded, -0) ? '0' : String(rounded);
};

/** A fixed pin of the frame; a slider on a fixed guide is flagged ground too, and is not one. */
export function isGroundPin(joint: Joint): boolean {
  return joint instanceof RealJoint && joint.ground && !(joint instanceof PrisJoint);
}

export function unwrap(angles: number[]): number[] {
  const out = [angles[0]];
  for (let i = 1; i < angles.length; i++) {
    let delta = angles[i] - angles[i - 1];
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    out.push(out[i - 1] + delta);
  }
  return out;
}

export function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function distAt(samples: Samples, a: Joint, b: Joint, i = 0): number {
  const p = samples.paths.get(a.id)![i];
  const q = samples.paths.get(b.id)![i];
  return Math.hypot(p[0] - q[0], p[1] - q[1]);
}

/** Orientation of a body over the cycle, read from its two farthest-apart joints. */
export function bodyAngles(joints: Joint[], samples: Samples): number[] | undefined {
  const usable = joints.filter((j) => samples.paths.has(j.id));
  if (usable.length < 2) return undefined;
  let pair: [Joint, Joint] = [usable[0], usable[1]];
  for (const a of usable)
    for (const b of usable) if (distAt(samples, a, b) > distAt(samples, ...pair)) pair = [a, b];
  const pa = samples.paths.get(pair[0].id)!;
  const pb = samples.paths.get(pair[1].id)!;
  return unwrap(pa.map((p, i) => Math.atan2(pb[i][1] - p[1], pb[i][0] - p[0])));
}

export function fitLine(points: [number, number][]) {
  const n = points.length;
  const cx = points.reduce((s, p) => s + p[0], 0) / n;
  const cy = points.reduce((s, p) => s + p[1], 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const [x, y] of points) {
    sxx += (x - cx) ** 2;
    sxy += (x - cx) * (y - cy);
    syy += (y - cy) ** 2;
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const ux = Math.cos(theta);
  const uy = Math.sin(theta);
  const along = points.map(([x, y]) => (x - cx) * ux + (y - cy) * uy);
  const off = points.map(([x, y]) => Math.abs(-(x - cx) * uy + (y - cy) * ux));
  const angle = ((deg(theta) % 180) + 180) % 180;
  return { angle, length: Math.max(...along) - Math.min(...along), maxOff: Math.max(...off) };
}

export interface StraightRun {
  start: number;
  end: number;
  length: number;
  /**
   * Share of the cycle's time the point spends on the run's segment. Time, not
   * samples: the solver refines its step near hard poses, so a sample count
   * overstates whatever stretch it refined. Both passes of a back-and-forth
   * path count.
   */
  fraction: number;
  angle: number;
  maxOffPercent: number;
  /** Unit vector along the run. */
  direction: [number, number];
}

/**
 * The longest stretch of consecutive samples that stays within 0.5% of its own
 * chord length from that chord -- the "straight-line" part of a coupler curve.
 */
export function longestStraightRun(
  path: [number, number][],
  closed: boolean,
  time: number[]
): StraightRun | undefined {
  const n = path.length;
  const at = (i: number) => path[closed ? i % n : Math.min(i, n - 1)];
  const limit = closed ? n : n - 1;
  const deviation = (start: number, end: number, chord: number) => {
    const a = at(start);
    const b = at(end);
    let worst = 0;
    for (let k = start + 1; k < end; k++) {
      const p = at(k);
      worst = Math.max(
        worst,
        Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / chord
      );
    }
    return worst;
  };
  let best: { start: number; end: number; length: number } | undefined;
  for (let start = 0; start < limit; start++) {
    for (let end = start + 2; end - start < limit; end++) {
      const a = at(start);
      const b = at(end);
      const chord = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (chord < 1e-9 || deviation(start, end, chord) / chord > 0.005) break;
      if (!best || chord > best.length) best = { start, end, length: chord };
    }
  }
  if (!best) return undefined;
  const a = at(best.start);
  const b = at(best.end);
  const direction: [number, number] = [(b[0] - a[0]) / best.length, (b[1] - a[1]) / best.length];
  const maxOff = deviation(best.start, best.end, best.length);
  return {
    ...best,
    fraction: timeOnSegment(path, time, a, direction, best.length, maxOff),
    angle: ((deg(Math.atan2(direction[1], direction[0])) % 180) + 180) % 180,
    maxOffPercent: (maxOff / best.length) * 100,
    direction,
  };
}

/**
 * Share of the cycle's time spent between consecutive samples that both lie on
 * the segment. A closed cycle's last sample is its first again, so the wrap
 * needs no step of its own.
 */
function timeOnSegment(
  path: [number, number][],
  time: number[],
  origin: [number, number],
  direction: [number, number],
  length: number,
  maxOff: number
): number {
  const n = path.length;
  const slack = 1e-6 * length;
  const on = path.map(([x, y]) => {
    const along = (x - origin[0]) * direction[0] + (y - origin[1]) * direction[1];
    const off = Math.abs(-(x - origin[0]) * direction[1] + (y - origin[1]) * direction[0]);
    return along >= -slack && along <= length + slack && off <= maxOff + slack;
  });
  const total = time[n - 1] - time[0];
  if (total <= 0) return 0;
  let spent = 0;
  for (let i = 0; i + 1 < n; i++) if (on[i] && on[i + 1]) spent += time[i + 1] - time[i];
  return spent / total;
}

/** Crossings between non-neighbouring segments of a closed path. */
export function countSelfCrossings(path: [number, number][]): number {
  const n = path.length;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const a = path[i];
    const b = path[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segmentsCross(a, b, path[j], path[(j + 1) % n])) count++;
    }
  }
  return count;
}

function segmentsCross(a: number[], b: number[], c: number[], d: number[]): boolean {
  const cross = (o: number[], p: number[], q: number[]) =>
    (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  return cross(c, d, a) * cross(c, d, b) < 0 && cross(a, b, c) * cross(a, b, d) < 0;
}

/** "bottom", "top", "left" or "right" for the side a unit vector points to. */
export function sideWord([x, y]: [number, number]): string {
  return Math.abs(y) >= Math.abs(x) ? (y < 0 ? 'bottom' : 'top') : x < 0 ? 'left' : 'right';
}

/**
 * For a body that turns once per cycle: the longest and shortest time it takes
 * to turn half a revolution, over every starting angle. Anything driven from it
 * through two opposite half-turns gets a stroke and a return in that ratio.
 */
export function halfTurnTimes(
  angles: number[],
  time: number[]
): { slow: number; fast: number } | undefined {
  const n = angles.length;
  const total = angles[n - 1] - angles[0];
  const period = time[n - 1] - time[0];
  if (Math.abs(total) < 1.9 * Math.PI || period <= 0) return undefined;
  const sign = Math.sign(total);
  // A second lap, so a half-turn may start late in the cycle and end in the next.
  const a = [...angles, ...angles.slice(1).map((v) => v + total)];
  const t = [...time, ...time.slice(1).map((v) => v + period)];
  const durations: number[] = [];
  let k = 0;
  for (let i = 0; i < n - 1; i++) {
    const target = a[i] + sign * Math.PI;
    k = Math.max(k, i);
    while (k + 1 < a.length && sign * (a[k + 1] - target) < 0) k++;
    if (k + 1 >= a.length) break;
    const f = (target - a[k]) / (a[k + 1] - a[k]);
    durations.push(t[k] + f * (t[k + 1] - t[k]) - t[i]);
  }
  return durations.length
    ? { slow: Math.max(...durations), fast: Math.min(...durations) }
    : undefined;
}

/** A body that turns fully but unevenly is a quick-return's tell. */
export function angularSpeedSpread(angles: number[], samples: Samples): string {
  const rates: number[] = [];
  for (let i = 1; i < angles.length; i++) {
    const dt = samples.time[i] - samples.time[i - 1];
    if (Math.abs(dt) > 1e-9) rates.push(Math.abs(deg(angles[i] - angles[i - 1]) / dt));
  }
  if (!rates.length) return '';
  const slow = Math.min(...rates);
  const fast = Math.max(...rates);
  if (slow < 1e-6 || fast / slow < 1.05) return ', at a steady angular speed';
  return `, unevenly: its angular speed ranges from ${fmt(slow, 1)} to ${fmt(fast, 1)} deg/s (fastest/slowest ${fmt(fast / slow)})`;
}

/**
 * Time spent going min->max versus max->min, when the input turns steadily.
 * A back-and-forth input has no fixed drive law, so no ratio is claimed.
 */
export function strokeTiming(values: number[], samples: Samples): string {
  if (!samples.period) return '';
  const time = samples.time;
  let lo = 0;
  let hi = 0;
  values.forEach((v, i) => {
    if (v < values[lo]) lo = i;
    if (v > values[hi]) hi = i;
  });
  const P = samples.period;
  const rise = (((time[hi] - time[lo]) % P) + P) % P;
  const fall = P - rise;
  if (rise < 1e-6 || fall < 1e-6) return '';
  const ratio = Math.max(rise, fall) / Math.min(rise, fall);
  return `; one way takes ${fmt(rise)} s and the other ${fmt(fall)} s (time ratio ${fmt(ratio)})`;
}
