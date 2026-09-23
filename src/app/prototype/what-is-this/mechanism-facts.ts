import { describeActuator, GROUND_BODY } from '../../model/actuator';
import { Cylinder, cylindersIn } from '../../model/cylinder';
import { turnsClockwise } from '../../model/drive-direction';
import { Force } from '../../model/force';
import { Joint, PrisJoint, RealJoint } from '../../model/joint';
import { Link, RealLink } from '../../model/link';
import { Mechanism } from '../../model/mechanism/mechanism';
import { MechanismPartition, partitionMechanisms } from '../../model/mechanism/mechanism-partition';
import { MODEL_SCALE } from '../../model/render-scale';

/**
 * PROTOTYPE -- "What is this?" fact sheet.
 *
 * Turns a drawing into the plain-text measurements an LLM is given in place of
 * the drawing itself: structure, the input, how every body and point actually
 * moves over one solved cycle, and the start geometry. Everything here is read
 * from the solver's samples; nothing is inferred from a template's name.
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
}

const deg = (rad: number) => (rad * 180) / Math.PI;
const fmt = (value: number, digits = 2) => {
  const rounded = Number(value.toFixed(digits));
  return Object.is(rounded, -0) ? '0' : String(rounded);
};

interface Samples {
  mechanism: Mechanism;
  /** Joint id -> [x, y] per sample, in the reader's length unit, y up. */
  paths: Map<string, [number, number][]>;
  time: number[];
  /** Seconds for one full input revolution, when the input turns fully. */
  period?: number;
}

/** The whole fact sheet for every machine in the drawing. */
export function describeDrawing(drawing: DrawingToDescribe): string {
  const partitioning = partitionMechanisms(drawing.joints, drawing.links, drawing.forces);
  const lines: string[] = [];
  lines.push(
    `Length unit: ${drawing.lengthUnit}. Angles in degrees, counterclockwise from +x; y points up.`
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
    lines.push(...describePartition(partition, drawing));
  });
  return lines.join('\n');
}

function describePartition(partition: MechanismPartition, drawing: DrawingToDescribe): string[] {
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
    return `body ${ids.join('-')}${named}`;
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
    lines.push(
      `- The simulator could NOT solve a motion (degrees of freedom ${mechanism.dof}; ` +
        `reason: ${mechanism.failure ?? 'unknown'}). Do not describe how it moves.`
    );
    return lines;
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
  return lines;
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
  if (joints.length < 2) return undefined;
  // The two joints farthest apart give the steadiest reading of orientation.
  let pair: [Joint, Joint] = [joints[0], joints[1]];
  for (const a of joints) for (const b of joints) if (dist(a, b) > dist(...pair)) pair = [a, b];
  const pa = samples.paths.get(pair[0].id)!;
  const pb = samples.paths.get(pair[1].id)!;
  const angles = unwrap(pa.map((p, i) => Math.atan2(pb[i][1] - p[1], pb[i][0] - p[0])));
  const low = Math.min(...angles);
  const high = Math.max(...angles);
  const sweep = deg(high - low);
  const pivot = joints.find((j) => grounds.includes(j));
  const name = bodyLabel(body);
  if (joints.every((j) => grounds.includes(j))) return `- ${name} is fixed to the ground.`;
  if (sweep < 0.5) {
    return `- ${name} translates without rotating (orientation constant within ${fmt(sweep, 2)} deg).`;
  }
  const fullTurn = !samples.mechanism.reciprocates && sweep > 300;
  const around = pivot
    ? `about ground pivot ${label(pivot)}`
    : '(no fixed pivot: a floating coupler)';
  if (fullTurn) {
    return `- ${name} turns full revolutions ${around}${angularSpeedSpread(angles, samples)}.`;
  }
  const timing = strokeTiming(angles, samples);
  return (
    `- ${name} rocks ${around} through ${fmt(sweep, 1)} deg` +
    ` (from ${fmt(deg(low), 1)} to ${fmt(deg(high), 1)} deg)` +
    `${timing}.`
  );
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
  const guide = slider.ground
    ? 'its fixed guide'
    : `its guide on ${slider.carrier ? bodyLabel(slider.carrier) : 'a moving body'}`;
  return `- Slider ${label(slider)} travels ${fmt(stroke)} along ${guide}${strokeTiming(along, samples)}.`;
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
  const straight = longestStraightRun(path, closed);
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

function fitLine(points: [number, number][]) {
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

/**
 * The longest stretch of consecutive samples that stays within 0.5% of its own
 * chord length from that chord -- the "straight-line" part of a coupler curve.
 */
function longestStraightRun(path: [number, number][], closed: boolean) {
  const n = path.length;
  const at = (i: number) => path[closed ? i % n : Math.min(i, n - 1)];
  const limit = closed ? n : n - 1;
  let best: { start: number; end: number; length: number } | undefined;
  for (let start = 0; start < limit; start++) {
    let end = start + 2;
    while (end - start < limit) {
      const a = at(start);
      const b = at(end);
      const chord = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (chord < 1e-9) break;
      let worst = 0;
      for (let k = start + 1; k < end; k++) {
        const p = at(k);
        worst = Math.max(
          worst,
          Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / chord
        );
      }
      if (worst / chord > 0.005) break;
      if (!best || chord > best.length) best = { start, end, length: chord };
      end++;
    }
  }
  if (!best) return undefined;
  const a = at(best.start);
  const b = at(best.end);
  let worst = 0;
  for (let k = best.start + 1; k < best.end; k++) {
    const p = at(k);
    worst = Math.max(
      worst,
      Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / best.length
    );
  }
  return {
    length: best.length,
    fraction: (best.end - best.start) / n,
    angle: ((deg(Math.atan2(b[1] - a[1], b[0] - a[0])) % 180) + 180) % 180,
    maxOffPercent: (worst / best.length) * 100,
  };
}

/** Crossings between non-neighbouring segments of a closed path. */
function countSelfCrossings(path: [number, number][]): number {
  const n = path.length;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const a = path[i];
    const b = path[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const c = path[j];
      const d = path[(j + 1) % n];
      if (segmentsCross(a, b, c, d)) count++;
    }
  }
  return count;
}

function segmentsCross(a: number[], b: number[], c: number[], d: number[]): boolean {
  const cross = (o: number[], p: number[], q: number[]) =>
    (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

function unwrap(angles: number[]): number[] {
  const out = [angles[0]];
  for (let i = 1; i < angles.length; i++) {
    let delta = angles[i] - angles[i - 1];
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    out.push(out[i - 1] + delta);
  }
  return out;
}

/** A fixed pin of the frame; a slider on a fixed guide is flagged ground too, and is not one. */
function isGroundPin(joint: Joint): boolean {
  return joint instanceof RealJoint && joint.ground && !(joint instanceof PrisJoint);
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
