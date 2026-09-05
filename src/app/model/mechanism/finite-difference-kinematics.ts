import { Joint } from '../joint';
import { Link, RealLink } from '../link';

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
}

const finite = (value: [number, number] | undefined): boolean =>
  !!value && Number.isFinite(value[0]) && Number.isFinite(value[1]);

export function fillRatesByDifference(mechanism: Sampled, index: number, rates: SampleRates): void {
  const count = Math.min(mechanism.joints.length, mechanism.timeNum.length);
  if (count < 3) return;
  const times = mechanism.timeNum;

  for (const joint of mechanism.joints[index] ?? []) {
    if (finite(rates.jointVel.get(joint.id)) && finite(rates.jointAcc.get(joint.id))) continue;
    const xs = (i: number) => mechanism.joints[i]?.find((one) => one.id === joint.id)?.x;
    const ys = (i: number) => mechanism.joints[i]?.find((one) => one.id === joint.id)?.y;
    if (!finite(rates.jointVel.get(joint.id))) {
      rates.jointVel.set(joint.id, [
        derivative(xs, times, index, count, 1),
        derivative(ys, times, index, count, 1),
      ]);
    }
    if (!finite(rates.jointAcc.get(joint.id))) {
      rates.jointAcc.set(joint.id, [
        acceleration(xs, times, index, count),
        acceleration(ys, times, index, count),
      ]);
    }
  }

  for (const link of mechanism.links[index] ?? []) {
    if (!(link instanceof RealLink)) continue;
    const bodyAt = (i: number): RealLink | undefined =>
      mechanism.links[i]?.find(
        (one): one is RealLink => one.id === link.id && one instanceof RealLink
      );
    const comX = (i: number) => bodyAt(i)?.CoM.x;
    const comY = (i: number) => bodyAt(i)?.CoM.y;
    if (!finite(rates.linkCoM.get(link.id))) rates.linkCoM.set(link.id, [link.CoM.x, link.CoM.y]);
    if (!finite(rates.linkVel.get(link.id))) {
      rates.linkVel.set(link.id, [
        derivative(comX, times, index, count, 1),
        derivative(comY, times, index, count, 1),
      ]);
    }
    if (!finite(rates.linkAcc.get(link.id))) {
      rates.linkAcc.set(link.id, [
        acceleration(comX, times, index, count),
        acceleration(comY, times, index, count),
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
      if (here !== undefined) rates.linkAngPos.set(link.id, here);
    }
    if (!Number.isFinite(rates.linkAngVel.get(link.id))) {
      rates.linkAngVel.set(link.id, derivative(unwrapped, times, index, count, 1));
    }
    if (!Number.isFinite(rates.linkAngAcc.get(link.id))) {
      rates.linkAngAcc.set(link.id, acceleration(unwrapped, times, index, count));
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
  count: number
): number {
  const velocity = (i: number): number | undefined => {
    if (i < 0 || i >= count) return undefined;
    const v = derivative(value, times, i, count, 1);
    return Number.isFinite(v) ? v : undefined;
  };
  return derivative(velocity, times, index, count, 1);
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
  order: 1 | 2
): number {
  const center = Math.min(Math.max(index, 1), count - 2);
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
