import { describeActuator, GROUND_BODY } from '../../model/actuator';
import { Joint, PrisJoint, RealJoint } from '../../model/joint';
import { Link, RealLink } from '../../model/link';
import {
  angularSpeedSpread,
  bodyAngles,
  deg,
  distAt,
  fitLine,
  fmt,
  isGroundPin,
  strokeTiming,
  unwrap,
} from './fact-math';
import { jointsOf, RelationContext, sweepOf, traced, turnsFully } from './relations';

/**
 * PROTOTYPE -- each link's job, named the way a mechanisms course names it.
 *
 * The first sheets listed every body's motion and left the model to work out
 * which link was the crank, which the coupler and which the output -- the
 * reading 14 of 34 students got wrong in 2026, answering for the crank when
 * asked about the coupler. The app knows: which body the input drives, which
 * bodies are pinned to the ground, which turn fully, which carry a slot. So it
 * says so, and keys each rocker's and slider's ends to the input's angle,
 * because that is how a homework problem poses a position.
 */

export interface InputSeries {
  /** What the reading is, for a sentence: "link AB's angle". */
  what: string;
  /** Per sample: degrees counterclockwise from +x, or a length. */
  values: number[];
  angle: boolean;
}

export interface LinkJob {
  /** As the fact sheet names it: "link AB", "slider C", "cylinder A-B", "ground". */
  name: string;
  /** The job in a few words: "input crank", "coupler", "rocker". */
  job: string;
  /** How it moves, as a clause. */
  motion: string;
}

/** The input's reading at every sample, so any other part's position can be keyed to it. */
export function inputSeries(
  ctx: RelationContext,
  driven: RealJoint | undefined
): InputSeries | undefined {
  if (!driven) return undefined;
  const cylinder = ctx.cylinders.find((c) => c.seal === driven);
  if (cylinder) {
    const a = ctx.samples.paths.get(cylinder.mountA.id)!;
    const b = ctx.samples.paths.get(cylinder.mountB.id)!;
    return {
      what: `cylinder ${cylinder.mountA.id}-${cylinder.mountB.id}'s length`,
      values: a.map((p, i) => Math.hypot(b[i][0] - p[0], b[i][1] - p[1])),
      angle: false,
    };
  }
  if (driven instanceof PrisJoint) {
    const path = ctx.samples.paths.get(driven.id);
    if (!path || !driven.ground) return undefined;
    const ux = Math.cos(driven.angle_rad);
    const uy = Math.sin(driven.angle_rad);
    return {
      what: `slider ${driven.id}'s position along its guide`,
      values: path.map(([x, y]) => x * ux + y * uy),
      angle: false,
    };
  }
  const actuator = describeActuator(driven);
  if (typeof actuator === 'string' || actuator.drivenBody === GROUND_BODY) return undefined;
  const body = actuator.drivenBody;
  const others = jointsOf(ctx, body).filter((j) => j !== driven);
  if (!others.length || !ctx.samples.paths.has(driven.id)) return undefined;
  const far = others.reduce((best, j) =>
    distAt(ctx.samples, driven, j) > distAt(ctx.samples, driven, best) ? j : best
  );
  const p = ctx.samples.paths.get(driven.id)!;
  const q = ctx.samples.paths.get(far.id)!;
  return {
    what: `${ctx.bodyLabel(body)}'s angle (${driven.id} to ${far.id})`,
    values: unwrap(p.map((a, i) => Math.atan2(q[i][1] - a[1], q[i][0] - a[0]))).map(deg),
    angle: true,
  };
}

/** The input's reading at one sample, the way the Analysis panel would show it. */
export function inputAt(input: InputSeries, i: number): string {
  if (!input.angle) return fmt(input.values[i]);
  // Rounded before it is folded, so 359.6 reads 0 and not 360.
  const whole = Math.round(input.values[i]);
  return `${((whole % 360) + 360) % 360} deg`;
}

/** Where a back-and-forth quantity reaches its two ends, said in the input's terms. */
function endsAt(values: number[], input: InputSeries | undefined): string {
  if (!input) return '';
  let lo = 0;
  let hi = 0;
  values.forEach((v, i) => {
    if (v < values[lo]) lo = i;
    if (v > values[hi]) hi = i;
  });
  return `; it reaches its two ends when ${input.what} is ${inputAt(input, lo)} and ${inputAt(input, hi)}`;
}

