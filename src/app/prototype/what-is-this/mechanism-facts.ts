import { describeActuator, GROUND_BODY } from '../../model/actuator';
import { cylindersIn } from '../../model/cylinder';
import { turnsClockwise } from '../../model/drive-direction';
import { Force } from '../../model/force';
import { Joint, PrisJoint, RealJoint } from '../../model/joint';
import { Link, RealLink } from '../../model/link';
import { Mechanism } from '../../model/mechanism/mechanism';
import { MechanismPartition, partitionMechanisms } from '../../model/mechanism/mechanism-partition';
import { MODEL_SCALE } from '../../model/render-scale';
import { drawingSvg } from './drawing-svg';
import {
  countSelfCrossings,
  dist,
  fitLine,
  fmt,
  isGroundPin,
  longestStraightRun,
  Samples,
  unwrap,
  deg,
} from './fact-math';
import { FamilyMatch, familyCheck } from './family-check';
import { MachineMotion, machineMotion } from './motion-export';
import { describeRelations, RelationContext } from './relations';
import { inputAt, InputSeries, inputSeries, LinkJob, linkJobs } from './roles';

/**
 * PROTOTYPE -- "What is this?" fact sheet, v4.
 *
 * Turns a mechanism into the plain-text facts an LLM is given in place of the
 * mechanism itself. The app does the reasoning and states conclusions: which
 * link is the crank and which the coupler, which named family the lengths and
 * joints match, where each rocker's ends fall in terms of the input angle. The
 * model only has to put that into words and bring what it knows about where
 * such mechanisms are used. Everything is read from the solver's samples;
 * nothing is inferred from a template's name.
 *
 * The sheet speaks the app's language: "this mechanism", "link AB", "driven",
 * never "the drawing" (docs/ui-vocabulary.md).
 *
 * Not wired into the app. See `docs/llm-features-plan.md`.
 */

export interface DrawingToDescribe {
  joints: Joint[];
  links: Link[];
  forces: Force[];
  lengthUnit: 'cm' | 'in' | 'm';
  gravity: boolean;
  /** The document-wide speed a joint with driveSpeed 0 falls back to. */
  defaultRpm: number;
  defaultLinearSpeed: number;
  defaultClockwise: boolean;
  /** Author-given joint and link names are hints, and can leak the answer. */
  includeNames?: boolean;
  /** Add the "How the parts relate" section. */
  relations?: boolean;
  /**
   * The author's background image sits behind the mechanism and is in the
   * picture. Said in the sheet, so the model knows the photograph is a hint and
   * not part of the mechanism.
   */
  backdrop?: boolean;
}

/** One of the picture's moments: when it is, and what the input reads then. */
export interface FilmFrame {
  time: number;
  label: string;
}

export interface MachineDescription {
  svg?: string;
  motion?: MachineMotion;
  jobs: LinkJob[];
  family: FamilyMatch[];
  frames: FilmFrame[];
}

export interface DrawingDescription {
  text: string;
  /** Start pose and traced paths of each solvable machine, one SVG per machine. */
  svgs: string[];
  /** Each solvable machine's motion, for a page to animate. Not sent to the model. */
  motions: MachineMotion[];
  machines: MachineDescription[];
}

/** The whole fact sheet for every mechanism on the grid. */
export function describeDrawing(drawing: DrawingToDescribe): DrawingDescription {
  const partitioning = partitionMechanisms(drawing.joints, drawing.links, drawing.forces);
  const lines: string[] = [];
  const machines: MachineDescription[] = [];
  lines.push('Facts PMKS+ computed from its own solution of this mechanism.');
  lines.push(
    `Length unit: ${drawing.lengthUnit}. Angles in degrees, counterclockwise from +x; y points up.`
  );
  lines.push(
    'Links are named by their joints’ letters, as in the app’s Links table: link AB joins joints A and B.'
  );
  const count = partitioning.mechanisms.length;
  if (count > 1) lines.push(`There are ${count} separate mechanisms on the grid, M1 to M${count}.`);
  const loose = partitioning.unassigned.looseJoints.length;
  const floating = partitioning.unassigned.floatingChains.length;
  if (loose || floating) {
    lines.push(
      `Unconnected pieces: ${loose} loose joints, ${floating} floating chains (not part of any mechanism).`
    );
  }
  partitioning.mechanisms.forEach((partition, index) => {
    lines.push('');
    lines.push(`## Mechanism M${index + 1}`);
    const described = describePartition(partition, drawing);
    lines.push(...described.lines);
    machines.push(described);
  });
  return {
    text: lines.join('\n'),
    svgs: machines.flatMap((m) => (m.svg ? [m.svg] : [])),
    motions: machines.flatMap((m) => (m.motion ? [m.motion] : [])),
    machines,
  };
}

