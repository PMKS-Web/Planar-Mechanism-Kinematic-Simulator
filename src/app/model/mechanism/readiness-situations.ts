import { describeActuator, framePieceAt, groundPinsElsewhere } from '../actuator';
import { Joint, RealJoint } from '../joint';
import { MechanismPartition } from './mechanism-partition';

/**
 * Situations readiness recognizes in a drawing before it says anything about
 * the count or the solve: each is a mistake with a sentence of its own, and
 * each is asked of the machine and, where the mistake splits a linkage, of the
 * whole drawing around it.
 */

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
