import { describeActuator, GROUND_BODY } from '../../model/actuator';
import { Cylinder, cylindersIn } from '../../model/cylinder';
import { turnsClockwise } from '../../model/drive-direction';
import { Force } from '../../model/force';
import { Joint, PrisJoint, RealJoint } from '../../model/joint';
import { Link, RealLink } from '../../model/link';
import { Mechanism } from '../../model/mechanism/mechanism';
import { MechanismPartition, partitionMechanisms } from '../../model/mechanism/mechanism-partition';
import { MODEL_SCALE } from '../../model/render-scale';
import { drawingSvg } from './drawing-svg';
import { MachineMotion, machineMotion } from './motion-export';
import {
  bodyAngles,
  countSelfCrossings,
  deg,
  dist,
  fitLine,
  fmt,
  isGroundPin,
  longestStraightRun,
  Samples,
  unwrap,
} from './fact-math';
import { describeRelations } from './relations';

/**
 * PROTOTYPE -- "What is this?" fact sheet.
 *
 * Turns a drawing into the plain-text measurements an LLM is given in place of
 * the drawing itself: structure, the input, how every body and point actually
 * moves over one solved cycle, and the start geometry -- and, optionally, how
 * the parts relate and a picture. Everything is read from the solver's
 * samples; nothing is inferred from a template's name.
 *
 * Not wired into the app. See `docs/llm-features-plan.md` for what a real
 * version would have to add (fact IDs, a family catalog, verified wording).
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
}

export interface DrawingDescription {
  text: string;
  /** Start pose and traced paths of each solvable machine, one SVG per machine. */
  svgs: string[];
  /** Each solvable machine's motion, for a page to animate. Not sent to the model. */
  motions: MachineMotion[];
}

/** The whole fact sheet for every machine in the drawing. */
export function describeDrawing(drawing: DrawingToDescribe): DrawingDescription {
  const partitioning = partitionMechanisms(drawing.joints, drawing.links, drawing.forces);
  const lines: string[] = [];
  const svgs: string[] = [];
  const motions: MachineMotion[] = [];
  lines.push(
    `Length unit: ${drawing.lengthUnit}. Angles in degrees, counterclockwise from +x; y points up.`
  );
  lines.push(
    'Joints are single letters; a link is named by its joints’ letters, as in the app’s Links table (e.g. link AB).'
  );
  lines.push(`Gravity: ${drawing.gravity ? 'on' : 'off'}.`);
  lines.push(`Separate mechanisms in the drawing: ${partitioning.mechanisms.length}.`);
  const loose = partitioning.unassigned.looseJoints.length;
  const floating = partitioning.unassigned.floatingChains.length;
  if (loose || floating) {
    lines.push(
      `Unconnected pieces: ${loose} loose joints, ${floating} floating chains (not part of any machine).`
    );
  }
  partitioning.mechanisms.forEach((partition, index) => {
    lines.push('');
    lines.push(`## Mechanism M${index + 1}`);
    const described = describePartition(partition, drawing);
    lines.push(...described.lines);
    if (described.svg) svgs.push(described.svg);
    if (described.motion) motions.push(described.motion);
  });
  return { text: lines.join('\n'), svgs, motions };
}