function describePartition(
  partition: MechanismPartition,
  drawing: DrawingToDescribe
): MachineDescription & { lines: string[] } {
  const own = new Set(partition.ownJoints.map((joint) => joint.id));
  const cylinders = cylindersIn(partition.joints).filter((c) => own.has(c.seal.id));
  // A cylinder's seal and buried inner end are internal; a reader only ever
  // sees its two mounts, so the facts only ever name those.
  const hidden = new Set(cylinders.flatMap((c) => [c.seal.id, c.inner.id]));
  const visible = partition.ownJoints.filter((joint) => !hidden.has(joint.id));
  const bodies = partition.links.filter(
    (link) =>
      link.joints.some((joint) => own.has(joint.id)) &&
      !cylinders.some((c) => c.barrel === link || c.rod === link)
  );
  const label = (joint: Joint) =>
    drawing.includeNames && joint.name !== joint.id ? `${joint.id} ("${joint.name}")` : joint.id;
  const bodyLabel = (link: Link) => {
    const ids = link.joints.filter((joint) => !hidden.has(joint.id)).map((joint) => joint.id);
    const named = drawing.includeNames && link.name !== link.id ? ` ("${link.name}")` : '';
    return `link ${ids.join('')}${named}`;
  };

  const lines: string[] = ['### At a glance'];
  const drivers = partition.ownJoints.filter(
    (joint): joint is RealJoint => joint instanceof RealJoint && joint.input
  );
  const driven = drivers[0];
  const signedSpeed =
    driven && driven.driveSpeed !== 0
      ? driven.driveSpeed
      : (drawing.defaultClockwise ? -1 : 1) *
        (driven instanceof PrisJoint ? drawing.defaultLinearSpeed : drawing.defaultRpm);
  const mechanism = new Mechanism(
    partition.joints,
    partition.links,
    partition.forces,
    [],
    drawing.gravity,
    drawing.lengthUnit,
    driven instanceof PrisJoint ? signedSpeed * MODEL_SCALE : (signedSpeed * Math.PI) / 30,
    'adaptive',
    own
  );

  const actuator = driven ? describeActuator(driven) : undefined;
  const drivenBody =
    actuator && typeof actuator !== 'string' && actuator.drivenBody !== GROUND_BODY
      ? actuator.drivenBody
      : undefined;
  lines.push(`- ${inputSentence()}`);
  if (drivers.length > 1) {
    lines.push(`- ${drivers.length} joints are set as inputs: ${drivers.map(label).join(', ')}.`);
  }

  if (!mechanism.isMechanismValid() || mechanism.joints.length < 2) {
    // "Could not solve" is about the mechanism as it stands, not the machine it
    // is meant to be: models read "do not describe how it moves" as "it cannot move".
    lines.push(
      `- PMKS+ could not solve this mechanism's motion as it stands (Gruebler count ` +
        `${mechanism.dof} degrees of freedom; solver's reason: ${mechanism.failure ?? 'unknown'}). ` +
        'That says nothing about whether the intended machine can move; no motion facts follow.'
    );
    lines.push(`- Links: ${bodies.map(bodyLabel).join(', ')}.`);
    lines.push(`- Ground pivots: ${visible.filter(isGroundPin).map(label).join(', ') || 'none'}.`);
    if (drawing.backdrop) lines.push(BACKDROP_LINE);
    // Still a picture, of the mechanism as it stands: a stuck drawing is the
    // one a student most wants explained.
    const still = stillSamples(visible);
    lines.push('### The picture: this mechanism as drawn (PMKS+ could not move it)');
    lines.push(...describeStartGeometry(visible, bodies, label, bodyLabel, hidden, cylinders));
    return {
      lines,
      jobs: [],
      family: [],
      frames: [{ time: 0, label: 'as drawn; PMKS+ could not solve its motion' }],
      motion: machineMotion({ bodies, visible, hidden, cylinders, samples: still }),
    };
  }

  const samples = collectSamples(mechanism, driven, signedSpeed);
  const period = samples.time[samples.time.length - 1] - samples.time[0];
  lines.push(
    `- Degrees of freedom: ${mechanism.dof}. ` +
      (mechanism.reciprocates
        ? `The input runs to a limit and reverses, so every part moves back and forth; one full back-and-forth takes ${fmt(period)} s.`
        : `The motion repeats every ${fmt(period)} s, once per input revolution.`)
  );
  const ctx: RelationContext = { bodies, visible, hidden, samples, cylinders, label, bodyLabel };
  if (drawing.backdrop) lines.push(BACKDROP_LINE);
  const tracedHere = visible.filter(
    (j) => j instanceof RealJoint && j.showCurve && !isGroundPin(j)
  );
  if (tracedHere.length) {
    const on = (j: Joint) => {
      const body = bodies.find((b) => b.joints.includes(j));
      return body ? ` (on ${bodyLabel(body)})` : '';
    };
    lines.push(
      `- Traced points: ${tracedHere.map((j) => `${label(j)}${on(j)}`).join(', ')}. The author chose to show these paths, so they are probably the outputs this mechanism exists for.`
    );
  }

  const family = familyCheck(ctx);
  lines.push(...family.lines);

  const input = inputSeries(ctx, driven);
  const jobs = linkJobs(ctx, drivenBody, driven, input);
  lines.push('### Links and their jobs');
  for (const job of jobs) lines.push(`- ${job.name} — ${job.job}: ${job.motion}.`);

  if (drawing.relations) lines.push(...describeRelations(ctx));

  lines.push('### Paths of moving points');
  const grounds = visible.filter(isGroundPin);
  for (const joint of visible) {
    if (isGroundPin(joint)) continue;
    lines.push(describePath(joint, samples, grounds, label, mechanism.reciprocates));
  }

  const frames = filmFrames(samples, mechanism.reciprocates, input);
  lines.push(
    '### The picture: this mechanism at four moments, numbered in time order' +
      (mechanism.reciprocates ? ' (1 and 4 are the two ends of its travel)' : '')
  );
  frames.forEach((frame, i) => lines.push(`- ${i + 1}: ${frame.label}.`));

  lines.push(...describeStartGeometry(visible, bodies, label, bodyLabel, hidden, cylinders));

  const picture = { bodies, visible, hidden, cylinders, samples };
  return {
    lines,
    svg: drawingSvg(picture),
    motion: machineMotion(picture),
    jobs,
    family: family.matches,
    frames,
  };

  function inputSentence(): string {
    if (!driven) return 'Nothing is driven.';
    const cylinder = cylinders.find((c) => c.seal === driven);
    const speed =
      driven instanceof PrisJoint
        ? `${fmt(Math.abs(signedSpeed))} ${drawing.lengthUnit}/s`
        : `${fmt(Math.abs(signedSpeed))} rpm ${turnsClockwise(signedSpeed) ? 'clockwise' : 'counterclockwise'}`;
    if (cylinder) {
      return `Driven input: the cylinder between ${label(cylinder.mountA)} and ${label(cylinder.mountB)}, which extends and retracts at ${speed}.`;
    }
    if (typeof actuator === 'string') {
      return `Driven input: joint ${label(driven)}, which PMKS+ refuses as an input (${actuator}).`;
    }
    const turned =
      actuator!.drivenBody === GROUND_BODY ? 'the ground' : bodyLabel(actuator!.drivenBody);
    const against =
      actuator!.referenceBody === GROUND_BODY ? 'the ground' : bodyLabel(actuator!.referenceBody);
    return actuator!.kind === 'angle'
      ? `Driven input: joint ${label(driven)} turns ${turned} relative to ${against} at ${speed}.`
      : `Driven input: slider ${label(driven)} pushes ${turned} along its guide at ${speed}.`;
  }
}

