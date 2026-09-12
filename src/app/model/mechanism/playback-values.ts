import { CoordinateRule } from './anchor';

/** One machine's playback state, carried across a rebuild by `partitionKey`. */
export interface HeldPlayback {
  seconds: number;
  playing: boolean;
  direction: number;
  /** Running backwards only because its drive was turned round in place. */
}

/** A paused drawing's place in each cycle, independent of sample counts. */
export interface PausedPlaybackPose {
  mechanisms: { id: string; fraction: number }[];
}

/**
 * One machine's displayed pose, carried across a rebuild that re-measures it.
 *
 * The clock cannot carry it -- that is the whole point -- so what is kept is
 * the driven coordinate in the *new* rule plus the pose itself, which is what
 * tells the two legs of a reversing cycle apart. Exactly what an anchor keeps,
 * about the displayed pose rather than the start.
 */
export interface HeldPose {
  rule: CoordinateRule;
  coordinate: number;
  seed: ReadonlyMap<string, { x: number; y: number }>;
}

/**
 * One solved object out of a frame, by id, in constant time.
 *
 * A Mechanism holds the same objects in the same order at every sample, so the
 * position an id sits at is fixed for the machine's whole life and worth
 * looking up once (see `frameIndexOf`). The id at that position is still
 * checked, and the linear search is still there behind it: a frame is allowed
 * to drop an object the solver could not place, and a wrong answer here moves a
 * joint to another joint's coordinates.
 */
export function at<T extends { id: string }>(
  frame: T[],
  where: Map<string, number>,
  id: string
): T | undefined {
  const guess = frame[where.get(id) ?? -1];
  return guess?.id === id ? guess : frame.find((candidate) => candidate.id === id);
}

/** Blend two angles along the shorter arc, so a wrap past pi does not spin. */
export function blendAngle(from: number, to: number, blend: number): number {
  let delta = to - from;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  return from + delta * blend;
}

/**
 * The nearest number a person would have picked: 1, 2 or 5 times a power of ten.
 *
 * A default that reads 13.7 rpm claims to have been calculated from something,
 * and invites the reader to treat it as a result rather than as a starting
 * point. The ladder is the one every axis and every ruler climbs.
 */
export function niceSpeed(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  const decade = Math.pow(10, Math.floor(Math.log10(raw)));
  const steps = [1, 2, 5, 10].map((step) => step * decade);
  return steps.reduce((best, step) =>
    Math.abs(Math.log(step / raw)) < Math.abs(Math.log(best / raw)) ? step : best
  );
}