function describePartition(
  partition: MechanismPartition,
  drawing: DrawingToDescribe
): { lines: string[]; svg?: string; motion?: MachineMotion } {
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

  const lines: string[] = [];
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

  lines.push(...describeStructure(partition, visible, bodies, cylinders, label, bodyLabel));
  lines.push(...describeStartGeometry(visible, bodies, label, bodyLabel, hidden));

  lines.push('### Input');
  if (!driven) {
    lines.push('- Nothing is driven.');
  } else {
    const actuator = describeActuator(driven);
    const cylinder = cylinders.find((c) => c.seal === driven);
    const what = cylinder
      ? `cylinder between ${label(cylinder.mountA)} and ${label(cylinder.mountB)} (extends/retracts)`
      : typeof actuator === 'string'
        ? `joint ${label(driven)} (refused as an input: ${actuator})`
        : `${actuator.kind === 'angle' ? 'rotary' : 'linear'} drive at joint ${label(driven)}, turning ${
            actuator.drivenBody === GROUND_BODY ? 'ground' : bodyLabel(actuator.drivenBody)
          } relative to ${actuator.referenceBody === GROUND_BODY ? 'the ground' : bodyLabel(actuator.referenceBody)}`;
    const speed =
      driven instanceof PrisJoint
        ? `${fmt(Math.abs(signedSpeed))} ${drawing.lengthUnit}/s`
        : `${fmt(Math.abs(signedSpeed))} rpm ${turnsClockwise(signedSpeed) ? 'clockwise' : 'counterclockwise'}`;
    lines.push(`- ${what}; speed ${speed}.`);
    if (drivers.length > 1) {
      lines.push(
        `- ${drivers.length} joints are marked as inputs: ${drivers.map(label).join(', ')}.`
      );
    }
  }

  lines.push('### Solved motion');
  if (!mechanism.isMechanismValid() || mechanism.joints.length < 2) {
    // "Could not solve" is about the drawing as it stands, not the machine: the
    // first sheet said "do not describe how it moves" and models read that as
    // "this mechanism cannot move".
    lines.push(
      `- The simulator could not solve this drawing's motion as it stands (Gruebler count ` +
        `${mechanism.dof} degrees of freedom; solver's reason: ${mechanism.failure ?? 'unknown'}). ` +
        'That says nothing about whether the intended machine can move; no motion facts follow.'
    );
    return { lines };
  }
  const samples = collectSamples(mechanism, driven, signedSpeed);
  lines.push(
    `- Degrees of freedom: ${mechanism.dof}. Solved ${samples.time.length} samples over ${fmt(
      mechanism.cyclePeriod
    )} s.`
  );
  lines.push(
    mechanism.reciprocates
      ? '- The input runs to a limit and reverses, so the whole motion is back-and-forth (a rotary input here cannot complete a revolution).'
      : '- The input runs continuously; the whole motion repeats once per input revolution.'
  );
  const grounds = visible.filter(isGroundPin);
  for (const body of bodies) {
    const fact = describeBodyMotion(body, samples, grounds, hidden, bodyLabel, label);
    if (fact) lines.push(fact);
  }
  for (const joint of visible) {
    if (joint instanceof PrisJoint) lines.push(describeSlider(joint, samples, bodyLabel, label));
  }
  for (const cylinder of cylinders) lines.push(describeCylinderTravel(cylinder, samples, label));

  lines.push('### Paths of moving points');
  for (const joint of visible) {
    if (isGroundPin(joint)) continue;
    lines.push(describePath(joint, samples, grounds, label, mechanism.reciprocates));
  }
  if (drawing.relations) {
    lines.push(
      ...describeRelations({ bodies, visible, hidden, samples, cylinders, label, bodyLabel })
    );
  }
  const picture = { bodies, visible, hidden, cylinders, samples };
  return { lines, svg: drawingSvg(picture), motion: machineMotion(picture) };
}

function describeStructure(
  partition: MechanismPartition,
  visible: Joint[],
  bodies: Link[],
  cylinders: Cylinder[],
  label: (joint: Joint) => string,
  bodyLabel: (link: Link) => string
): string[] {
  const lines = ['### Structure'];
  const groundPins = visible.filter(isGroundPin);
  const sliders = visible.filter((joint): joint is PrisJoint => joint instanceof PrisJoint);
  const welds = visible.filter((joint) => joint instanceof RealJoint && joint.isWelded);
  lines.push(`- Rigid bodies (moving links): ${bodies.length}.`);
  for (const body of bodies) {
    const parts =
      body instanceof RealLink && body.subset.length
        ? ` (welded compound of ${body.subset.length} bars)`
        : '';
    lines.push(
      `  - ${bodyLabel(body)}: joins ${body.joints.filter((j) => visible.includes(j)).length} joints${parts}.`
    );
  }
  lines.push(`- Ground pivots (fixed pins): ${groundPins.map(label).join(', ') || 'none'}.`);
  for (const slider of sliders) {
    const guide = slider.ground
      ? `a fixed guide at ${fmt(deg(slider.angle_rad), 1)} deg`
      : slider.carrier
        ? `a guide carried by moving ${bodyLabel(slider.carrier)} (slot from ${slider.slotJointA?.id} toward ${slider.slotJointB?.id})`
        : 'no guide (dangling)';
    const kind = slider.rotates
      ? 'pin-in-slot (the riding body may turn as it slides)'
      : 'prismatic (the riding body keeps the guide’s orientation)';
    lines.push(`- Slider ${label(slider)}: ${kind}, on ${guide}.`);
  }
  for (const cylinder of cylinders) {
    lines.push(
      `- Hydraulic/linear cylinder between mounts ${label(cylinder.mountA)} and ${label(cylinder.mountB)}.`
    );
  }
  if (welds.length) lines.push(`- Welded (rigid) joints: ${welds.map(label).join(', ')}.`);
  const frameShared = partition.joints.length - partition.ownJoints.length;
  if (frameShared > 0) lines.push(`- Shares ${frameShared} frame joints with another mechanism.`);
  return lines;
}

