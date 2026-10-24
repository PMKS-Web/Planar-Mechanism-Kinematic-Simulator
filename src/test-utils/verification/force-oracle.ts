// joint.ts first: see the import-cycle note in fixture.ts.
import { Joint } from '../../app/model/joint';
import { MODEL_SCALE } from '../../app/model/render-scale';
import { ForceAnalysisMode, ForceAnalysisSeries } from '../../app/model/mechanism/force-solver';
import { Mechanism } from '../../app/model/mechanism/mechanism';
import { MechanismFixture } from './fixture';

/**
 * An oracle for force analysis that takes nothing from the force solver.
 *
 * The 200× error of PR #38 -- and the double fix of it that PR #42 nearly
 * merged on top -- were both scale errors that every force number shares. A
 * check that borrows the solver's own unit factors, its kinematics or its
 * reading of the drawing moves with it, and can pass on a wrong answer. This
 * one is built so that it cannot:
 *
 * - **What the mechanism is** -- masses, inertias, centers of mass, loads,
 *   gravity -- comes from a description in SI (`oracle-fixtures.ts`), never
 *   from the drawing. The app's copy of those numbers went through a unit system, a
 *   URL and the solver's factors; this copy went through none of them.
 * - **How the units convert** is this file's own table, from the definitions
 *   of the inch and the pound, not `siUnitFactors`.
 * - **How it moves** is differentiated here, numerically, from the joint
 *   positions the app solved and the sample clock it solved them on. Positions
 *   are what the MATLAB kinematics suites verify, and they carry no unit
 *   factor the force solver could share. The analytic velocity and
 *   acceleration solver is not consulted.
 *
 * What it then checks is Newton and Euler, body by body, against the
 * reactions and the input torque the solver reports -- and the power balance
 * of the whole machine, which needs no reaction at all. For a linkage whose
 * reactions are determined, answers that satisfy every body's equations are
 * *the* answers, so this is a full check rather than a sanity bound.
 */

type Vec = [number, number];

/** A body as it really is, in SI. */
export interface PhysicalBody {
  /** The link's joint letters; the first two set the frame its points ride in. */
  joints: string;
  /** kg */
  mass: number;
  /** kg·m², about the center of mass. */
  inertia: number;
  /** m, in the start pose. */
  com: Vec;
}

export interface PhysicalLoad {
  onLink: string;
  /** m, in the start pose; the point rides the link. */
  at: Vec;
  /** N, held in the world's frame. */
  vector: Vec;
}

/** A pin-jointed mechanism with at most one slider on a grounded guide, in SI. */
export interface PhysicalMechanism {
  joints: { id: string; at: Vec; ground?: boolean; input?: boolean }[];
  bodies: PhysicalBody[];
  /** A joint sliding on a grounded guide, and the mass of the block it carries. */
  slider?: { at: string; angleRad: number; mass: number };
  loads: PhysicalLoad[];
  /** How fast the input turns. Only the drawing uses it: the oracle measures the motion. */
  rpm: number;
}

export type DrawingUnit = 'm' | 'cm' | 'in';

const METERS_PER_INCH = 0.0254; // exact, by the 1959 international yard
const KG_PER_POUND = 0.45359237; // exact, by the same agreement
const STANDARD_GRAVITY = 9.80665; // m/s², exact by definition

/**
 * What one stored number is worth in SI, per drawing unit.
 *
 * "Stored" rather than "shown": a cm drawing *shows* inertia in g·cm² but keeps
 * it in kg·cm², which is what every URL already in circulation was written
 * against (`NumberUnitParserService.storedInertiaUnit`). A pound-force is the
 * weight of a pound under standard gravity, so it is derived, not quoted.
 */
export const STORED_UNIT_IN_SI: Record<
  DrawingUnit,
  { length: number; mass: number; inertia: number; force: number }