/** The two joints of a body that sit on opposite sides of its ground pivot, if any: a beam. */
export function beamArms(ctx: RelationContext, body: Link): [Joint, Joint] | undefined {
  const joints = jointsOf(ctx, body);
  const pivot = joints.find(isGroundPin);
  if (!pivot) return undefined;
  const g = ctx.samples.paths.get(pivot.id)![0];
  let best: { a: Joint; b: Joint; between: number } | undefined;
  const arms = joints.filter((j) => j !== pivot);
  for (let i = 0; i < arms.length; i++)
    for (let k = i + 1; k < arms.length; k++) {
      const p = ctx.samples.paths.get(arms[i].id)![0];
      const q = ctx.samples.paths.get(arms[k].id)![0];
      let between =
        Math.abs(deg(Math.atan2(p[1] - g[1], p[0] - g[0]) - Math.atan2(q[1] - g[1], q[0] - g[0]))) %
        360;
      if (between > 180) between = 360 - between;
      if (between >= 150 && (!best || between > best.between))
        best = { a: arms[i], b: arms[k], between };
    }
  return best && [best.a, best.b];
}

/**
 * The pivoted bodies a rod ties together: each shares a moving joint with the
 * rod and goes round its ground pivot (a full turn, or most of one and back
 * when the input reverses). Two or more, with a rod that keeps its angle, are
 * cranks coupled by a side rod, as a locomotive's wheels are.
 */
export function cranksCoupledBy(ctx: RelationContext, rod: Link): Link[] {
  if (jointsOf(ctx, rod).some(isGroundPin) || sweepOf(ctx, rod) >= 0.5) return [];
  const pins = jointsOf(ctx, rod).filter((j) => !isGroundPin(j));
  return ctx.bodies.filter(
    (b) =>
      b !== rod &&
      jointsOf(ctx, b).some(isGroundPin) &&
      jointsOf(ctx, b).some((j) => pins.includes(j)) &&
      (turnsFully(ctx, b) || sweepOf(ctx, b) > 300)
  );
}

/**
 * Two arms of a pivoted body that meet at an angle at its pivot, each joined to
 * another part: a bell crank, which turns a push one way into a push another.
 * Arms nearly opposite each other make a beam instead (`beamArms`).
 */
export function bellCrankArms(
  ctx: RelationContext,
  body: Link
): { arms: [Joint, Joint]; between: number } | undefined {
  const joints = jointsOf(ctx, body);
  const pivot = joints.find(isGroundPin);
  if (!pivot) return undefined;
  const g = ctx.samples.paths.get(pivot.id)![0];
  const joined = (j: Joint) =>
    ctx.bodies.some((b) => b !== body && jointsOf(ctx, b).includes(j)) ||
    ctx.cylinders.some((c) => c.mountA === j || c.mountB === j);
  const arms = joints.filter((j) => j !== pivot && joined(j));
  let best: { arms: [Joint, Joint]; between: number } | undefined;
  for (let i = 0; i < arms.length; i++)
    for (let k = i + 1; k < arms.length; k++) {
      const p = ctx.samples.paths.get(arms[i].id)![0];
      const q = ctx.samples.paths.get(arms[k].id)![0];
      let between =
        Math.abs(deg(Math.atan2(p[1] - g[1], p[0] - g[0]) - Math.atan2(q[1] - g[1], q[0] - g[0]))) %
        360;
      if (between > 180) between = 360 - between;
      if (between >= 45 && between <= 135)
        if (!best || Math.abs(between - 90) < Math.abs(best.between - 90))
          best = { arms: [arms[i], arms[k]], between };
    }
  return best;
}

