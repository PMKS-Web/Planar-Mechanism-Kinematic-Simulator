import { Joint, PrisJoint, RealJoint } from '../joint';
import { Link, RealLink } from '../link';
import { GROUND_BODY, resolveActuator } from '../actuator';
import type { Mechanism } from './mechanism';
import {
  CenterGeometry,
  centerId,
  determineInstantCenters,
  ProjectivePoint,
} from './instant-center-solver';

export interface InstantCenterRates {
  method: 'instant-center';
  status: 'ok' | 'unavailable';
  reason?: string;
  geometry: CenterGeometry;
  jointVel: Map<string, [number, number]>;
  linkVel: Map<string, [number, number]>;
  linkAngVel: Map<string, number>;
}

const samples = new WeakMap<Mechanism, Map<number, { rate: number; result: InstantCenterRates }>>();

/** Shared by the preview and analysis consumers; reversing or respeeding invalidates a sample. */
export function instantCenterRatesAt(
  mechanism: Mechanism,
  index: number
): InstantCenterRates | undefined {
  if (!mechanism.joints[index] || !mechanism.links[index]) return undefined;
  let frames = samples.get(mechanism);
  if (!frames) {
    frames = new Map();
    samples.set(mechanism, frames);
  }
  const rate = mechanism.inputAngularVelocities[index];
  const cached = frames.get(index);
  if (cached?.rate === rate) return cached.result;
  const result = solveInstantCenterVelocities(
    mechanism.joints[index],
    mechanism.links[index],
    rate
  );
  frames.set(index, { rate, result });
  return result;
}

/** Rank-revealing elimination: a singular pose must not acquire a plausible least-squares rate. */
function uniqueSolution(rows: number[][], count: number): number[] | undefined {
  const matrix = rows.map((row) => {
    const size = Math.max(...row.slice(0, count).map(Math.abs));
    return size > 1e-12 ? row.map((value) => value / size) : [...row];
  });
  let rank = 0;
  for (let column = 0; column < count; column++) {
    let pivot = rank;
    for (let r = rank; r < matrix.length; r++) {
      if (Math.abs(matrix[r][column]) > Math.abs(matrix[pivot]?.[column] ?? 0)) pivot = r;
    }
    if (Math.abs(matrix[pivot]?.[column] ?? 0) < 1e-9) return undefined;
    [matrix[rank], matrix[pivot]] = [matrix[pivot], matrix[rank]];
    const divisor = matrix[rank][column];
    matrix[rank] = matrix[rank].map((v) => v / divisor);
    for (let r = 0; r < matrix.length; r++) {
      if (r === rank) continue;
      const factor = matrix[r][column];
      matrix[r] = matrix[r].map((v, c) => v - factor * matrix[rank][c]);
    }
    rank++;
  }
  const answer = matrix.slice(0, count).map((row) => row[count]);
  if (!answer.every(Number.isFinite)) return undefined;
  const consistent = rows.every((row) => {
    const terms = answer.map((v, c) => v * row[c]);
    return (
      Math.abs(terms.reduce((a, b) => a + b, 0) - row[count]) <=
      1e-7 * Math.max(1, Math.abs(row[count]), ...terms.map(Math.abs))
    );
  });
  return consistent ? answer : undefined;
}

/**
 * Each body's ground IC fixes its velocity field up to one multiplier:
 * v(x,y) = q (cy - w*y, w*x - cx), omega = q*w.
 * w = 0 is pure translation. Equal velocities at pair ICs and the prescribed
 * input determine the multipliers independently of closed-loop equations.
 * Accelerations are intentionally absent: a zero-velocity center need not
 * have zero acceleration.
 */
