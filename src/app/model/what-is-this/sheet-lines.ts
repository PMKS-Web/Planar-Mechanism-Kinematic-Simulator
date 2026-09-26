import { Force } from '../force';
import { Joint, PrisJoint, RealJoint } from '../joint';
import { Link, RealLink } from '../link';
import { MODEL_SCALE } from '../render-scale';
import {
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

/**
 * The fact sheet's reference lines: what shape each point's path is, the
 * loads the author placed, and the geometry at the start.
 */

/**
 * Whether a name is one a person typed. Old drawings carry link names that are
 * just the ids the link had before its joints were renamed ("ABC" on a link
 * now called ACN): capitals and digits only, never what somebody wrote.
 */
export function typed(name: string | undefined, id: string): boolean {
  return !!name && name !== id && !/^[A-Z][A-Z0-9]*$/.test(name);
}

/** What shape a point's path is: still, circular, straight, or a curve. */
export function describePath(
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

/**
 * The forces the author put on the mechanism, with their names: a load named
 * "Payload" or "Bucket" says what the mechanism is for. `start` is each force
 * as it stands at the start of the cycle, which the drawing's own may not be:
 * playback moves the drawing in place.
 */
export function describeLoads(
  forces: Force[],
  bodyLabel: (link: Link) => string,
  start: (force: Force) => Force = (force) => force
): string[] {
  if (!forces.length) return [];
  const lines = ['### Loads the author placed'];
  for (const force of forces) {
    const named = typed(force.name, force.id) ? ` ("${force.name}")` : '';
    const at = start(force).startCoord;
    lines.push(
      `- Force ${force.id}${named} on ${bodyLabel(force.link)} at (${fmt(at.x / MODEL_SCALE)}, ${fmt(at.y / MODEL_SCALE)}), magnitude ${fmt(force.mag)}, pointing at ${fmt(deg(start(force).angleRad), 0)} deg${force.local ? ' (turning with the link)' : ''}.`
    );
  }
  return lines;
}

/**
 * Joint positions and the lengths that fix the shape, for reference. A body
 * with many points gives only the lengths between the joints that connect it
 * and each point's distance to those, not every pair. `start` is where each
 * joint is at the start of the cycle, as `describeLoads` has it.
 */
export function describeStartGeometry(
  visible: Joint[],
  bodies: Link[],
  label: (joint: Joint) => string,
  bodyLabel: (link: Link) => string,
  hidden: Set<string>,
  cylinders: { mountA: Joint; mountB: Joint }[],
  start: (joint: Joint) => Joint = (joint) => joint
): string[] {
  const lines = ['### Geometry at the start, for reference'];
  lines.push(
    '- Joints: ' +
      visible
        .map(
          (j) =>
            `${label(j)} (${fmt(start(j).x / MODEL_SCALE)}, ${fmt(start(j).y / MODEL_SCALE)})${isGroundPin(j) ? ' ground' : j instanceof PrisJoint ? ' slider' : ''}`
        )
        .join('; ') +
      '.'
  );
  const connects = (joint: Joint) =>
    isGroundPin(joint) ||
    joint instanceof PrisJoint ||
    bodies.filter((b) => b.joints.includes(joint)).length > 1 ||
    cylinders.some((c) => c.mountA === joint || c.mountB === joint);
  const len = (a: Joint, b: Joint) =>
    `${a.id}-${b.id} ${fmt(dist(start(a), start(b)) / MODEL_SCALE)}`;
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