const BACKDROP_LINE =
  '- A background image sits behind this mechanism in the picture: the author placed it there as a reference, often a photograph or drawing of the real machine. It is not part of the mechanism.';

/** One frame of the joints where they are drawn, for a mechanism PMKS+ could not move. */
function stillSamples(visible: Joint[]): Samples {
  const paths = new Map<string, [number, number][]>();
  for (const joint of visible)
    paths.set(joint.id, [[joint.x / MODEL_SCALE, joint.y / MODEL_SCALE]]);
  return { mechanism: undefined as unknown as Mechanism, paths, time: [0] };
}

/**
 * When the picture's four frames are. A full turn is shown at its quarters. A
 * back-and-forth motion is shown from one end of its travel to the other, which
 * is the part of its cycle a still picture otherwise hides.
 */
function filmFrames(samples: Samples, reciprocates: boolean, input?: InputSeries): FilmFrame[] {
  const time = samples.time;
  const n = time.length;
  const at = (t: number) => {
    let best = 0;
    time.forEach((v, i) => {
      if (Math.abs(v - t) < Math.abs(time[best] - t)) best = i;
    });
    return best;
  };
  let picks: number[];
  if (!reciprocates || !input) {
    const period = time[n - 1] - time[0];
    picks = [0, 0.25, 0.5, 0.75].map((f) => at(time[0] + f * period));
  } else {
    let lo = 0;
    let hi = 0;
    input.values.forEach((v, i) => {
      if (v < input.values[lo]) lo = i;
      if (v > input.values[hi]) hi = i;
    });
    const [first, last] = lo < hi ? [lo, hi] : [hi, lo];
    const span = time[last] - time[first];
    picks = [first, at(time[first] + span / 3), at(time[first] + (2 * span) / 3), last];
  }
  return picks.map((i) => ({
    time: time[i],
    label: `${fmt(time[i], 2)} s${input ? `, ${input.what} ${inputAt(input, i)}` : ''}`,
  }));
}