export function solveInstantCenterVelocities(
  joints: Joint[],
  links: Link[],
  inputRate: number
): InstantCenterRates {
  const geometry = determineInstantCenters(joints, links);
  const result: InstantCenterRates = {
    method: 'instant-center',
    status: 'unavailable',
    geometry,
    jointVel: new Map(),
    linkVel: new Map(),
    linkAngVel: new Map(),
  };
  const refuse = (reason: string) => {
    result.reason = reason;
    return result;
  };
  const inputs = joints.filter((j) => j instanceof RealJoint && j.input);
  const actuator = inputs.length === 1 ? resolveActuator(inputs[0]) : undefined;
  if (!actuator || !Number.isFinite(inputRate))
    return refuse('IC velocities need one defined input. Set an input in Edit mode.');
  const moving = geometry.bodies.filter((id) => id !== GROUND_BODY);
  const centers = new Map(geometry.centers.map((c) => [c.id, c]));
  const bases = new Map<string, ProjectivePoint>([[GROUND_BODY, [0, 0, 0]]]);
  for (const body of moving) {
    const point = centers.get(centerId(GROUND_BODY, body))?.point;
    if (!point)
      return refuse(
        'Kennedy construction cannot locate every ground IC at this pose. Try another pose or use the current solver.'
      );
    bases.set(body, point);
  }
  const rows: number[][] = [];
  const add = (a: string, b: string, ca: number, cb: number, rhs = 0) => {
    const row = Array(moving.length + 1).fill(0);
    if (a !== GROUND_BODY) row[moving.indexOf(a)] += ca;
    if (b !== GROUND_BODY) row[moving.indexOf(b)] -= cb;
    row[moving.length] = rhs;
    rows.push(row);
  };
  const field = (body: string, p: ProjectivePoint): [number, number] => {
    const [cx, cy, w] = bases.get(body)!;
    return [cy * p[2] - w * p[1], w * p[0] - cx * p[2]];
  };
  for (const center of geometry.centers) {
    if (!center.point || center.bodies.includes(GROUND_BODY)) continue;
    const [a, b] = center.bodies;
    if (center.location === 'infinite') {
      add(a, b, bases.get(a)![2], bases.get(b)![2]);
      const va = field(a, [0, 0, 1]);
      const vb = field(b, [0, 0, 1]);
      const [dx, dy] = center.point;
      add(a, b, dx * va[0] + dy * va[1], dx * vb[0] + dy * vb[1]);
    } else {
      const va = field(a, center.point);
      const vb = field(b, center.point);
      add(a, b, va[0], vb[0]);
      add(a, b, va[1], vb[1]);
    }
  }
  const bodyId = (body: Link | typeof GROUND_BODY) =>
    body === GROUND_BODY ? GROUND_BODY : geometry.bodyOf.get(body.id)!;
  // A positive slider command advances the block along slotAngle, whether
  // the guide is grounded or floating. The actuator's incident-body order is
  // reversed on a floating slot, so it cannot define the sign of travel.
  const slider = actuator.joint instanceof PrisJoint ? actuator.joint : undefined;
  const drivenLink = slider
    ? links.find((link) => link.joints.some((joint) => joint.id === slider.id))
    : actuator.drivenBody;
  if (!drivenLink) return refuse('The driven slider has no block in this pose.');
  const driven = bodyId(drivenLink);
  const reference = bodyId(slider ? (slider.carrier ?? GROUND_BODY) : actuator.referenceBody);
  if (!bases.has(driven) || !bases.has(reference))
    return refuse('The input bodies are not available for IC analysis.');
  if (actuator.kind === 'angle') {
    add(driven, reference, bases.get(driven)![2], bases.get(reference)![2], inputRate);
  } else {
    const joint = actuator.joint as PrisJoint;
    const p: ProjectivePoint = [
      (joint.x - geometry.origin[0]) / geometry.scale,
      (joint.y - geometry.origin[1]) / geometry.scale,
      1,
    ];
    const projection = (body: string) => {
      const v = field(body, p);
      return v[0] * Math.cos(joint.slotAngle) + v[1] * Math.sin(joint.slotAngle);
    };
    add(driven, reference, projection(driven), projection(reference), inputRate / geometry.scale);
  }
  const rates = uniqueSolution(rows, moving.length);
  if (!rates)
    return refuse(
      'IC velocity ratios are singular or inconsistent at this pose. Try another pose or use the current solver.'
    );
  const multipliers = new Map([
    [GROUND_BODY, 0],
    ...moving.map((id, i): [string, number] => [id, rates[i]]),
  ]);
  const velocity = (body: string, x: number, y: number): [number, number] => {
    const v = field(body, [
      (x - geometry.origin[0]) / geometry.scale,
      (y - geometry.origin[1]) / geometry.scale,
      1,
    ]);
    return v.map((value) => value * multipliers.get(body)! * geometry.scale) as [number, number];
  };
  for (const link of links) {
    const body = geometry.bodyOf.get(link.id)!;
    result.linkAngVel.set(link.id, bases.get(body)![2] * multipliers.get(body)!);
    if (link instanceof RealLink)
      result.linkVel.set(link.id, velocity(body, link.CoM.x, link.CoM.y));
    for (const joint of link.joints)
      result.jointVel.set(joint.id, velocity(body, joint.x, joint.y));
  }
  result.status = 'ok';
  return result;
}
