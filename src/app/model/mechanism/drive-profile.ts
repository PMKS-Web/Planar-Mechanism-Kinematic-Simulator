import { PrisJoint, RealJoint } from '../joint';
import { Mechanism } from './mechanism';

/**
 * Where a machine's input sits, as a fraction of everything it can do.
 *
 * The transport used to be a clock: the handle ran left to right as time
 * passed, and everything the reader could ask it was really a question about
 * time. That works for a crank and breaks for anything else. A ram spends the
 * second half of its cycle undoing the first, so a handle following the clock
 * carried on to the right while the ram came back; a rocker never leaves a
 * forty-degree arc, and the handle claimed the whole track for it.
 *
 * So the handle measures the input instead:
 *
 * - A ram or slider runs from one end of its stroke to the other.
 * - A rocking crank runs from one angular limit to the other.
 * - A crank that goes all the way round has no limits to run between, so one
 *   turn spans the track and it wraps, with zero at the pose the drawing was
 *   authored in.
 *
 * Time is still what the machine is *at*, and still what the readout shows. It
 * is just no longer what the handle means.
 */
export interface DriveProfile {
  /** 0..1 for each solved sample: where the input is, out of everything it does. */
  readonly along: number[];
  /** True when the input goes all the way round rather than turning back. */
  readonly continuous: boolean;
  /** A slider or ram, which extends; otherwise a crank, which turns. */
  readonly linear: boolean;
  /** End to end of the input's travel, in model units. Zero for a crank. */
  readonly span: number;
}

/** The two joints a ram's length is measured between, when the input is one. */
export interface RamEnds {
  readonly from: string;
  readonly to: string;
}

/**
 * Read the input's own coordinate out of a solved cycle.
 *
 * Sample by sample, from the drawn positions rather than from a stored angle: a
 * slot's rail, a ram's bore and a pin's crank are described three different
 * ways in the model and are all just a moving joint here.
 */
export function driveProfileOf(mechanism: Mechanism, ram?: RamEnds): DriveProfile | undefined {
  const frames = mechanism.joints;
  if (!mechanism.isMechanismValid() || frames.length < 2) {
    return undefined;
  }
  const at = frames[0].findIndex((joint) => (joint as RealJoint).input);
  if (at === -1) {
    return undefined;
  }

  const linear = frames[0][at] instanceof PrisJoint;
  // A ram is measured by how far out its rod is, not by how far its slider has
  // moved from wherever the drawing put it: the two run opposite ways as often
  // as not, and the second one has no name a reader would recognise. Anything
  // else linear has no extension to speak of, so it is measured along the line
  // it slides on.
  const raw = linear ? ((ram && lengthOf(frames, ram)) ?? strokeOf(frames, at)) : turnOf(mechanism);
  if (!raw) {
    return undefined;
  }

  // A cycle whose input never turns back has no two ends to measure between --
  // it is a loop, and the only honest thing to show is how far round it is,
  // from the pose the drawing was authored in.
  //
  // Signed, and taken from the angle rather than from the sample index: the
  // crank is at the angle it is at whichever way it is being driven, so turning
  // the drive round must leave the handle where it is. Off the sample index it
  // would jump to the mirror image of itself.
  const continuous = !turnsBack(raw);
  if (continuous) {
    const turn = 2 * Math.PI;
    return {
      along: raw.map((value) => {
        const wrapped = ((value - raw[0]) / turn) % 1;
        return wrapped < 0 ? wrapped + 1 : wrapped;
      }),
      continuous,
      linear,
      span: 0,
    };
  }

  const low = Math.min(...raw);
  const span = Math.max(...raw) - low;
  if (!(span > 0)) {
    return undefined;
  }
  return { along: raw.map((value) => (value - low) / span), continuous, linear, span };
}

/** How far the ram's rod is out, sample by sample. */
function lengthOf(frames: Mechanism['joints'], ram: RamEnds): number[] | undefined {
  const from = frames[0].findIndex((joint) => joint.id === ram.from);
  const to = frames[0].findIndex((joint) => joint.id === ram.to);
  if (from === -1 || to === -1) {
    return undefined;
  }
  return frames.map((frame) =>
    Math.hypot(frame[to].x - frame[from].x, frame[to].y - frame[from].y)
  );
}

