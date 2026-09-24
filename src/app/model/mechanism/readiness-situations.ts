import { describeActuator, framePieceAt, groundPinsElsewhere, isFrameBar } from '../actuator';
import { Joint, RealJoint } from '../joint';
import { Link } from '../link';
import { MechanismPartition } from './mechanism-partition';
import { hiddenJoints, jointsBeside } from './mobility-edits';

/**
 * Situations readiness recognizes in a drawing before it says anything about
 * the count or the solve: each is a mistake with a sentence of its own, and
 * each is asked of the machine and, where the mistake splits a linkage, of the
 * whole drawing around it.
 */

/**
 * A machine that is one link on one grounded pin another machine also uses,
 * and the pin it hangs from.
 */
export function hangingLink(
  partition: MechanismPartition
): { link: Link; pivot: RealJoint } | undefined {
  const moving = partition.links.filter((link) =>
    link.joints.some((joint) => !(joint instanceof RealJoint && joint.ground))
  );
  if (moving.length !== 1) return undefined;
  const [link] = moving;
  const pivots = link.joints.filter(
    (joint): joint is RealJoint => joint instanceof RealJoint && joint.ground
  );
  const free = link.joints.filter(
    (joint) => joint instanceof RealJoint && !joint.ground && joint.links.length === 1
  );
  // Drawn off a pivot the rest of the linkage uses. A lone crank on a pivot of
  // its own is a crank nobody has driven yet, and "No input is set" is true of it.
  const shared = pivots[0]?.links.some((other) => !partition.links.includes(other));
  return pivots.length === 1 && free.length === link.joints.length - 1 && shared
    ? { link, pivot: pivots[0] }
    : undefined;
}

/**
 * A joint of this machine drawn beside a joint of some other part of the
 * drawing, with no link between them: the stray one first, then the one it was
 * surely meant to land on, whichever of them is this machine's.
 */
export function besideAnother(
  partition: MechanismPartition,
  drawing: Joint[]
): [RealJoint, RealJoint] | undefined {
  const own = new Set(partition.ownJoints);
  const mine = new Set(partition.joints);
  // In the order `jointsBeside` puts them -- the one that was dropped, then
  // the one it was meant for -- whichever of the two is this machine's.
  return jointsBeside(drawing, hiddenJoints(drawing)).find(
    ([a, b]) => (own.has(a) && !mine.has(b)) || (own.has(b) && !mine.has(a))
  );
}

/**
 * Whether this machine shares a pin with another and the drawing has an input
 * outside it: a linkage split in two -- a moving joint grounded -- whose input
 * is on the other half. Joining the halves is the fix, so asking this half for
 * an input of its own would set a second one.
 */
export function splitFromADrivenOne(partition: MechanismPartition, drawing: Joint[]): boolean {
  const shared = partition.ownJoints.some(
    (joint) =>
      joint instanceof RealJoint &&
      joint.links.some((link) => !partition.links.includes(link) && !isFrameBar(link))
  );
  const own = new Set(partition.ownJoints);
  return (
    shared && drawing.some((joint) => joint instanceof RealJoint && joint.input && !own.has(joint))
  );
}

/**
 * An input set on a link that has since been grounded at its other end too.
 *
 * The link is then part of the frame, so the partition gives the joint to no
 * mechanism, and the machine it hangs off solved as if nothing drove it: "No
 * input is set", said beside the input's own arrow. The joint is still in this
 * mechanism's `joints` -- a frame piece is handed to the machine it touches --
 * so it is found there, and the refusal is the actuator model's own sentence.
 */
export function inputOnTheFrame(
  partition: MechanismPartition
): { joint: RealJoint; refusal: string; unground?: RealJoint } | undefined {
  const own = new Set(partition.ownJoints.map((joint) => joint.id));
  for (const joint of partition.joints) {
    if (!(joint instanceof RealJoint) || !joint.input || own.has(joint.id)) continue;
    if (!framePieceAt(joint)) continue;
    const refusal = describeActuator(joint);
    if (typeof refusal !== 'string') continue;
    const link = joint.links[0];
    return { joint, refusal, unground: link ? groundPinsElsewhere(link, joint)[0] : undefined };
  }
  return undefined;
}
