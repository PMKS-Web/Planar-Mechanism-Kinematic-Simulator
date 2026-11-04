import { OracleProblem } from './export-problem';
import { OracleReference } from './reference';
import { PmksSample, RateMethod } from './pmks-samples';

type Vec = [number, number];

/**
 * What is compared. Each is made dimensionless by the machine's own scale: a
 * length by its size L, a speed by L·Ω and an acceleration by L·Ω², where Ω is
 * the input's speed (rad/s), or for a slider its speed over L. A budget is then
 * one number per quantity and method, for every machine alike.
 */
export type Quantity =
  | 'position'
  | 'velocity'
  | 'acceleration'
  | 'com'
  | 'comVelocity'
  | 'comAcceleration'
  | 'omega'
  | 'alpha';

export type Method = 'pose' | RateMethod;

export interface Deviation {
  quantity: Quantity;
  method: Method;
  /** The joint or body. */
  part: string;
  k: number;
  frame: number;
  /** |PMKS+ − oracle| over the machine's scale for this quantity. */
  error: number;
  /** The driven Jacobian's condition number at this pose, from the reference. */
  condition: number;
}

export interface MachineComparison {
  /** Worst deviation for each quantity and method that was compared. */
  worst: Map<string, Deviation>;
  /** Every deviation, for the report. */
  deviations: Deviation[];
  /** PMKS+ frames whose driver coordinate is not on the oracle's grid. */
  offGrid: { frame: number; offGrid: number }[];
  /** PMKS+ frames past the oracle's travel: a toggle disagreement. */
  outOfRange: { frame: number; k: number }[];
  /** PMKS+'s extent of travel in grid steps, and the oracle's. */
  range: { pmks: [number, number]; oracle: [number, number] };
  /** Quantities PMKS+ left blank where the oracle has one, frame by frame. */
  missing: { quantity: Quantity; part: string; k: number }[];
  /** Joints and bodies the oracle reports and PMKS+ reported in no frame. */
  unreported: string[];
  /** Stored oracle samples no PMKS+ frame landed on, so nothing was compared there. */
  unvisited: number[];
  compared: number;
}

export function machineScale(problem: OracleProblem): { length: number; rate: number } {
  const points = [...problem.points.map((p) => p.at), ...problem.bodies.map((b) => b.com)];
  let length = 0;
  for (const a of points) {
    for (const b of points) length = Math.max(length, Math.hypot(a[0] - b[0], a[1] - b[1]));
  }
  length = length || 1;
  const speed = Math.abs(problem.driver?.speed ?? 0);
  const rate = problem.driver?.kind === 'translation' ? speed / length : speed;
  return { length, rate: rate || 1 };
}

const distance = (a: Vec, b: Vec): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
const signed = (v: Vec, s: number): Vec => [v[0] * s, v[1] * s];

