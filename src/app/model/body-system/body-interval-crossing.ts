import { compareRecordIds } from './body-id';
import { BodyIntervalPoint, BodyIntervalRefusal, BodyLimitContact } from './body-interval-types';
import { BodyIntervalProbes } from './body-interval-probes';

interface Crossing {
  readonly point: BodyIntervalPoint;
  readonly contact: BodyLimitContact;
}

export function firstBodyCrossing(
  probes: BodyIntervalProbes,
  left: BodyIntervalPoint,
  middle: BodyIntervalPoint,
  right: BodyIntervalPoint
):
  | { readonly point: BodyIntervalPoint; readonly contacts: readonly BodyLimitContact[] }
  | undefined {
  const crossings: Crossing[] = [];
  const direction = Math.sign(right.state.command - left.state.command);
  for (const [index, limit] of probes.admitted.frame.partition.limits.entries()) {
    const knots = [left, middle, right];
    for (const [a, b] of [
      [left, middle],
      [middle, right],
    ]) {
      const da = a.limits[index]?.slope,
        db = b.limits[index]?.slope;
      if (da === undefined || db === undefined) throw new BodyIntervalRefusal('unsolved');
      if (da * db < 0) knots.push(stationary(probes, a, b, index));
    }
    knots.sort((a, b) => direction * (a.state.command - b.state.command));
    for (const side of ['lower', 'upper'] as const) {
      const bound = limit[side],
        sign = side === 'lower' ? 1 : -1;
      const margin = (point: BodyIntervalPoint) => sign * (probes.value(point, index) - bound);
      const tolerance = 1e-9 * probes.scale(index);
      if (margin(left) < -tolerance) throw new BodyIntervalRefusal('unsolved');
      for (let i = 1; i < knots.length; i++) {
        if (margin(knots[i]) >= -tolerance) continue;
        const point = crossing(probes, knots[i - 1], knots[i], margin, tolerance);
        const value = probes.value(point, index);
        crossings.push({
          point,
          contact: { limitId: limit.id, side, bound, value, residual: value - bound },
        });
        break;
      }
    }
  }
  if (!crossings.length) return undefined;
  crossings.sort((a, b) => direction * (a.point.state.command - b.point.state.command));
  const point = crossings[0].point;
  const contacts = crossings
    .filter(
      (item) =>
        Math.abs(item.point.state.command - point.state.command) <= 1e-9 * probes.commandScale
    )
    .map((item) => {
      const index = probes.admitted.frame.partition.limits.findIndex(
        (limit) => limit.id === item.contact.limitId
      );
      const value = probes.value(point, index);
      return { ...item.contact, value, residual: value - item.contact.bound };
    })
    .filter((contact) => {
      const index = probes.admitted.frame.partition.limits.findIndex(
        (limit) => limit.id === contact.limitId
      );
      return Math.abs(contact.residual) <= 1e-9 * probes.scale(index);
    })
    .sort((a, b) => compareRecordIds(a.limitId, b.limitId) || a.side.localeCompare(b.side));
  return { point, contacts };
}

function stationary(
  probes: BodyIntervalProbes,
  start: BodyIntervalPoint,
  end: BodyIntervalPoint,
  index: number
): BodyIntervalPoint {
  let left = start,
    right = end;
  for (let cut = 0; cut < 48; cut++) {
    const command = (left.state.command + right.state.command) / 2;
    if (command === left.state.command || command === right.state.command) break;
    const middle = probes.exact(left, command),
      slope = middle.limits[index]?.slope;
    if (slope === undefined) throw new BodyIntervalRefusal('unsolved');
    if (slope === 0) return middle;
    if (slope * left.limits[index]!.slope > 0) left = middle;
    else right = middle;
    if (Math.abs(right.state.command - left.state.command) <= 1e-11 * probes.commandScale) break;
  }
  return Math.abs(left.limits[index]!.slope) < Math.abs(right.limits[index]!.slope) ? left : right;
}

function crossing(
  probes: BodyIntervalProbes,
  start: BodyIntervalPoint,
  end: BodyIntervalPoint,
  margin: (point: BodyIntervalPoint) => number,
  tolerance: number
): BodyIntervalPoint {
  let left = start,
    right = end;
  for (let cut = 0; cut < 48; cut++) {
    const command = (left.state.command + right.state.command) / 2;
    if (command === left.state.command || command === right.state.command) break;
    const middle = probes.exact(left, command);
    if (margin(middle) >= 0) left = middle;
    else right = middle;
    if (Math.abs(right.state.command - left.state.command) <= 1e-11 * probes.commandScale) break;
  }
  if (Math.abs(margin(left)) > tolerance) throw new BodyIntervalRefusal('unsolved');
  return left;
}