> = {
  m: { length: 1, mass: 1, inertia: 1, force: 1 },
  // g for mass, kg·cm² for inertia -- the stored pair, which is not coherent.
  cm: { length: 0.01, mass: 0.001, inertia: 0.01 ** 2, force: 1 },
  in: {
    length: METERS_PER_INCH,
    mass: KG_PER_POUND,
    inertia: KG_PER_POUND * METERS_PER_INCH ** 2,
    force: KG_PER_POUND * STANDARD_GRAVITY,
  },
};

/**
 * The same mechanism drawn in `unit`, as a fixture the app can build or open.
 *
 * `stretch` draws it that many times larger with the masses left alone, which
 * is exactly what a solver that mistook its length unit by that factor would
 * see: every moment arm and every m·a off by it, while g and the loads are not.
 * The oracle's own spec uses it to show that it notices.
 */
export function drawnIn(
  physical: PhysicalMechanism,
  unit: DrawingUnit,
  stretch = 1
): MechanismFixture {
  const per = STORED_UNIT_IN_SI[unit];
  const length = (meters: number) => (meters * stretch) / per.length;
  const point = ([x, y]: Vec): Vec => [length(x), length(y)];
  return {
    unit,
    gravity: true,
    inputAngVel: (physical.rpm * Math.PI) / 30,
    joints: physical.joints.map((joint) => {
      const [x, y] = point(joint.at);
      return {
        id: joint.id,
        x,
        y,
        ground: joint.ground,
        input: joint.input,
        driveSpeed: joint.input ? physical.rpm : undefined,
      };
    }),
    links: physical.bodies.map((body) => ({
      joints: body.joints,
      mass: body.mass / per.mass,
      moi: body.inertia / per.inertia,
      com: point(body.com),
    })),
    slider: physical.slider && {
      at: physical.slider.at,
      angleRad: physical.slider.angleRad,
      pistonMass: physical.slider.mass / per.mass,
    },
    loads: physical.loads.map((load) => ({
      onLink: load.onLink,
      at: point(load.at),
      vector: [load.vector[0] / per.force, load.vector[1] / per.force],
    })),
  };
}

export interface OracleReport {
  /** Frames the solver answered and the oracle could differentiate around. */
  checked: number;
  frames: number;
  /** Worst body-equation residual, relative to the frame's largest term. */
  worstBody: number;
  /** Worst power-balance residual, relative to the frame's largest term. */
  worstPower: number;
  /** Where `worstBody` was found, for the failure message. */
  where: string;
}

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1]];
const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1]];
const times = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1];
const cross = (a: Vec, b: Vec) => a[0] * b[1] - a[1] * b[0];
const norm = (a: Vec) => Math.hypot(a[0], a[1]);
const turn = ([x, y]: Vec, angle: number): Vec => [
  x * Math.cos(angle) - y * Math.sin(angle),
  x * Math.sin(angle) + y * Math.cos(angle),
];

/**
 * How many samples apart the points of a derivative stencil are taken.
 *
 * The position solver rounds to four decimals of a model unit, whatever the
 * drawing's unit, and differencing twice divides that by the step squared. A
 * meter is only MODEL_SCALE model units, so a drawing in meters is the
 * noisiest: one-degree steps put about 1% noise on every acceleration. Four degrees cuts that
 * sixteenfold, and the fourth-order stencil keeps the truncation error near
 * 1e-4 even for the fifth harmonic a linkage's motion carries.
 */
const STRIDE = 4;

/**
 * First and second derivative at sample `t`, by the five-point central
 * stencil -- or undefined where the samples it needs are not evenly spaced,
 * which is where the solver cut the walk finer and a frame is better skipped
 * than differentiated badly.
 */