export function compareMachine(
  problem: OracleProblem,
  reference: OracleReference,
  samples: PmksSample[]
): MachineComparison {
  const sweep = reference.sweep!;
  const { length, rate } = machineScale(problem);
  const scaleOf: Record<Quantity, number> = {
    position: length,
    velocity: length * rate,
    acceleration: length * rate * rate,
    com: length,
    comVelocity: length * rate,
    comAcceleration: length * rate * rate,
    omega: rate,
    alpha: rate * rate,
  };
  const perTurn = Math.round((2 * Math.PI) / sweep.step);
  const period = sweep.closesAfterTurns ? perTurn * sweep.closesAfterTurns : undefined;
  const indexOf = new Map(sweep.samples.k.map((k, i) => [k, i]));
  const result: MachineComparison = {
    worst: new Map(),
    deviations: [],
    offGrid: [],
    outOfRange: [],
    range: { pmks: [Infinity, -Infinity], oracle: [sweep.kMin, sweep.kMax] },
    missing: [],
    unreported: [],
    unvisited: [],
    compared: 0,
  };
  const reported = new Set<string>();
  const visited = new Set<number>();
  const note = (d: Deviation): void => {
    result.compared++;
    result.deviations.push(d);
    const key = `${d.quantity}/${d.method}`;
    const worst = result.worst.get(key);
    if (!worst || d.error > worst.error) result.worst.set(key, d);
  };

  for (const sample of samples) {
    if (Math.abs(sample.offGrid) > 1e-6) {
      result.offGrid.push({ frame: sample.frame, offGrid: sample.offGrid });
      continue;
    }
    const k = period ? ((sample.k % period) + period) % period : sample.k;
    result.range.pmks = [Math.min(result.range.pmks[0], k), Math.max(result.range.pmks[1], k)];
    if (!period && (k < sweep.kMin || k > sweep.kMax)) {
      result.outOfRange.push({ frame: sample.frame, k });
      continue;
    }
    const i = indexOf.get(k);
    if (i === undefined) continue;
    visited.add(k);
    const s = sample.direction;
    const vec = (
      quantity: Quantity,
      part: string,
      actual: { value: Vec; method: RateMethod } | Vec | undefined,
      expected: Vec,
      method?: Method
    ): void => {
      if (actual === undefined) {
        result.missing.push({ quantity, part, k });
        return;
      }
      const [value, how] = Array.isArray(actual)
        ? [actual, method ?? 'pose']
        : [actual.value, actual.method];
      note({
        quantity,
        method: how,
        part,
        k,
        frame: sample.frame,
        error: distance(value, expected) / scaleOf[quantity],
        condition: sweep.samples.condition[i],
      });
    };
    const num = (
      quantity: Quantity,
      part: string,
      actual: { value: number; method: RateMethod } | undefined,
      expected: number
    ): void => {
      if (actual === undefined) {
        result.missing.push({ quantity, part, k });
        return;
      }
      note({
        quantity,
        method: actual.method,
        part,
        k,
        frame: sample.frame,
        error: Math.abs(actual.value - expected) / scaleOf[quantity],
        condition: sweep.samples.condition[i],
      });
    };

    for (const [id, oracle] of Object.entries(sweep.samples.points)) {
      const pmks = sample.points.get(id);
      if (!pmks) continue;
      reported.add(id);
      vec('position', id, pmks.pos, oracle.pos[i], 'pose');
      vec('velocity', id, pmks.vel, signed(oracle.vel[i], s));
      vec('acceleration', id, pmks.acc, oracle.acc[i]);
    }
    for (const [id, oracle] of Object.entries(sweep.samples.bodies)) {
      const pmks = sample.bodies.get(id);
      if (!pmks) continue;
      reported.add(id);
      vec('com', id, pmks.com, oracle.com[i], 'pose');
      vec('comVelocity', id, pmks.comVel, signed(oracle.comVel[i], s));
      vec('comAcceleration', id, pmks.comAcc, oracle.comAcc[i]);
      num('omega', id, pmks.omega, oracle.omega[i] * s);
      num('alpha', id, pmks.alpha, oracle.alpha[i]);
    }
  }
  result.unreported = [
    ...Object.keys(sweep.samples.points),
    ...Object.keys(sweep.samples.bodies),
  ].filter((id) => !reported.has(id));
  result.unvisited = sweep.samples.k.filter((k) => !visited.has(k));
  return result;
}

/** Derivatives of the pose a quantity is: 0 for a position, 1 for a speed, 2 for an acceleration. */
export const ORDER: Record<Quantity, 0 | 1 | 2> = {
  position: 0,
  com: 0,
  velocity: 1,
  comVelocity: 1,
  omega: 1,
  acceleration: 2,
  comAcceleration: 2,
  alpha: 2,
};

/**
 * Above this driven-Jacobian condition number only positions are compared. A
 * rate is the pose's error amplified by the conditioning, once for a velocity
 * and twice for an acceleration, so near a toggle or a change point a rate
 * says more about how well the pose was solved than about the rate solver.
 */