/** "A and B", "A, B and C". */
export function listOf(items: string[]): string {
  return items.length < 2
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** How a body that keeps its orientation moves: in a straight line, or along an arc. */
function translation(ctx: RelationContext, body: Link): string {
  const joints = jointsOf(ctx, body);
  const path = ctx.samples.paths.get(joints[0].id)!;
  const line = fitLine(path);
  if (line.length < 1e-6) return 'does not move';
  if (line.maxOff / line.length < 0.002) {
    return `slides in a straight line at ${fmt(line.angle, 1)} deg without turning, moving ${fmt(line.length)} back and forth (straight-line translation)`;
  }
  const centre = ctx.visible
    .filter(isGroundPin)
    .map((g) => ({ g, at: ctx.samples.paths.get(g.id)![0] }))
    .map(({ g, at }) => {
      const radii = path.map(([x, y]) => Math.hypot(x - at[0], y - at[1]));
      const mean = radii.reduce((s, r) => s + r, 0) / radii.length;
      return { g, mean, spread: (Math.max(...radii) - Math.min(...radii)) / (mean || 1) };
    })
    .find((c) => c.mean > 1e-6 && c.spread < 0.002);
  const shape = centre
    ? `the same circular arc as ${joints[0].id} (radius ${fmt(centre.mean)} about ${centre.g.id})`
    : 'the same curved path';
  return `moves along a curve without turning: not in a straight line; every point of it traces ${shape}, shifted (curvilinear translation)`;
}

export function linkJobs(
  ctx: RelationContext,
  drivenBody: Link | undefined,
  driven: RealJoint | undefined,
  input: InputSeries | undefined,
  discs = false
): LinkJob[] {
  const jobs: LinkJob[] = [];
  const tracedJoints = traced(ctx);
  const grounds = ctx.visible.filter(isGroundPin);
  if (grounds.length) {
    const pairs: string[] = [];
    for (let a = 0; a < grounds.length; a++)
      for (let b = a + 1; b < grounds.length; b++)
        pairs.push(
          `${grounds[a].id}-${grounds[b].id} ${fmt(distAt(ctx.samples, grounds[a], grounds[b]))}`
        );
    jobs.push({
      name: 'ground',
      job: 'frame',
      motion: `fixed pivots ${grounds.map((g) => g.id).join(', ')}${pairs.length ? ` (apart: ${pairs.join('; ')})` : ''}`,
    });
  }

  for (const body of ctx.bodies) {
    const joints = jointsOf(ctx, body);
    if (joints.length < 2) continue;
    const name = ctx.bodyLabel(body);
    if (joints.every(isGroundPin)) {
      jobs.push({ name, job: 'part of the frame', motion: 'fixed to the ground' });
      continue;
    }
    const pivot = joints.find(isGroundPin);
    const sweep = sweepOf(ctx, body);
    const full = turnsFully(ctx, body);
    const isInput = body === drivenBody;
    const slotted = ctx.visible.some((j) => j instanceof PrisJoint && j.carrier === body);
    const onFixedGuide = joints.some((j) => j instanceof PrisJoint && j.ground);
    const beam = beamArms(ctx, body);
    const angles = bodyAngles(joints, ctx.samples)!;
    const pushedAt = ctx.cylinders
      .flatMap((c) => [c.mountA, c.mountB])
      .filter((m) => joints.includes(m) && !isGroundPin(m));
    let job: string;
    let motion: string;
    if (pivot) {
      if (full) {
        job = isInput ? 'input crank' : slotted ? 'slotted link' : 'crank';
        motion = `turns full revolutions about ground ${pivot.id}${angularSpeedSpread(angles, ctx.samples)}`;
      } else if (sweep > 300) {
        // Most of a turn and back: a wheel whose input reverses. "Rocks, with
        // its ends at the same input position" was true and said nothing.
        job = isInput ? 'input crank' : slotted ? 'slotted link' : 'crank';
        motion = `turns about ground ${pivot.id} through ${fmt(sweep, 0)} deg and then back the same way, because the input reverses`;
      } else {
        const bell = !beam && ctx.catalogV8 ? bellCrankArms(ctx, body) : undefined;
        job = isInput
          ? 'input rocker (driven back and forth)'
          : slotted
            ? 'slotted rocker'
            : beam
              ? 'beam (a rocker with arms on both sides of its pivot)'
              : bell
                ? 'bell crank (a rocker whose two arms meet at an angle at its pivot)'
                : 'rocker';
        motion =
          `rocks about ground ${pivot.id} through ${fmt(sweep, 1)} deg` +
          (isInput ? '' : endsAt(angles.map(deg), input)) +
          strokeTiming(angles, ctx.samples) +
          (bell && !isInput && !slotted
            ? `; its arms to ${bell.arms[0].id} and ${bell.arms[1].id} meet at ${fmt(bell.between, 0)} deg at the pivot, so a push on one comes out of the other at that angle`
            : '');
      }
    } else if (sweep < 0.5) {
      const coupled = ctx.catalogV8 && !slotted && !onFixedGuide ? cranksCoupledBy(ctx, body) : [];
      job = slotted
        ? 'yoke (carries the slot)'
        : onFixedGuide
          ? 'sliding link'
          : coupled.length >= 2
            ? 'side rod (a coupling rod)'
            : 'translating link';
      motion =
        (coupled.length >= 2
          ? `ties ${listOf(coupled.map(ctx.bodyLabel))} to turn together; `
          : '') + translation(ctx, body);
    } else {
      const toMovingPivot = joints.some(
        (j) =>
          !(j instanceof PrisJoint) &&
          ctx.bodies.some(
            (b) => b !== body && jointsOf(ctx, b).includes(j) && jointsOf(ctx, b).some(isGroundPin)
          )
      );
      job = onFixedGuide && toMovingPivot ? 'connecting rod' : 'coupler';
      motion = full
        ? 'has no fixed pivot; it turns full revolutions while it moves (general plane motion)'
        : `has no fixed pivot; it swings back and forth through ${fmt(sweep, 1)} deg while it moves (general plane motion)`;
    }
    if (isInput && driven && !pivot) job = `input link (driven at ${driven.id})`;
    if (pushedAt.length && !isInput)
      motion += `; the cylinder pushes it at ${pushedAt.map((j) => j.id).join(', ')}`;
    // A traced joint shared by two links is carried by one of them: the one
    // pinned to the ground if either is, since its path is that link's arc.
    const owner = (j: Joint) => {
      const holders = ctx.bodies.filter((b) => jointsOf(ctx, b).includes(j));
      return holders.find((b) => jointsOf(ctx, b).some(isGroundPin)) ?? holders[0];
    };
    const carried = tracedJoints.filter((j) => owner(j) === body);
    // Its author chose to draw it as a disc about its pivot: the app's way of
    // saying wheel or flywheel, and a strong hint of what the mechanism is.
    if (discs && body instanceof RealLink && body.isCircle && pivot)
      job += ', drawn by its author as a disc (a wheel or flywheel)';
    if (carried.length) job += `, carries traced point ${carried.map((j) => j.id).join(', ')}`;
    jobs.push({ name, job, motion });
  }

  for (const joint of ctx.visible) {
    if (!(joint instanceof PrisJoint)) continue;
    const path = ctx.samples.paths.get(joint.id);
    if (!path) continue;
    if (joint.ground) {
      const ux = Math.cos(joint.angle_rad);
      const uy = Math.sin(joint.angle_rad);
      const along = path.map(([x, y]) => x * ux + y * uy);
      const stroke = Math.max(...along) - Math.min(...along);
      const isInput = joint === driven;
      jobs.push({
        name: `slider ${joint.id}`,
        job: isInput ? 'input slider' : 'slider on a fixed guide',
        motion:
          `travels ${fmt(stroke)} back and forth along a fixed guide at ${fmt(deg(joint.angle_rad), 1)} deg` +
          (isInput ? '' : endsAt(along, input)) +
          strokeTiming(along, ctx.samples),
      });
    } else if (joint.carrier && joint.slotJointA && joint.slotJointB) {
      const a = ctx.samples.paths.get(joint.slotJointA.id)!;
      const b = ctx.samples.paths.get(joint.slotJointB.id)!;
      const along = path.map(([x, y], i) => {
        const dx = b[i][0] - a[i][0];
        const dy = b[i][1] - a[i][1];
        return ((x - a[i][0]) * dx + (y - a[i][1]) * dy) / (Math.hypot(dx, dy) || 1);
      });
      jobs.push({
        name: `pin ${joint.id}`,
        job: 'pin in a slot',
        motion: `slides ${fmt(Math.max(...along) - Math.min(...along))} back and forth within the slot on ${ctx.bodyLabel(joint.carrier)} (motion relative to that link, not an output stroke)`,
      });
    }
  }

  for (const cylinder of ctx.cylinders) {
    const a = ctx.samples.paths.get(cylinder.mountA.id)!;
    const b = ctx.samples.paths.get(cylinder.mountB.id)!;
    const spans = a.map((p, i) => Math.hypot(b[i][0] - p[0], b[i][1] - p[1]));
    const isInput = cylinder.seal === driven;
    jobs.push({
      name: `cylinder ${cylinder.mountA.id}-${cylinder.mountB.id}`,
      // The app draws the seal's letter on the cylinder's head, so the sheet names it too.
      job: `${isInput ? 'driven input (a linear actuator)' : 'cylinder'}; the block marked ${cylinder.seal.id} on it is the cylinder's own sliding seal, part of the cylinder and not a separate slider`,
      motion: `extends and retracts between lengths ${fmt(Math.min(...spans))} and ${fmt(Math.max(...spans))} (travel ${fmt(Math.max(...spans) - Math.min(...spans))})`,
    });
  }
  return jobs;
}
