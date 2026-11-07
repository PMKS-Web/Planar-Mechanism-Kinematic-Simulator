/**
 * Whether a machine's start may move to the pose on screen.
 *
 * "Move the start here" rebuilds the design from the pose the reader is parked
 * at, and a fixed angle is a number of the design. So a crank fixed at -49 deg
 * and parked a little way round came back fixed at -37 deg: the one value the
 * reader had said not to change was changed by a control that never mentioned
 * it. A fixed length cannot be turned by the motion, so only angles refuse.
 */

import { Joint } from './joint';
import { RealLink } from './link';
import { HoldChip } from './hold-chips';
import { holdList } from './link-holds';

/** Below this a fixed angle has not turned; the solver's own noise is far smaller. */
const TURN_TOLERANCE_RAD = 1e-6;

/** The grayed row's two readings: beside the label, and on hover. */
export interface StartMoveRefusal {
  short: string;
  long: string;
}

/**
 * The fixed angles that point somewhere else at `start` than they do now.
 *
 * `chips` is what reads as held on the drawing at the pose on screen, and
 * `start` is the same machine's joints at its start. A held bar that keeps its
 * bearing through the cycle -- a parallelogram's coupler -- has not turned, so
 * it does not refuse.
 */
export function anglesTurnedSince(chips: readonly HoldChip[], start: readonly Joint[]): HoldChip[] {
  const at = new Map(start.map((joint) => [joint.id, joint]));
  return chips.filter(({ hold, a, b }) => {
    const a0 = at.get(a.id);
    const b0 = at.get(b.id);
    if (hold !== 'angle' || !a0 || !b0) return false;
    const turn = Math.atan2(b.y - a.y, b.x - a.x) - Math.atan2(b0.y - a0.y, b0.x - a0.x);
    return Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn))) > TURN_TOLERANCE_RAD;
  });
}

/**
 * Why the start may not move here, or nothing when it may.
 *
 * The fix names the control that undoes a hold, as the menu row and the
 * panel's padlock both say it: Fixed Angle.
 */
export function refuseMovingStart(
  turned: readonly RealLink[],
  joints?: readonly Joint[]
): StartMoveRefusal | undefined {
  if (turned.length === 0) return undefined;
  const one = turned.length === 1;
  return {
    short: one ? holdList(turned, joints) : `${turned.length} fixed angles`,
    long:
      `Starting here would turn ${holdList(turned, joints)}. ` +
      `Turn off ${one ? 'its' : 'their'} Fixed Angle first.`,
  };
}
