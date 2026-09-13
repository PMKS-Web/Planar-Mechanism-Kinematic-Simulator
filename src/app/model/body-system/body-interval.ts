import { AdmittedBodySystem, BodyContinuationState, advanceBodyCommand } from './body-continuation';
import { checkBodyLimits } from './body-limits';
import { BodyFold, searchBodyFold } from './body-fold';
import { LimitId, compareRecordIds } from './body-id';
import { BodyMotion, solveBodyRates } from './body-rates';
import { bodyCoordinateMotion } from './body-coordinate-rates';
import { relaxBodyPosition } from './body-position-solver';
import { bodyPositionScale } from './body-position-scale';
import { passiveBodyTangent } from './body-arc-step';
import { bodyRowGradient, bodyRowValue, pairGeometry } from './body-constraint-rows';
import { resolvedScalarInterval } from './scalar-interval-shape';

/** Successful endpoints alone cannot clear a playback interval that may cross and reenter a passive stop. */
export function inspectBodyInterval(
  admitted: AdmittedBodySystem,
  start: BodyContinuationState,
  target: number,
  options: { readonly maxProbes?: number; readonly maxDepth?: number } = {}
): BodyInterval {
  const maximum = options.maxProbes ?? 4096,
    maxDepth = options.maxDepth ?? 40;
  if (
    !Number.isFinite(target) ||
    !Number.isInteger(maximum) ||
    maximum < 1 ||
    !Number.isInteger(maxDepth) ||
    maxDepth < 0
  )
    return { ok: false, reason: 'unsolved', probes: 0 };
  if (checkBodyLimits(admitted.frame.partition, start.poses, admitted.scale))
    return { ok: false, reason: 'unsolved', probes: 0 };
  const probes = new BodyIntervalProbes(admitted, maximum);
  type Accepted = Extract<BodyInterval, { ok: true }>;
  const finish = (point: BodyIntervalPoint): Accepted => ({
    ok: true,
    state: point.state,
    ...(point.fold ? { stop: { kind: 'fold' as const, curvature: point.fold.curvature } } : {}),
    probes: probes.count,
  });
  const walk = (
    left: BodyIntervalPoint,
    command: number,
    depth: number,
    known?: BodyIntervalPoint
  ): Accepted => {
    if (command === left.state.command) return finish(left);
    let right: BodyIntervalPoint;
    try {
      // Subdivision gives the fold search a closer regular seed. A cached Newton endpoint
      // must not suppress a new positive stop proof from that seed.
      right = known
        ? known.fold
          ? known
          : (probes.findFold(left, command) ?? known)
        : probes.read(left, command);
    } catch (error) {
      if (!(error instanceof BodyIntervalRefusal) || depth >= maxDepth || probes.count >= maximum)
        throw error;
      const middleCommand = left.state.command + (command - left.state.command) / 2;
      if (middleCommand === left.state.command || middleCommand === command) throw error;
      const first = walk(left, middleCommand, depth + 1);
      return first.stop ? first : walk(probes.point(first.state), command, depth + 1);
    }
    if (!admitted.frame.partition.limits.length) return finish(right);
    const middleCommand = left.state.command + (right.state.command - left.state.command) / 2;
    if (middleCommand === left.state.command || middleCommand === right.state.command)
      throw new BodyIntervalRefusal('unsolved');
    const middle = probes.exact(left, middleCommand);
    if (
      [left, middle, right].some((point) => point.limits.some((limit) => limit === undefined)) &&
      clearBodyIntervalEnclosure(probes, left, middle, right)
    )
      return finish(right);
    if (resolvedBodyInterval(probes, left, middle, right)) {
      const hit = firstBodyCrossing(probes, left, middle, right);
      return hit
        ? {
            ok: true,
            state: hit.point.state,
            stop: { kind: 'coordinate', contacts: hit.contacts },
            probes: probes.count,
          }
        : finish(right);
    }
    if (depth >= maxDepth) throw new BodyIntervalRefusal('unsolved');
    const first = walk(left, middleCommand, depth + 1, middle);
    return first.stop ? first : walk(middle, right.state.command, depth + 1, right);
  };
  try {
    return walk(probes.point(start), target, 0);
  } catch (error) {
    if (!(error instanceof BodyIntervalRefusal)) throw error;
    return { ok: false, reason: error.reason, probes: probes.count };
  }
}

