// joint.ts first: see the import-cycle note in test-utils/verification/fixture.ts.
import '../../app/model/joint';
import { Mechanism } from '../../app/model/mechanism/mechanism';
import { ForceAnalysisMode } from '../../app/model/mechanism/force-solver';
import { machineScale } from './compare-oracle';
import { OracleProblem } from './export-problem';
import { OracleForces, OracleReference } from './reference';
import { PmksSample } from './pmks-samples';

type Vec = [number, number];

/**
 * What the force comparison reads. A reaction is the force on one body at one
 * joint from everything else there, compared only where the oracle finds it
 * fixed by equilibrium; a body total is the sum of a body's reactions, which
 * is always fixed, and is what a redundant support is compared by; a couple is
 * a Slide's guide on its rider; the effort is the input torque or force.
 */
export type ForceQuantity = 'reaction' | 'bodyTotal' | 'couple' | 'effort';

export interface ForceDeviation {
  mode: ForceAnalysisMode;
  quantity: ForceQuantity;
  /** `joint/body`, `body`, `joint`, or the input joint. */
  part: string;
  k: number;
  frame: number;
  /** |PMKS+ − oracle| over the machine's force scale (or force × length for a moment). */
  error: number;
  condition: number;
}

export interface ForceComparison {
  deviations: ForceDeviation[];
  /** Frames where PMKS+'s force solve did not succeed, with the oracle's condition there. */
  unsolved: { status: string; k: number; condition: number }[];
  /** Reactions the oracle fixes and PMKS+ does not report. */
  missing: string[];
  /** The largest force the oracle finds anywhere in this machine; 0 when it carries none. */
  forceScale: number;
}

const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1]];

function largestForce(forces: OracleForces): number {
  let largest = 0;
  for (const totals of Object.values(forces.bodyTotals)) {
    for (const v of totals) largest = Math.max(largest, Math.hypot(v[0], v[1]));
  }
  for (const byBody of Object.values(forces.reactions)) {
    for (const series of Object.values(byBody)) {
      for (const v of series) largest = Math.max(largest, Math.hypot(v[0], v[1]));
    }
  }
  return largest;
}

/**
 * PMKS+'s force analysis against the oracle's inverse dynamics, at every PMKS+
 * frame that lands on a stored oracle state, in both modes: `static` (loads
 * and gravity only) and `dynamic` (with the inertia of the motion).
 */
