import {
  AdmittedBodySystem,
  BodyContinuationState,
  initialBodyContinuation,
} from './body-continuation';
import { inspectBodyInterval, BodyStop } from './body-interval';
import { freezeResult, snapshotMap } from './sample-results';

export interface BodyCycleSample {
  readonly time: number;
  readonly direction: 1 | -1;
  readonly state: BodyContinuationState;
  /** Rates at a direction discontinuity are unavailable; a position still exists. */
  readonly stop?: BodyStop;
}
export type BodyCycle =
  | {
      readonly ok: false;
      readonly reason: 'invalid' | 'branch' | 'unsolved';
      readonly probes: number;
    }
  | {
      readonly ok: true;
      readonly kind: 'rotation' | 'retrace';
      readonly partitionKey: string;
      readonly samples: readonly BodyCycleSample[];
      readonly duration: number;
      readonly probes: number;
    };
interface TracePoint {
  readonly state: BodyContinuationState;
  readonly stop?: BodyStop;
}

/** A retrace reuses accepted geometry; its singular stop is never readmitted as a new mechanism. */
export function buildBodyCycle(
  admitted: AdmittedBodySystem,
  options: {
    readonly commandStep?: number;
    readonly maxSamples?: number;
    readonly maxTurns?: number;
    readonly maxIntervalProbes?: number;
  } = {}
): BodyCycle {
  const part = admitted.frame.partition,
    driver = part.drivers[0];
  const angular = driver.row.kind === 'angle',
    commandScale = angular ? 1 : admitted.scale.length;
  const step = options.commandStep ?? (angular ? Math.PI / 180 : commandScale / 100);
  const maxSamples = options.maxSamples ?? 4096,
    maxTurns = options.maxTurns ?? 8;
  if (
    !Number.isFinite(step) ||
    step <= 0 ||
    !Number.isFinite(driver.speed) ||
    driver.speed === 0 ||
    !Number.isInteger(maxSamples) ||
    maxSamples < 2 ||
    !Number.isInteger(maxTurns) ||
    maxTurns < 1
  )
    return { ok: false, reason: 'invalid', probes: 0 };
  const initial = initialBodyContinuation(admitted),
    direction = driver.speed > 0 ? 1 : -1;
  let probes = 0;
  type Trace =
    | {
        readonly ok: true;
        readonly kind: 'rotation' | 'stop';
        readonly points: readonly TracePoint[];
      }
    | { readonly ok: false; readonly reason: 'branch' | 'unsolved' };
  const trace = (sign: 1 | -1): Trace => {
    const points: TracePoint[] = [{ state: initial }];
    let current = initial,
      turn = 1;
    while (points.length < maxSamples) {
      const turnEnd = initial.command + sign * turn * 2 * Math.PI;
      const target = angular
        ? initial.command +
          sign * Math.min(Math.abs(current.command - initial.command) + step, turn * 2 * Math.PI)
        : current.command + sign * step;
      if (target === current.command) return { ok: false, reason: 'unsolved' };
      const next = inspectBodyInterval(admitted, current, target, {
        maxProbes: options.maxIntervalProbes,
      });
      probes += next.probes;
      if (!next.ok) return next;
      const point = { state: next.state, ...(next.stop ? { stop: next.stop } : {}) };
      if (next.state.command === current.command) points[points.length - 1] = point;
      else points.push(point);
      if (next.stop) return { ok: true, kind: 'stop', points };
      current = next.state;
      if (angular && Math.abs(current.command - turnEnd) <= 1e-10) {
        if (sameConfiguration(admitted, initial, current))
          return { ok: true, kind: 'rotation', points };
        if (++turn > maxTurns) return { ok: false, reason: 'unsolved' };
      }
    }
    return { ok: false, reason: 'unsolved' };
  };
  const forward = trace(direction);
  if (!forward.ok) return freezeResult({ ...forward, probes });
  const series: { point: TracePoint; direction: 1 | -1 }[] = forward.points.map((point) => ({
    point,
    direction,
  }));
  if (forward.kind === 'stop') {
    const backward = trace(direction === 1 ? -1 : 1);
    if (!backward.ok) return freezeResult({ ...backward, probes });
    if (backward.kind !== 'stop') return freezeResult({ ok: false, reason: 'unsolved', probes });
    const opposite = direction === 1 ? -1 : 1;
    // Only the two turnaround points carry stop events. Passing the anchor is continuous.
    for (const point of [...forward.points].slice(0, -1).reverse())
      series.push({ point: { state: point.state }, direction: opposite });
    for (const point of backward.points.slice(1)) series.push({ point, direction: opposite });
    for (const point of [...backward.points].slice(0, -1).reverse())
      series.push({ point: { state: point.state }, direction });
    // An anchor that is itself a stop owns the seam between repeated cycles.
    if (forward.points.length === 1 && series.length > 1)
      series[series.length - 1] = { point: forward.points[0], direction };
    if (backward.points.length === 1) {
      series[0] = { point: backward.points[0], direction };
      const anchorIndex = forward.points.length * 2 - 2;
      if (series[anchorIndex]) series[anchorIndex] = { point: backward.points[0], direction };
    }
  }
  if (series.length < 2 || series.length > maxSamples)
    return freezeResult({ ok: false, reason: 'unsolved', probes });
  let time = 0;
  const samples = series.map(({ point, direction }, index) => {
    if (index)
      time +=
        Math.abs(point.state.command - series[index - 1].point.state.command) /
        Math.abs(driver.speed);
    return freezeResult({
      time,
      direction,
      state: {
        ...point.state,
        poses: snapshotMap(
          [...point.state.poses].map(([id, pose]) => [id, freezeResult({ ...pose })] as const)
        ),
        tangent: Object.freeze([...point.state.tangent]),
      },
      ...(point.stop ? { stop: freezeResult({ ...point.stop }) } : {}),
    });
  });
  if (
    !Number.isFinite(time) ||
    time <= 0 ||
    samples.some((sample, i) => i > 0 && sample.time <= samples[i - 1].time)
  )
    return freezeResult({ ok: false, reason: 'unsolved', probes });
  return freezeResult({
    ok: true,
    kind: forward.kind === 'rotation' ? 'rotation' : 'retrace',
    partitionKey: part.key,
    samples,
    duration: time,
    probes,
  });
}

function sameConfiguration(
  admitted: AdmittedBodySystem,
  a: BodyContinuationState,
  b: BodyContinuationState
): boolean {
  return admitted.frame.partition.unknowns.every((id) => {
    const first = a.poses.get(id)!,
      second = b.poses.get(id)!;
    return (
      Math.hypot(first.x - second.x, first.y - second.y) <= 1e-7 * admitted.scale.length &&
      Math.abs(
        Math.atan2(Math.sin(first.angle - second.angle), Math.cos(first.angle - second.angle))
      ) <= 1e-7
    );
  });
}
