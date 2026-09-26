import { Joint, PrisJoint } from '../joint';
import { Mechanism } from '../mechanism/mechanism';
import { MODEL_SCALE } from '../render-scale';
import { fmt, Samples } from './fact-math';
import { inputAt, InputSeries } from './roles';

/** One moment of the cycle the picture shows: when it is, and what the input reads then. */
export interface CycleMoment {
  /** Seconds into the machine's own cycle. */
  time: number;
  label: string;
}

/**
 * Where every joint goes over the machine's solved cycle, in the reader's
 * length unit, and when. Read off the machine the app already solved, so the
 * sheet describes exactly the motion on screen.
 */
export function cycleSamples(
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

/**
 * When the picture's moments are. A full turn is shown at equal fractions of
 * it; a back-and-forth motion from one end of its travel to the other, which is
 * the part of its cycle a still picture otherwise hides.
 */
export function cycleMoments(
  samples: Samples,
  reciprocates: boolean,
  input: InputSeries | undefined,
  count: number
): CycleMoment[] {
  const time = samples.time;
  const n = time.length;
  const nearest = (t: number) => {
    let best = 0;
    time.forEach((v, i) => {
      if (Math.abs(v - t) < Math.abs(time[best] - t)) best = i;
    });
    return best;
  };
  let picks: number[];
  if (!reciprocates || !input) {
    const period = time[n - 1] - time[0];
    picks = Array.from({ length: count }, (_, k) => nearest(time[0] + (k / count) * period));
  } else {
    let lo = 0;
    let hi = 0;
    input.values.forEach((v, i) => {
      if (v < input.values[lo]) lo = i;
      if (v > input.values[hi]) hi = i;
    });
    const [first, last] = lo < hi ? [lo, hi] : [hi, lo];
    const span = time[last] - time[first];
    picks = Array.from({ length: count }, (_, k) =>
      k === 0 ? first : k === count - 1 ? last : nearest(time[first] + (k / (count - 1)) * span)
    );
  }
  return picks.map((i) => ({
    time: time[i],
    label: `${fmt(time[i], 2)} s${input ? `, ${input.what} ${inputAt(input, i)}` : ''}`,
  }));
}
