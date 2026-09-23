import { Joint, PrisJoint, RealJoint } from '../../model/joint';
import { Mechanism } from '../../model/mechanism/mechanism';

/** PROTOTYPE -- measurement helpers shared by the fact sheet and its relations. */

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
  /** Share of the cycle's samples spent on the run. */
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
  closed: boolean
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
  return {
    ...best,
    fraction: (best.end - best.start) / n,
    angle: ((deg(Math.atan2(direction[1], direction[0])) % 180) + 180) % 180,
    maxOffPercent: (deviation(best.start, best.end, best.length) / best.length) * 100,
    direction,
  };
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