/**
 * Joint positions and the lengths that fix the shape, for reference. A body
 * with many points gives only the lengths between the joints that connect it
 * and each point's distance to those, not every pair.
 */
function describeStartGeometry(
  visible: Joint[],
  bodies: Link[],
  label: (joint: Joint) => string,
  bodyLabel: (link: Link) => string,
  hidden: Set<string>,
  cylinders: { mountA: Joint; mountB: Joint }[]
): string[] {
  const lines = ['### Geometry at the start, for reference'];
  lines.push(
    '- Joints: ' +
      visible
        .map(
          (j) =>
            `${label(j)} (${fmt(j.x / MODEL_SCALE)}, ${fmt(j.y / MODEL_SCALE)})${isGroundPin(j) ? ' ground' : j instanceof PrisJoint ? ' slider' : ''}`
        )
        .join('; ') +
      '.'
  );
  const connects = (joint: Joint) =>
    isGroundPin(joint) ||
    joint instanceof PrisJoint ||
    bodies.filter((b) => b.joints.includes(joint)).length > 1 ||
    cylinders.some((c) => c.mountA === joint || c.mountB === joint);
  const len = (a: Joint, b: Joint) => `${a.id}-${b.id} ${fmt(dist(a, b) / MODEL_SCALE)}`;
  for (const body of bodies) {
    const joints = body.joints.filter((j) => !hidden.has(j.id));
    const pairs: string[] = [];
    if (joints.length <= 3) {
      for (let a = 0; a < joints.length; a++)
        for (let b = a + 1; b < joints.length; b++) pairs.push(len(joints[a], joints[b]));
    } else {
      const hubs = joints.filter(connects);
      for (let a = 0; a < hubs.length; a++)
        for (let b = a + 1; b < hubs.length; b++) pairs.push(len(hubs[a], hubs[b]));
      for (const point of joints.filter((j) => !hubs.includes(j)))
        for (const hub of hubs) pairs.push(len(hub, point));
    }
    const welded =
      body instanceof RealLink && body.subset.length
        ? ` (welded from ${body.subset.length} links)`
        : '';
    if (pairs.length) lines.push(`- ${bodyLabel(body)}${welded}: ${pairs.join('; ')}.`);
  }
  for (const slider of visible.filter((j): j is PrisJoint => j instanceof PrisJoint)) {
    lines.push(
      `- Slider ${label(slider)} is ${slider.rotates ? 'a pin in a slot (what rides it may turn)' : 'a block (what rides it keeps the guide’s angle)'}.`
    );
  }
  return lines;
}