function rates(
  value: (t: number) => number,
  clock: number[],
  t: number
): [number, number] | undefined {
  const at = [-2, -1, 0, 1, 2].map((k) => t + k * STRIDE);
  if (at[0] < 0 || at[4] >= clock.length) return undefined;
  const h = (clock[at[4]] - clock[at[0]]) / 4;
  if (!(h > 0)) return undefined;
  for (let k = 1; k < 5; k++) {
    if (Math.abs(clock[at[k]] - clock[at[k - 1]] - h) > 1e-6 * h) return undefined;
  }
  const [f0, f1, f2, f3, f4] = at.map(value);
  return [
    (f0 - 8 * f1 + 8 * f3 - f4) / (12 * h),
    (-f0 + 16 * f1 - 30 * f2 + 16 * f3 - f4) / (12 * h * h),
  ];
}

/** The same for a point: [velocity, acceleration]. */
function pointRates(where: (t: number) => Vec, clock: number[], t: number): [Vec, Vec] {
  const [vx, ax] = rates((s) => where(s)[0], clock, t)!;
  const [vy, ay] = rates((s) => where(s)[1], clock, t)!;
  return [
    [vx, vy],
    [ax, ay],
  ];
}

/**
 * Audit a force analysis against Newton–Euler and the power balance.
 *
 * `positions` is the mechanism whose joint motion is believed; `series` is the
 * force analysis under audit. They are the same mechanism except in the spec
 * that shows the oracle notices a scale error, which hands it the analysis of
 * a stretched drawing.
 */