export interface BodyLimitContact {
  readonly limitId: LimitId;
  readonly side: 'lower' | 'upper';
  readonly bound: number;
  readonly value: number;
  readonly residual: number;
}
export type BodyStop =
  | { readonly kind: 'coordinate'; readonly contacts: readonly BodyLimitContact[] }
  | { readonly kind: 'fold'; readonly curvature: number };
export type BodyInterval =
  | { readonly ok: false; readonly reason: 'branch' | 'unsolved'; readonly probes: number }
  | {
      readonly ok: true;
      readonly state: BodyContinuationState;
      readonly stop?: BodyStop;
      readonly probes: number;
    };
export interface BodyLimitProbe {
  readonly value: number;
  /** Command derivative at regular poses; only its oriented sign is used at a proved fold. */
  readonly slope: number;
}
export interface BodyIntervalPoint {
  readonly state: BodyContinuationState;
  readonly limits: readonly (BodyLimitProbe | undefined)[];
  readonly fold?: BodyFold;
}
export class BodyIntervalRefusal extends Error {
  constructor(readonly reason: 'branch' | 'unsolved') {
    super(reason);
  }
}

/** Only this private continuation omits bounds: it must see the other side to prove a crossing. */
export class BodyIntervalProbes {
  readonly unrestricted: AdmittedBodySystem;
  readonly commandScale: number;
  count = 0;
  constructor(
    readonly admitted: AdmittedBodySystem,
    readonly maximum: number
  ) {
    this.unrestricted = {
      ...admitted,
      frame: { ...admitted.frame, partition: { ...admitted.frame.partition, limits: [] } },
    };
    this.commandScale =
      admitted.frame.partition.drivers[0].row.kind === 'angle' ? 1 : admitted.scale.length;
  }
  point(
    state: BodyContinuationState,
    fold?: { readonly value: BodyFold; readonly direction: number }
  ): BodyIntervalPoint {
    const part = this.admitted.frame.partition;
    if (!part.limits.length) return { state, limits: [], ...(fold ? { fold: fold.value } : {}) };
    const still: BodyMotion = {
      velocity: { vx: 0, vy: 0, omega: 0 },
      acceleration: { ax: 0, ay: 0, alpha: 0 },
    };
    const rates = solveBodyRates(
      part,
      state.poses,
      new Map([[part.drivers[0].id, { value: state.command, velocity: 1, acceleration: 0 }]]),
      new Map(part.boundary.map((id) => [id, still]))
    );
    const reference = state.tangent.map(
      (value, i) => (value * (fold?.direction ?? 1)) / this.admitted.scale.columns[i]
    );
    const tangent = fold
      ? passiveBodyTangent(part, state.poses, this.admitted.scale, reference)
      : undefined;
    return {
      state,
      ...(fold ? { fold: fold.value } : {}),
      limits: part.limits.map((limit) => {
        const value = bodyRowValue(limit.row, state.poses);
        const driver = part.drivers[0].row;
        if (limit.row.jointId === driver.jointId && limit.row.kind === driver.kind)
          return { value, slope: 1 };
        if (limit.row.pair.groupA === limit.row.pair.groupB) return { value, slope: 0 };
        if (fold && tangent) {
          const gradient = bodyRowGradient(limit.row, state.poses);
          const slope = part.unknowns.reduce(
            (sum, id, i) =>
              sum +
              (gradient.get(id) ?? [0, 0, 0]).reduce(
                (total, coefficient, j) =>
                  total + coefficient * tangent[3 * i + j] * this.admitted.scale.columns[3 * i + j],
                0
              ),
            0
          );
          // The passive curve stays regular where command speed cannot parameterize it.
          return { value, slope: slope * fold.direction };
        }
        const motion = rates.ok
          ? bodyCoordinateMotion(limit.row, state.poses, rates.motions)
          : undefined;
        return motion ? { value: motion.value, slope: motion.velocity } : undefined;
      }),
    };
  }
  findFold(from: BodyIntervalPoint, command: number): BodyIntervalPoint | undefined {
    if (++this.count > this.maximum) throw new BodyIntervalRefusal('unsolved');
    const partition = this.unrestricted.frame.partition;
    const currentScale = bodyPositionScale(
      partition,
      from.state.poses,
      new Map([[partition.drivers[0].id, command]])
    );
    // Shrinking a command must shrink the arc to search, even for a lone P whose only
    // instantaneous length is that same command. Keep the admitted physical scale.
    const scale =
      currentScale.length >= this.admitted.scale.length ? currentScale : this.admitted.scale;
    const found = searchBodyFold(partition, from.state.poses, from.state.tangent, command, scale);
    if (found.kind === 'unresolved') throw new BodyIntervalRefusal('unsolved');
    return found.kind === 'fold' ? this.foldPoint(from, command, found.fold) : undefined;
  }
  read(from: BodyIntervalPoint, command: number): BodyIntervalPoint {
    // Newton can accept the far side or a residual-sized neighborhood of a fold.
    // A positive passive-curve proof takes precedence over that endpoint answer.
    const fold = this.findFold(from, command);
    if (fold) return fold;
    const advance = advanceBodyCommand(this.unrestricted, from.state, command);
    if (advance.ok) {
      // Near a shallow crossing, a tiny pose residual is a much larger command error.
      const polished = relaxBodyPosition(
        this.unrestricted.frame.partition,
        advance.state.poses,
        new Map([[this.admitted.frame.partition.drivers[0].id, command]]),
        { residualTolerance: 1e-13, allowSingularCorrection: true }
      );
      if (!polished.ok) throw new BodyIntervalRefusal('unsolved');
      return this.point({ ...advance.state, poses: polished.poses });
    }
    if (advance.fold) return this.foldPoint(from, command, advance.fold);
    throw new BodyIntervalRefusal(advance.reason === 'branch' ? 'branch' : 'unsolved');
  }
  private foldPoint(from: BodyIntervalPoint, command: number, fold: BodyFold): BodyIntervalPoint {
    return this.point(
      { poses: fold.poses, command: fold.command, tangent: from.state.tangent, regular: false },
      { value: fold, direction: Math.sign(command - from.state.command) }
    );
  }
  value(point: BodyIntervalPoint, index: number): number {
    const value =
      point.limits[index]?.value ??
      bodyRowValue(this.admitted.frame.partition.limits[index].row, point.state.poses);
    if (!Number.isFinite(value)) throw new BodyIntervalRefusal('unsolved');
    return value;
  }
  scale(index: number): number {
    return this.admitted.frame.partition.limits[index].row.kind === 'angle'
      ? 1
      : this.admitted.scale.length;
  }
  exact(from: BodyIntervalPoint, command: number): BodyIntervalPoint {
    const point = this.read(from, command);
    if (point.fold || Math.abs(point.state.command - command) > 1e-12 * this.commandScale)
      throw new BodyIntervalRefusal('unsolved');
    return point;
  }
}

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
    // Near a fold a small command gap can still span a large passive-coordinate gap.
    if (
      Math.abs(right.state.command - left.state.command) <= 1e-11 * probes.commandScale &&
      Math.abs(margin(left)) <= tolerance
    )
      break;
  }
  if (Math.abs(margin(left)) > tolerance) throw new BodyIntervalRefusal('unsolved');
  return left;
}

