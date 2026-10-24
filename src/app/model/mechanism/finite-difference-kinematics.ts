import { transferCylinderRates } from './cylinder-rates';
import { Joint } from '../joint';
import { bodiesUnder, Link, RealLink } from '../link';

/**
 * Velocities and accelerations read off the solved positions, for the joints
 * and links the analytic rate solver leaves blank.
 *
 * The rate solver walks the same chains of dyads the position walk does, so a
 * mechanism the position solver had to settle all at once (the gripper on
 * rails: a carriage, four links and two jaws with nothing any two known
 * joints locate) solves its poses and then has no rates at all -- every
 * velocity graph a row of gaps over a mechanism that visibly moves. The poses
 * are sampled a degree of input apart, which is dense enough that a central
 * difference is a perfectly good velocity, and the force solver has trusted
 * the same difference for its accelerations since the day it existed.
 *
 * Only the blanks are filled: where the analytic answer exists it stands.
 */
export interface SampleRates {
  jointVel: Map<string, [number, number]>;
  jointAcc: Map<string, [number, number]>;
  linkCoM: Map<string, [number, number]>;
  linkVel: Map<string, [number, number]>;
  linkAcc: Map<string, [number, number]>;
  linkAngPos: Map<string, number>;
  linkAngVel: Map<string, number>;
  linkAngAcc: Map<string, number>;
}

interface Sampled {
  joints: Joint[][];
  links: Link[][];
  timeNum: number[];
  framesRunBackwards?: boolean;
  inputAngularVelocities?: number[];
}

const finite = (value: [number, number] | undefined): boolean =>
  !!value && Number.isFinite(value[0]) && Number.isFinite(value[1]);

export function fillRatesByDifference(mechanism: Sampled, index: number, rates: SampleRates): void {
  transferCylinderRates(mechanism.joints[index] ?? [], rates);
  const count = Math.min(mechanism.joints.length, mechanism.timeNum.length);
  if (count < 3) return;
  const times = mechanism.timeNum;
  const direction = mechanism.framesRunBackwards ? -1 : 1;
  const bounds = branchBounds(mechanism, index, count);

  for (const joint of mechanism.joints[index] ?? []) {
    if (finite(rates.jointVel.get(joint.id)) && finite(rates.jointAcc.get(joint.id))) continue;
    const xs = (i: number) => mechanism.joints[i]?.find((one) => one.id === joint.id)?.x;
    const ys = (i: number) => mechanism.joints[i]?.find((one) => one.id === joint.id)?.y;
    if (!finite(rates.jointVel.get(joint.id))) {
      rates.jointVel.set(joint.id, [
        direction * derivative(xs, times, index, count, 1, bounds),
        direction * derivative(ys, times, index, count, 1, bounds),
      ]);
    }
    if (!finite(rates.jointAcc.get(joint.id))) {
      rates.jointAcc.set(joint.id, [
        acceleration(xs, times, index, count, bounds),
        acceleration(ys, times, index, count, bounds),
      ]);
    }
  }

  // The leaves as well as the roots: a cylinder's barrel and rod stay two
  // bodies a reader can select after a weld has folded them into a compound,
  // and the rate solver walks roots -- so those two panels read every number as
  // a dash. Each leaf is copied into every sample (`cloneLinkSubset`), so the
  // difference has the same three poses it has for any other bar.
  for (const link of bodiesUnder(mechanism.links[index])) {
    const bodyAt = (i: number): RealLink | undefined =>
      bodiesUnder(mechanism.links[i]).find((one) => one.id === link.id);
    const comX = (i: number) => bodyAt(i)?.CoM.x;
    const comY = (i: number) => bodyAt(i)?.CoM.y;
    if (!finite(rates.linkCoM.get(link.id))) rates.linkCoM.set(link.id, [link.CoM.x, link.CoM.y]);
    if (!finite(rates.linkVel.get(link.id))) {
      rates.linkVel.set(link.id, [
        direction * derivative(comX, times, index, count, 1, bounds),
        direction * derivative(comY, times, index, count, 1, bounds),
      ]);
    }
    if (!finite(rates.linkAcc.get(link.id))) {
      rates.linkAcc.set(link.id, [
        acceleration(comX, times, index, count, bounds),
        acceleration(comY, times, index, count, bounds),
      ]);
    }
    // The bar's bearing, unwrapped across the samples so a turn through the
    // seam does not read as a jump of two pi.
    const bearing = (i: number): number | undefined => {
      const body = bodyAt(i);
      if (!body || body.joints.length < 2) return undefined;
      return Math.atan2(body.joints[1].y - body.joints[0].y, body.joints[1].x - body.joints[0].x);
    };
    const unwrapped = unwrapAround(bearing, index, count);
    if (!Number.isFinite(rates.linkAngPos.get(link.id))) {
      const here = bearing(index);
      if (here !== undefined) rates.linkAngPos.set(link.id, (here * 180) / Math.PI);
    }
    if (!Number.isFinite(rates.linkAngVel.get(link.id))) {
      rates.linkAngVel.set(
        link.id,
        direction * derivative(unwrapped, times, index, count, 1, bounds)
      );
    }
    if (!Number.isFinite(rates.linkAngAcc.get(link.id))) {
      rates.linkAngAcc.set(link.id, acceleration(unwrapped, times, index, count, bounds));
    }
  }

  // Fallback mount rates must carry the same axis motion to both interiors.
  transferCylinderRates(mechanism.joints[index] ?? [], rates);

  // A weld has one motion. Transferring its parent rates is exact and avoids
  // differentiating each member's sampled CoM into a different acceleration.
  for (const root of mechanism.links[index]) {
    if (!(root instanceof RealLink) || root.subset.length === 0) continue;
    const velocity = rates.linkVel.get(root.id);
    const acc = rates.linkAcc.get(root.id);
    const omega = rates.linkAngVel.get(root.id);
    const alpha = rates.linkAngAcc.get(root.id);
    if (!finite(velocity) || !finite(acc) || !Number.isFinite(omega) || !Number.isFinite(alpha))
      continue;
    for (const member of bodiesUnder(root.subset)) {
      const rx = member.CoM.x - root.CoM.x;
      const ry = member.CoM.y - root.CoM.y;
      rates.linkVel.set(member.id, [velocity![0] - omega! * ry, velocity![1] + omega! * rx]);
      rates.linkAcc.set(member.id, [
        acc![0] - alpha! * ry - omega! ** 2 * rx,
        acc![1] + alpha! * rx - omega! ** 2 * ry,
      ]);
      rates.linkAngVel.set(member.id, omega!);
      rates.linkAngAcc.set(member.id, alpha!);
    }
  }
}