export const CONDITIONING_LIMIT = 1e3;

/**
 * The budget for each method and order, as a fraction of the machine's own
 * scale (see `machineScale`). Set from the measurement recorded in
 * docs/numerical-oracle-plan.md § Phase 1 results, at least five times the
 * worst, and the same for every machine: a budget is never widened for one.
 */
export const BUDGETS: Record<Method, [number, number, number]> = {
  // Measured worst over every verified machine: 1.8e-8 in Phase 1, at the
  // last sample before a toggle; 6.4e-8 in Phase 3, the same way, at the
  // excavator bucket's.
  pose: [1e-7, NaN, NaN],
  // Measured worst: 6.9e-9 for a rate and 8.3e-7 for an acceleration in
  // Phase 1, both where the condition number nears CONDITIONING_LIMIT, as an
  // error that grows with its square would; 6.2e-8 and 5.6e-6 in Phase 3,
  // both on the leg on a bicycle crank, the acceleration at a condition of 557.
  analytic: [NaN, 1e-7, 1e-5],
  // A central difference over 1° samples: about 5e-5 of a sinusoid's speed,
  // and a second difference for the acceleration. Measured worst in Phase 3,
  // over a cylinder's 180 samples a stroke: 8.5e-5 and 1.7e-3.
  differenced: [NaN, 1e-3, 1e-2],
};

export type Verdict = 'pass' | 'fail' | 'ill-conditioned' | 'undefined';

/**
 * Whether a deviation is within budget, or why it is not compared. A
 * differenced rate at the last sample before a reversal is undefined: the
 * difference reaches across the turn, onto the return sweep at the same pose.
 * So is one at PMKS+'s first or last frame (`lastFrame`), which it differences
 * one-sided, to first order, though the last frame repeats the first (#84).
 */
export function judge(
  d: Deviation,
  ends: readonly number[] | undefined,
  lastFrame: number
): Verdict {
  const order = ORDER[d.quantity];
  if (order > 0 && d.condition > CONDITIONING_LIMIT) return 'ill-conditioned';
  if (d.method === 'differenced') {
    if (oneSided(d.frame, lastFrame)) return 'undefined';
    const reach = order === 1 ? 0 : 1;
    if (ends?.some((end) => Math.abs(d.k - end) <= reach)) return 'undefined';
  }
  return d.error <= BUDGETS[d.method][order] ? 'pass' : 'fail';
}

/** Whether PMKS+ differences this frame one-sided: its first or its last (#84). */
export function oneSided(frame: number, lastFrame: number): boolean {
  return frame === 0 || frame === lastFrame;
}

/**
 * The PMKS+ frames that are poses of the mechanism the problem describes.
 *
 * PMKS+ shows the drawing as decoded at frame 0, solves the frames after it,
 * and closes a cycle on a copy of frame 0. A drawing that satisfies its
 * constraints exactly (any linkage of pins, whose lengths are read off the
 * drawing) is the same pose either way. A cylinder's four points, stored to
 * the URL's grain, are not quite on one line: frames 1 onward put them on the
 * line, and so does the exporter, but frame 0 and its copy keep them where the
 * URL left them. Those frames are not poses of the mechanism and are not
 * compared; every solved visit to the same grid point is.
 */
export function solvedFrames(problem: OracleProblem, samples: PmksSample[]): PmksSample[] {
  const first = samples.find((sample) => sample.frame === 0);
  if (!first) return samples;
  const { length } = machineScale(problem);
  const exported = problem.points.every((p) => {
    const at = first.points.get(p.id)?.pos;
    return !at || distance(at, p.at) <= 1e-9 * length;
  });
  if (exported) return samples;
  const asDrawn = (sample: PmksSample): boolean =>
    [...first.points].every(([id, { pos }]) => {
      const at = sample.points.get(id)?.pos;
      return !!at && at[0] === pos[0] && at[1] === pos[1];
    });
  return samples.filter((sample) => !asDrawn(sample));
}