/** Hermite checks are an adaptive numerical search, not an interval-arithmetic proof of a nonlinear path. */
export function resolvedBodyInterval(
  probes: BodyIntervalProbes,
  left: BodyIntervalPoint,
  middle: BodyIntervalPoint,
  right: BodyIntervalPoint
): boolean {
  const h = right.state.command - left.state.command;
  if (Math.abs(h) > 0.1 * probes.commandScale) return false;
  for (const id of probes.admitted.frame.partition.unknowns) {
    const angles = [left, middle, right].map((point) => point.state.poses.get(id)!.angle);
    if (Math.abs(angles[1] - angles[0]) + Math.abs(angles[2] - angles[1]) > 0.1) return false;
  }
  if (right.fold) {
    const driver = probes.admitted.frame.partition.drivers[0].row;
    // The commanded coordinate is affine in the command even at a geometric fold.
    // Only passive coordinates need a small geometric enclosure and passive tangents;
    // forcing driver-only limits into that enclosure asks Newton to resolve a singularity.
    if (
      probes.admitted.frame.partition.limits.every(
        (limit) => limit.row.jointId === driver.jointId && limit.row.kind === driver.kind
      )
    )
      return true;
    // At a proved fold use a short geometric leaf and the oriented passive tangent.
    // Command derivatives diverge there; these probe slopes are never analysis rates.
    const spread = Math.max(
      0,
      ...probes.admitted.frame.partition.unknowns.flatMap((id) => {
        const a = left.state.poses.get(id)!,
          b = middle.state.poses.get(id)!,
          c = right.state.poses.get(id)!;
        return [
          Math.hypot(b.x - a.x, b.y - a.y) / probes.admitted.scale.length +
            Math.hypot(c.x - b.x, c.y - b.y) / probes.admitted.scale.length,
          Math.abs(b.angle - a.angle) + Math.abs(c.angle - b.angle),
        ];
      })
    );
    return (
      spread <= 1e-5 &&
      [left, middle, right].every((point) => point.limits.every((limit) => limit !== undefined))
    );
  }
  return probes.admitted.frame.partition.limits.every((_, i) => {
    const l = left.limits[i],
      m = middle.limits[i],
      r = right.limits[i];
    if (!l || !m || !r) return false;
    const tolerance = probes.scale(i);
    return resolvedScalarInterval(l, m, r, h, tolerance);
  });
}

