import { AdmittedBodySystem, initialBodyContinuation } from './body-continuation';
import { BodyCycleSample } from './body-cycle';
import { inspectBodyInterval } from './body-interval';
import { snapshotCopy } from './sample-results';
import { bodyPoseSample } from './body-pose-sample';

export type BodyMotionWindow =
  | {
      readonly ok: false;
      readonly reason: 'invalid' | 'branch' | 'unsolved';
      readonly probes: number;
    }
  | {
      readonly ok: true;
      readonly kind: 'window';
      readonly partitionKey: string;
      readonly samples: readonly BodyCycleSample[];
      readonly duration: number;
      readonly requestedDuration: number;
      readonly end: 'duration' | 'stop';
      readonly probes: number;
    };

/** A finite analysis window is not a physical stop or an instruction to loop unbounded travel. */
export function buildBodyMotionWindow(
  admitted: AdmittedBodySystem,
  options: {
    readonly duration: number;
    readonly commandStep?: number;
    readonly maxSamples?: number;
    readonly maxIntervalProbes?: number;
  }
): BodyMotionWindow {
  const part = admitted.frame.partition,
    driver = part.drivers[0];
  const step =
    options.commandStep ??
    (driver.row.kind === 'angle' ? Math.PI / 180 : admitted.scale.length / 100);
  const maximum = options.maxSamples ?? 4096;
  if (
    !Number.isFinite(options.duration) ||
    options.duration <= 0 ||
    !Number.isFinite(step) ||
    step <= 0 ||
    !Number.isFinite(driver.speed) ||
    driver.speed === 0 ||
    !Number.isInteger(maximum) ||
    maximum < 2
  )
    return { ok: false, reason: 'invalid', probes: 0 };
  const start = initialBodyContinuation(admitted),
    direction = driver.speed > 0 ? 1 : -1;
  const target = start.command + driver.speed * options.duration;
  if (!Number.isFinite(target)) return { ok: false, reason: 'invalid', probes: 0 };
  const samples: BodyCycleSample[] = [{ time: 0, direction, state: bodyPoseSample(start) }];
  let current = start,
    probes = 0;
  while (samples.length < maximum) {
    const next =
      Math.abs(target - current.command) <= step ? target : current.command + direction * step;
    if (next === current.command) return { ok: false, reason: 'unsolved', probes };
    const result = inspectBodyInterval(admitted, current, next, {
      maxProbes: options.maxIntervalProbes,
    });
    probes += result.probes;
    if (!result.ok) return { ...result, probes };
    const sample: BodyCycleSample = {
      time: Math.abs(result.state.command - start.command) / Math.abs(driver.speed),
      direction,
      state: bodyPoseSample(result.state),
      ...(result.stop ? { stop: result.stop } : {}),
    };
    if (result.state.command === current.command) samples[samples.length - 1] = sample;
    else samples.push(sample);
    current = result.state;
    if (result.stop || current.command === target)
      return snapshotCopy({
        ok: true,
        kind: 'window',
        partitionKey: part.key,
        samples,
        duration: sample.time,
        requestedDuration: options.duration,
        end: result.stop ? 'stop' : 'duration',
        probes,
      });
  }
  return { ok: false, reason: 'unsolved', probes };
}
