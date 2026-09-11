import { AdmittedBodySystem, BodyContinuationState } from './body-continuation';
import { BodyInterval, BodyIntervalPoint, BodyIntervalRefusal } from './body-interval-types';
import { clearBodyIntervalEnclosure } from './body-interval-enclosure';
import { checkBodyLimits } from './body-limits';
import { BodyIntervalProbes } from './body-interval-probes';
import { resolvedBodyInterval } from './body-interval-shape';
import { firstBodyCrossing } from './body-interval-crossing';
export type { BodyInterval, BodyStop, BodyLimitContact } from './body-interval-types';

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
      right = known ?? probes.read(left, command);
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