/** A distant bound need not borrow undefined rates at an isolated singular sample. */
export function clearBodyIntervalEnclosure(
  probes: BodyIntervalProbes,
  left: BodyIntervalPoint,
  middle: BodyIntervalPoint,
  right: BodyIntervalPoint
): boolean {
  const partition = probes.admitted.frame.partition,
    length = probes.admitted.scale.length;
  const radii = new Map(
    [...partition.unknowns, ...partition.boundary].map((id) => {
      const center = middle.state.poses.get(id)!;
      const ends = [left, right].map((point) => point.state.poses.get(id)!);
      return [
        id,
        {
          position:
            2 * Math.max(...ends.map((pose) => Math.hypot(pose.x - center.x, pose.y - center.y))),
          angle: 2 * Math.max(...ends.map((pose) => Math.abs(pose.angle - center.angle))),
        },
      ] as const;
    })
  );
  if ([...radii.values()].some((radius) => radius.position / length > 1e-5 || radius.angle > 1e-5))
    return false;
  return partition.limits.every((limit, index) => {
    const { pair } = limit.row,
      a = radii.get(pair.groupA)!,
      b = radii.get(pair.groupB)!;
    const value = probes.value(middle, index);
    let variation = a.angle + b.angle;
    if (limit.row.kind === 'travel') {
      const geometry = pairGeometry(pair, middle.state.poses);
      // |u'·d' - u·d| <= |d'-d| + |u'-u| |d|; rotations bound each anchor displacement.
      variation =
        a.position +
        b.position +
        Math.min(2, a.angle) * Math.hypot(geometry.a.x, geometry.a.y) +
        Math.min(2, b.angle) * Math.hypot(geometry.b.x, geometry.b.y) +
        Math.min(2, a.angle) * Math.hypot(geometry.d.x, geometry.d.y);
    }
    const allowance = variation + 1e-9 * probes.scale(index);
    return value - limit.lower > allowance && limit.upper - value > allowance;
  });
}