function collectSamples(
  mechanism: Mechanism,
  driven: Joint | undefined,
  signedSpeed: number
): Samples {
  const paths = new Map<string, [number, number][]>();
  for (const frame of mechanism.joints) {
    for (const joint of frame) {
      const path = paths.get(joint.id) ?? [];
      path.push([joint.x / MODEL_SCALE, joint.y / MODEL_SCALE]);
      paths.set(joint.id, path);
    }
  }
  const period =
    !mechanism.reciprocates && driven && !(driven instanceof PrisJoint) && signedSpeed !== 0
      ? 60 / Math.abs(signedSpeed)
      : undefined;
  return { mechanism, paths, time: mechanism.timeNum.slice(0, mechanism.joints.length), period };
}

/** What shape a point's path is: still, circular, straight, or a curve. */
function describePath(
  joint: Joint,
  samples: Samples,
  grounds: Joint[],
  label: (joint: Joint) => string,
  reciprocates: boolean
): string {
  const path = samples.paths.get(joint.id)!;
  const traced = joint instanceof RealJoint && joint.showCurve ? ' (traced)' : '';
  const xs = path.map((p) => p[0]);
  const ys = path.map((p) => p[1]);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  const extent = Math.max(width, height);
  const name = `- ${label(joint)}${traced}:`;
  if (extent < 1e-4) return `${name} does not move.`;

  for (const ground of grounds) {
    const g = samples.paths.get(ground.id)![0];
    const radii = path.map(([x, y]) => Math.hypot(x - g[0], y - g[1]));
    const mean = radii.reduce((s, r) => s + r, 0) / radii.length;
    if (mean > 1e-6 && (Math.max(...radii) - Math.min(...radii)) / mean < 0.002) {
      const angles = unwrap(path.map(([x, y]) => Math.atan2(y - g[1], x - g[0])));
      const sweep = deg(Math.max(...angles) - Math.min(...angles));
      return sweep > 300 && !reciprocates
        ? `${name} full circle of radius ${fmt(mean)} about ${label(ground)}.`
        : `${name} circular arc of radius ${fmt(mean)} about ${label(ground)}, sweeping ${fmt(sweep, 1)} deg back and forth.`;
    }
  }

  const line = fitLine(path);
  if (line.length > 1e-6 && line.maxOff / line.length < 0.002) {
    return `${name} straight line at ${fmt(line.angle, 1)} deg, length ${fmt(line.length)} (back and forth).`;
  }

  const closed = !reciprocates;
  const crossings = closed ? countSelfCrossings(path) : 0;
  const straight = longestStraightRun(path, closed, samples.time);
  let text =
    `${name} ${closed ? 'closed curve' : 'curve traced back and forth'}, ` +
    `${fmt(width)} wide x ${fmt(height)} tall`;
  if (closed)
    text += crossings ? `, crosses itself ${crossings} time(s)` : ', does not cross itself';
  if (straight && straight.length >= 0.25 * extent) {
    text +=
      `; nearly straight for ${fmt(straight.fraction * 100, 0)}% of the cycle over ${fmt(straight.length)}` +
      ` (at ${fmt(straight.angle, 1)} deg, deviation within ${fmt(straight.maxOffPercent, 2)}% of that length)`;
  }
  return text + '.';
}