/** How far the input has moved along the line it slides on, sample by sample. */
function strokeOf(frames: Mechanism['joints'], at: number): number[] | undefined {
  const start = frames[0][at];
  // The two ends of the path it actually takes give its direction; a stored
  // angle would only agree with them for one of the ways a slide is built.
  const far = frames.reduce(
    (best, frame) => {
      const distance = Math.hypot(frame[at].x - start.x, frame[at].y - start.y);
      return distance > best.distance ? { distance, x: frame[at].x, y: frame[at].y } : best;
    },
    { distance: 0, x: start.x, y: start.y }
  );
  if (!(far.distance > 0)) {
    return undefined;
  }
  const ux = (far.x - start.x) / far.distance;
  const uy = (far.y - start.y) / far.distance;
  return frames.map((frame) => (frame[at].x - start.x) * ux + (frame[at].y - start.y) * uy);
}

/**
 * How far the crank has turned, sample by sample, unwrapped.
 *
 * Unwrapped so that going round twice reads as twice as far rather than as
 * back where it started, which is what tells a full revolution apart from a
 * rocker that happens to end where it began.
 */
function turnOf(mechanism: Mechanism): number[] | undefined {
  const speeds = mechanism.inputAngularVelocities;
  const times = mechanism.timeNum ?? [];
  if (speeds.length === 0 || times.length !== speeds.length) {
    return undefined;
  }
  // Negated, because the app stores a clockwise drive as a negative speed and
  // the reader expects a clockwise input to run the handle left to right.
  let angle = 0;
  return times.map((time, i) => {
    if (i > 0) {
      angle -= speeds[i - 1] * (time - times[i - 1]);
    }
    return angle;
  });
}

/** Does the input reverse anywhere in the cycle? */
function turnsBack(raw: number[]): boolean {
  let rising = false;
  let falling = false;
  for (let i = 1; i < raw.length; i++) {
    const step = raw[i] - raw[i - 1];
    if (step > 1e-9) rising = true;
    if (step < -1e-9) falling = true;
    if (rising && falling) return true;
  }
  return false;
}

/**
 * The sample at a given place along the track.
 *
 * Searched rather than inverted: the mapping is a sampled curve, and on a
 * machine that turns back it passes every place twice. `near` is the sample the
 * machine is at now, and ties go to whichever leg that is on -- so pulling the
 * handle backwards does not jump it to the other half of the cycle.
 */
export function sampleAlong(profile: DriveProfile, along: number, near: number): number {
  return Math.round(fractionalSampleAlong(profile, along, near));
}

/**
 * The same answer, between samples.
 *
 * A drag is continuous and the samples are not: a degree of crank is a couple
 * of pixels of track, so snapping to the nearest one holds the drawing still
 * for two pixels and then jumps it. Interpolating between the sample found and
 * its neighbour on the side the reader is pointing lets the drawing follow the
 * hand.
 */
export function fractionalSampleAlong(profile: DriveProfile, along: number, near: number): number {
  const at = nearestSample(profile, along, near);
  const last = profile.along.length - 1;
  if (last <= 0) return 0;
  const here = profile.along[at];
  // Toward whichever neighbour lies on the side the reader asked for.
  const step = along > here ? 1 : -1;
  const next = at + step;
  if (next < 0 || next > last) return at;
  const span = profile.along[next] - here;
  if (Math.abs(span) < 1e-9) return at;
  const share = (along - here) / span;
  // Only between the two. Off the end of a loop the nearest sample is the one
  // at the far end -- the right edge of the track being the left edge -- and
  // interpolating away from it would walk back the way the drag came.
  if (!(share > 0 && share < 1)) return at;
  return at + step * share;
}

function nearestSample(profile: DriveProfile, along: number, near: number): number {
  const last = profile.along.length - 1;
  if (last <= 0) {
    return 0;
  }
  if (profile.continuous) {
    // Round the loop: the place next to 0 is 1, not the far side of the track.
    let best = 0;
    let bestCost = Infinity;
    profile.along.forEach((value, sample) => {
      const gap = Math.abs(value - along);
      const cost = Math.min(gap, 1 - gap);
      if (cost < bestCost) {
        bestCost = cost;
        best = sample;
      }
    });
    return best;
  }
  const nearReturning = near > last / 2;
  let best = 0;
  let bestCost = Infinity;
  profile.along.forEach((value, sample) => {
    const returning = sample > last / 2;
    // Enough to break a tie, never enough to reach a place the reader did not
    // point at.
    const cost = Math.abs(value - along) + (returning === nearReturning ? 0 : 1e-3);
    if (cost < bestCost) {
      bestCost = cost;
      best = sample;
    }
  });
  return best;
}