export function auditForces(
  physical: PhysicalMechanism,
  unit: DrawingUnit,
  positions: Mechanism,
  series: ForceAnalysisSeries,
  mode: ForceAnalysisMode
): OracleReport {
  const metersPerModelUnit = STORED_UNIT_IN_SI[unit].length / MODEL_SCALE;
  const clock = positions.timeNum;
  const frames = positions.joints.length;
  const weight = (mass: number): Vec => [0, -mass * STANDARD_GRAVITY];
  const dynamic = mode === 'dynamic';
  const start = new Map(physical.joints.map((joint) => [joint.id, joint.at]));

  const jointAt = (id: string, t: number): Vec => {
    const joint = positions.joints[t].find((candidate: Joint) => candidate.id === id);
    if (!joint) throw new Error(`The solved mechanism has no joint ${id}.`);
    return [joint.x * metersPerModelUnit, joint.y * metersPerModelUnit];
  };

  // Each body's heading, unwrapped across the cycle so it can be differentiated.
  const headings = new Map<string, number[]>();
  for (const body of physical.bodies) {
    const [first, second] = [...body.joints];
    const angles: number[] = [];
    for (let t = 0; t < frames; t++) {
      const [dx, dy] = sub(jointAt(second, t), jointAt(first, t));
      let angle = Math.atan2(dy, dx);
      if (t > 0) angle += 2 * Math.PI * Math.round((angles[t - 1] - angle) / (2 * Math.PI));
      angles.push(angle);
    }
    headings.set(body.joints, angles);
  }

  /** Where a point drawn on `body` in the start pose has been carried at sample t. */
  const carried = (body: PhysicalBody, drawn: Vec) => {
    const [first, second] = [...body.joints];
    const [dx, dy] = sub(start.get(second)!, start.get(first)!);
    const startHeading = Math.atan2(dy, dx);
    const local = turn(sub(drawn, start.get(first)!), -startHeading);
    return (t: number): Vec => add(jointAt(first, t), turn(local, headings.get(body.joints)![t]));
  };

  let checked = 0;
  let worstBody = 0;
  let worstPower = 0;
  let where = '';
  for (let t = 0; t < frames; t++) {
    const frame = series.frames[t];
    if (!frame || frame.status !== 'ok' || !frame.inputEffort) continue;
    if (!rates(() => 0, clock, t)) continue;
    checked++;

    const forceTerms: Vec[] = [];
    const momentTerms: number[] = [];
    const powerTerms: number[] = [];
    const forceResiduals: [string, Vec][] = [];
    const momentResiduals: [string, number][] = [];
    let longestArm = 0;

    for (const body of physical.bodies) {
      const com = carried(body, body.com);
      const g = com(t);
      const [vG, aG] = pointRates(com, clock, t);
      const [omega, alpha] = rates((s) => headings.get(body.joints)![s], clock, t)!;

      const pushes: { at: Vec; force: Vec }[] = [];
      for (const id of body.joints) {
        const reaction = frame.jointReactionsByLink.get(id)?.get(body.joints);
        if (reaction) pushes.push({ at: jointAt(id, t), force: reaction });
      }
      for (const load of physical.loads.filter((candidate) => candidate.onLink === body.joints)) {
        const point = carried(body, load.at);
        pushes.push({ at: point(t), force: load.vector });
        powerTerms.push(dot(load.vector, pointRates(point, clock, t)[0]));
      }

      const inertial = dynamic ? times(aG, body.mass) : ([0, 0] as Vec);
      let forceSum = sub(weight(body.mass), inertial);
      let momentSum = dynamic ? -body.inertia * alpha : 0;
      forceTerms.push(weight(body.mass), inertial);
      momentTerms.push(momentSum);
      for (const { at, force } of pushes) {
        const arm = sub(at, g);
        longestArm = Math.max(longestArm, norm(arm));
        forceSum = add(forceSum, force);
        momentSum += cross(arm, force);
        forceTerms.push(force);
        momentTerms.push(cross(arm, force));
      }
      const driven = physical.joints.find((joint) => joint.input && body.joints.includes(joint.id));
      if (driven) {
        momentSum += frame.inputEffort.valueSI;
        momentTerms.push(frame.inputEffort.valueSI);
        powerTerms.push(frame.inputEffort.valueSI * omega);
      }
      forceResiduals.push([body.joints, forceSum]);
      momentResiduals.push([body.joints, momentSum]);

      powerTerms.push(dot(weight(body.mass), vG));
      if (dynamic) powerTerms.push(-body.mass * dot(aG, vG), -body.inertia * alpha * omega);
    }

    // The block: only along its guide, where the guide itself pushes nothing.
    const slider = physical.slider;
    if (slider) {
      const along: Vec = [Math.cos(slider.angleRad), Math.sin(slider.angleRad)];
      const [vF, aF] = pointRates((s) => jointAt(slider.at, s), clock, t);
      const riders = frame.jointReactionsByLink.get(slider.at) ?? new Map();
      let fromRiders: Vec = [0, 0];
      for (const body of physical.bodies.filter((candidate) =>
        candidate.joints.includes(slider.at)
      )) {
        // Each rider is pushed by the block; the block is pushed back.
        const reaction = riders.get(body.joints);
        if (reaction) fromRiders = sub(fromRiders, reaction);
      }
      const inertial = dynamic ? times(aF, slider.mass) : ([0, 0] as Vec);
      forceTerms.push(fromRiders, weight(slider.mass), inertial);
      const residual = dot(sub(add(fromRiders, weight(slider.mass)), inertial), along);
      forceResiduals.push([`block at ${slider.at}`, [residual, 0]]);
      powerTerms.push(dot(weight(slider.mass), vF));
      if (dynamic) powerTerms.push(-slider.mass * dot(aF, vF));
    }

    const forceScale = Math.max(...forceTerms.map(norm));
    const momentScale = Math.max(forceScale * longestArm, ...momentTerms.map(Math.abs));
    for (const [name, residual] of forceResiduals) {
      const relative = norm(residual) / forceScale;
      if (relative > worstBody) [worstBody, where] = [relative, `${name} forces, sample ${t}`];
    }
    for (const [name, residual] of momentResiduals) {
      const relative = Math.abs(residual) / momentScale;
      if (relative > worstBody) [worstBody, where] = [relative, `${name} moments, sample ${t}`];
    }
    const powerScale = Math.max(...powerTerms.map(Math.abs));
    const power = powerTerms.reduce((sum, term) => sum + term, 0);
    worstPower = Math.max(worstPower, Math.abs(power) / powerScale);
  }
  return { checked, frames, worstBody, worstPower, where };
}