function describeStartGeometry(
  visible: Joint[],
  bodies: Link[],
  label: (joint: Joint) => string,
  bodyLabel: (link: Link) => string,
  hidden: Set<string>
): string[] {
  const lines = ['### Start geometry'];
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
  const grounds = visible.filter(isGroundPin);
  if (grounds.length > 1) {
    const pairs: string[] = [];
    for (let a = 0; a < grounds.length; a++)
      for (let b = a + 1; b < grounds.length; b++)
        pairs.push(
          `${grounds[a].id}-${grounds[b].id} ${fmt(dist(grounds[a], grounds[b]) / MODEL_SCALE)}`
        );
    lines.push(`- Distances between ground joints: ${pairs.join('; ')}.`);
  }
  for (const body of bodies) {
    const joints = body.joints.filter((j) => !hidden.has(j.id));
    const pairs: string[] = [];
    for (let a = 0; a < joints.length; a++)
      for (let b = a + 1; b < joints.length; b++)
        pairs.push(
          `${joints[a].id}-${joints[b].id} ${fmt(dist(joints[a], joints[b]) / MODEL_SCALE)}`
        );
    if (pairs.length) lines.push(`- ${bodyLabel(body)} lengths: ${pairs.join('; ')}.`);
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

/** How a body turns: fully, rocking about a pivot, translating, or floating. */
function describeBodyMotion(
  body: Link,
  samples: Samples,
  grounds: Joint[],
  hidden: Set<string>,
  bodyLabel: (link: Link) => string,
  label: (joint: Joint) => string
): string | undefined {
  const joints = body.joints.filter((j) => !hidden.has(j.id) && samples.paths.has(j.id));
  const angles = bodyAngles(joints, samples);
  if (!angles) return undefined;
  const low = Math.min(...angles);
  const high = Math.max(...angles);
  const sweep = deg(high - low);
  const pivot = joints.find((j) => grounds.includes(j));
  const name = bodyLabel(body);
  if (joints.every((j) => grounds.includes(j))) return `- ${name} is fixed to the ground.`;
  if (sweep < 0.5) return describeTranslation(name, joints, samples, sweep, label, grounds);
  const fullTurn = !samples.mechanism.reciprocates && sweep > 300;
  const around = pivot
    ? `about ground pivot ${label(pivot)}`
    : '(no fixed pivot: a floating coupler)';
  if (fullTurn) {
    return `- ${name} turns full revolutions ${around}${angularSpeedSpread(angles, samples)}.`;
  }
  return (
    `- ${name} rocks ${around} through ${fmt(sweep, 1)} deg` +
    ` (from ${fmt(deg(low), 1)} to ${fmt(deg(high), 1)} deg)` +
    `${strokeTiming(angles, samples)}.`
  );
}

/**
 * A body that keeps its orientation. Every point of it traces the same-shaped
 * path, so one point's path says whether it slides in a straight line or swings
 * along an arc -- the wiper's parallelogram coupler does the second, and "it
 * translates" alone was read as "it moves in a straight line".
 */
function describeTranslation(
  name: string,
  joints: Joint[],
  samples: Samples,
  sweep: number,
  label: (joint: Joint) => string,
  grounds: Joint[]
): string {
  const steady = `orientation constant within ${fmt(sweep, 2)} deg`;
  const path = samples.paths.get(joints[0].id)!;
  const line = fitLine(path);
  if (line.length < 1e-6) return `- ${name} does not move.`;
  if (line.maxOff / line.length < 0.002) {
    return `- ${name} translates in a straight line at ${fmt(line.angle, 1)} deg without rotating (${steady}); every point of it moves ${fmt(line.length)} back and forth.`;
  }
  const arc = grounds
    .map((ground) => ({ ground, fit: circleAbout(path, samples.paths.get(ground.id)![0]) }))
    .find((c) => c.fit);
  const shape = arc
    ? `the same circular arc as ${label(joints[0])}'s (radius ${fmt(arc.fit!.radius)} about ${label(arc.ground)})`
    : 'the same curved path';
  return `- ${name} translates along a curve without rotating (${steady}): it is not moving in a straight line; every point of it traces ${shape}, just shifted (curvilinear translation).`;
}

/** The radius of a path that stays a fixed distance from a point, if it does. */
function circleAbout(
  path: [number, number][],
  centre: [number, number]
): { radius: number } | undefined {
  const radii = path.map(([x, y]) => Math.hypot(x - centre[0], y - centre[1]));
  const mean = radii.reduce((s, r) => s + r, 0) / radii.length;
  return mean > 1e-6 && (Math.max(...radii) - Math.min(...radii)) / mean < 0.002
    ? { radius: mean }
    : undefined;
}

/** A body that turns fully but unevenly is a quick-return's tell. */
function angularSpeedSpread(angles: number[], samples: Samples): string {
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

function describeSlider(
  slider: PrisJoint,
  samples: Samples,
  bodyLabel: (link: Link) => string,
  label: (joint: Joint) => string
): string {
  const path = samples.paths.get(slider.id)!;
  let along: number[];
  if (slider.ground) {
    const ux = Math.cos(slider.angle_rad);
    const uy = Math.sin(slider.angle_rad);
    along = path.map(([x, y]) => x * ux + y * uy);
  } else if (slider.slotJointA && slider.slotJointB) {
    const a = samples.paths.get(slider.slotJointA.id)!;
    const b = samples.paths.get(slider.slotJointB.id)!;
    along = path.map(([x, y], i) => {
      const dx = b[i][0] - a[i][0];
      const dy = b[i][1] - a[i][1];
      const span = Math.hypot(dx, dy) || 1;
      return ((x - a[i][0]) * dx + (y - a[i][1]) * dy) / span;
    });
  } else {
    return `- Slider ${label(slider)}: no guide to measure travel against.`;
  }
  const stroke = Math.max(...along) - Math.min(...along);
  if (slider.ground) {
    return `- Slider ${label(slider)} travels ${fmt(stroke)} along its fixed guide${strokeTiming(along, samples)}.`;
  }
  // Sliding within a moving slot is relative motion, not an output stroke: its
  // equal times read as "no quick return" on the Whitworth, whose quick return
  // is in how the slotted link turns.
  const carrier = slider.carrier ? bodyLabel(slider.carrier) : 'a moving body';
  return `- Pin ${label(slider)} slides ${fmt(stroke)} back and forth within the slot on ${carrier}; this is motion relative to ${carrier}, not an output stroke.`;
}

function describeCylinderTravel(
  cylinder: Cylinder,
  samples: Samples,
  label: (joint: Joint) => string
): string {
  const a = samples.paths.get(cylinder.mountA.id)!;
  const b = samples.paths.get(cylinder.mountB.id)!;
  const spans = a.map((p, i) => Math.hypot(b[i][0] - p[0], b[i][1] - p[1]));
  return (
    `- Cylinder ${label(cylinder.mountA)}-${label(cylinder.mountB)} length ranges ` +
    `${fmt(Math.min(...spans))} to ${fmt(Math.max(...spans))} (extension ${fmt(Math.max(...spans) - Math.min(...spans))}).`
  );
}

/**
 * Time spent going min->max versus max->min, when the input turns steadily.
 * A back-and-forth input has no fixed drive law, so no ratio is claimed.
 */
function strokeTiming(values: number[], samples: Samples): string {
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

/** What shape a point's path is: still, circular, straight, or a curve. */
function describePath(
  joint: Joint,
  samples: Samples,
  grounds: Joint[],
  label: (joint: Joint) => string,
  reciprocates: boolean
): string {
  const path = samples.paths.get(joint.id)!;
  const traced =
    joint instanceof RealJoint && joint.showCurve ? ' [the author traces this point’s path]' : '';
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