/**
 * The bearing at the samples round `index`, continued past the seam of
 * two pi so the three values a difference reads are on one branch.
 */
function unwrapAround(
  bearing: (i: number) => number | undefined,
  index: number,
  count: number
): (i: number) => number | undefined {
  const center = Math.min(Math.max(index, 1), count - 2);
  const reference = bearing(center);
  return (i: number) => {
    const value = bearing(i);
    if (value === undefined || reference === undefined) return value;
    let turned = value;
    while (turned - reference > Math.PI) turned -= 2 * Math.PI;
    while (turned - reference < -Math.PI) turned += 2 * Math.PI;
    return turned;
  };
}

/**
 * The acceleration as the derivative of the velocity series rather than a
 * second difference of the positions. A pose settled all at once carries the
 * solver's tolerance as a zigzag of a hair between neighboring samples; a
 * central first difference straddles it and never sees it, a second
 * difference divides it by dt squared and reports a spike of several units
 * where the joint moves in a straight line. Differencing the velocities is a
 * wider stencil, which is what tames it, and it is also what a reader
 * checking the plotted acceleration against the plotted velocity does.
 */
function acceleration(
  value: (i: number) => number | undefined,
  times: number[],
  index: number,
  count: number,
  bounds: [number, number]
): number {
  const velocity = (i: number): number | undefined => {
    if (i < bounds[0] || i > bounds[1]) return undefined;
    const v = derivative(value, times, i, count, 1, bounds);
    return Number.isFinite(v) ? v : undefined;
  };
  return derivative(velocity, times, index, count, 1, bounds);
}

/**
 * A first or second derivative at `index` from the three samples round it,
 * on samples that need not be evenly spaced in time. At either end the
 * three nearest samples serve, which is one-sided there and central
 * everywhere else.
 */
function derivative(
  value: (i: number) => number | undefined,
  times: number[],
  index: number,
  count: number,
  order: 1 | 2,
  bounds: [number, number]
): number {
  if (bounds[1] - bounds[0] < 2) return Number.NaN;
  const center = Math.min(Math.max(index, bounds[0] + 1), bounds[1] - 1);
  const t0 = times[center - 1];
  const t1 = times[center];
  const t2 = times[center + 1];
  const y0 = value(center - 1);
  const y1 = value(center);
  const y2 = value(center + 1);
  if ([t0, t1, t2, y0, y1, y2].some((v) => v === undefined || !Number.isFinite(v))) {
    return Number.NaN;
  }
  const t = times[index];
  // Lagrange through the three points, differentiated at t.
  const d01 = t0 - t1;
  const d02 = t0 - t2;
  const d12 = t1 - t2;
  if (d01 === 0 || d02 === 0 || d12 === 0) return Number.NaN;
  const c0 = y0! / (d01 * d02);
  const c1 = y1! / (-d01 * d12);
  const c2 = y2! / (d02 * d12);
  if (order === 2) return 2 * (c0 + c1 + c2);
  return c0 * (2 * t - t1 - t2) + c1 * (2 * t - t0 - t2) + c2 * (2 * t - t0 - t1);
}

/** A difference never crosses an abrupt reversal into the other commanded branch. */
function branchBounds(mechanism: Sampled, index: number, count: number): [number, number] {
  const speeds = mechanism.inputAngularVelocities;
  if (!speeds) return [0, count - 1];
  const direction = Math.sign(speeds[index]);
  let first = index,
    last = index;
  while (first > 0 && Math.sign(speeds[first - 1]) === direction) first--;
  while (last < count - 1 && Math.sign(speeds[last + 1]) === direction) last++;
  return [first, last];
}