export function compareForces(
  problem: OracleProblem,
  reference: OracleReference,
  mechanism: Mechanism,
  samples: PmksSample[],
  mode: ForceAnalysisMode
): ForceComparison {
  const sweep = reference.sweep!;
  const oracle = sweep.samples.forces[mode];
  const forceScale = largestForce(oracle);
  const result: ForceComparison = { deviations: [], unsolved: [], missing: [], forceScale };
  if (forceScale === 0) return result;
  const { length } = machineScale(problem);
  const momentScale = forceScale * length;
  const perTurn = Math.round((2 * Math.PI) / sweep.step);
  const period = sweep.closesAfterTurns ? perTurn * sweep.closesAfterTurns : undefined;
  const indexOf = new Map(sweep.samples.k.map((k, i) => [k, i]));
  mechanism.prepareSolvers();
  const series = mechanism.getForceAnalysis(mode);
  const missing = new Set<string>();
  const frameParts = frameBodies(problem);

  for (const sample of samples) {
    if (Math.abs(sample.offGrid) > 1e-6) continue;
    const k = period ? ((sample.k % period) + period) % period : sample.k;
    const i = indexOf.get(k);
    if (i === undefined) continue;
    const frame = series.frames[sample.frame];
    if (!frame || frame.status !== 'ok') {
      result.unsolved.push({
        status: frame?.status ?? 'missing',
        k,
        condition: sweep.samples.condition[i],
      });
      continue;
    }
    const condition = sweep.samples.condition[i];
    const note = (quantity: ForceQuantity, part: string, error: number): void => {
      result.deviations.push({ mode, quantity, part, k, frame: sample.frame, error, condition });
    };

    // Body totals: PMKS+'s reactions on a body, summed over the joints it meets.
    const totals = new Map<string, Vec>();
    for (const [, byBody] of frame.jointReactionsByLink) {
      for (const [body, force] of byBody) totals.set(body, add(totals.get(body) ?? [0, 0], force));
    }
    for (const [body, expected] of Object.entries(oracle.bodyTotals)) {
      const actual = totals.get(body);
      const e = expected[i];
      if (!actual) {
        if (!frameParts.has(body) && Math.hypot(e[0], e[1]) > 0) missing.add(`total on ${body}`);
        continue;
      }
      note('bodyTotal', body, Math.hypot(actual[0] - e[0], actual[1] - e[1]) / forceScale);
    }
    for (const [joint, byBody] of Object.entries(oracle.reactions)) {
      for (const [body, expectedSeries] of Object.entries(byBody)) {
        if (!oracle.identifiable[joint]?.[body] || frameParts.has(body)) continue;
        const actual = frame.jointReactionsByLink.get(joint)?.get(body);
        const e = expectedSeries[i];
        if (!actual) {
          missing.add(`${joint}/${body}`);
          continue;
        }
        note(
          'reaction',
          `${joint}/${body}`,
          Math.hypot(actual[0] - e[0], actual[1] - e[1]) / forceScale
        );
      }
    }
    for (const [joint, byBody] of Object.entries(oracle.couples)) {
      const actual = frame.guideCouples.get(joint);
      if (actual === undefined) continue;
      for (const [body, expectedSeries] of Object.entries(byBody)) {
        if (body !== riderOf(problem, joint)) continue;
        note('couple', `${joint}/${body}`, Math.abs(actual - expectedSeries[i]) / momentScale);
      }
    }
    const effort = oracle.effort[i];
    if (effort !== null && frame.inputEffort) {
      const scale = frame.inputEffort.kind === 'torque' ? momentScale : forceScale;
      note(
        'effort',
        frame.inputEffort.jointId,
        Math.abs(frame.inputEffort.valueSI - effort) / scale
      );
    }
  }
  result.missing = [...missing];
  return result;
}

/**
 * Bodies PMKS+ folds into the frame: a bar pinned to the ground at two or more
 * of its joints cannot move, so the force solver gives it no rows and reports
 * no reactions on it (`frameBodies` in force-solver.ts). The oracle models it
 * as a body held still; its loads are the ground's, and are not compared.
 */
export function frameBodies(problem: OracleProblem): Set<string> {
  const groundedPins = new Map<string, number>();
  for (const joint of problem.joints) {
    if (joint.kind !== 'pin' || !joint.grounded) continue;
    for (const body of joint.bodies) groundedPins.set(body, (groundedPins.get(body) ?? 0) + 1);
  }
  return new Set([...groundedPins].filter(([, count]) => count >= 2).map(([body]) => body));
}

/** The rider a Slide's guide couple acts on: the slider's one rider. */
function riderOf(problem: OracleProblem, joint: string): string | undefined {
  const slider = problem.joints.find((j) => j.id === joint);
  return slider?.kind === 'slider' && slider.riders.length === 1 ? slider.riders[0] : undefined;
}

/**
 * The budget for a force, a couple or an effort, as a fraction of the
 * machine's largest force (or that force times its size, for a moment). One
 * number per mode, for every machine alike, set from the measurement in
 * docs/numerical-oracle-plan.md § Phase 2 results. Above CONDITIONING_LIMIT a
 * force is not compared: equilibrium near a toggle is ill-conditioned the
 * way a rate is, once.
 */
export const FORCE_BUDGETS: Record<ForceAnalysisMode, number> = {
  // Measured worst over every verified machine: 1.9e-9 static, 4.6e-10 dynamic.
  static: 1e-8,
  dynamic: 1e-8,
};
