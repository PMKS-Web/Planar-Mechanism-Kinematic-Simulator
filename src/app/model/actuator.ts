/**
 * What a driven joint actually names (§2.9).
 *
 * `input: boolean` on a joint cannot say what an input is. An input prescribes
 * a *relative* freedom between **two bodies**, and a boolean names neither of
 * them. It survives because a grounded crank has an obvious answer and the
 * solvers guess: the kinematic solver reaches for the input joint's first link,
 * the force solver for the first incident real body. Both are already wrong for
 * a grounded input joint carrying more than one link — and a driven *floating*
 * pin, where neither body is the world, makes the guess impossible rather than
 * merely lucky.
 *
 * The record is derived, never stored. `joint.links` order is the serialization
 * order, so deriving from it is what makes the pairing survive a URL round-trip
 * without adding anything to the codec.
 */

import { Joint, PrisJoint, RealJoint } from './joint';
import { Link } from './link';
import { MODEL_SCALE } from './render-scale';
import { describeFrozenCylinderDrive, frozenCylinderAtSeal } from './cylinder-frozen';

/** The world, as a body an actuator can be measured against. */
export const GROUND_BODY = 'ground';

export interface Actuator {
  joint: RealJoint;
  /** What the driven body's freedom is measured *against*. */
  referenceBody: Link | typeof GROUND_BODY;
  /** The body the input moves. */
  drivenBody: Link | typeof GROUND_BODY;
  /** An angle between two bodies, or a length along a slot. */
  kind: 'angle' | 'length';
}

/**
 * Every distinct body meeting at a joint.
 *
 * The far side of a sliding joint is whatever its slot is cut into — the world
 * for a fixed guide, the carrier for a floating one — and that body is not in
 * `links`, so it is added here. Getting this wrong would let a cylinder's own
 * slider look like a one-body joint and pass a restriction meant to catch
 * ambiguity.
 */
export function incidentBodies(joint: RealJoint): (Link | typeof GROUND_BODY)[] {
  const bodies: (Link | typeof GROUND_BODY)[] = [];
  const seen = new Set<string>();
  if (joint.ground) {
    bodies.push(GROUND_BODY);
    seen.add(GROUND_BODY);
  }
  for (const link of joint.links) {
    // A bar pinned down at every joint is the frame, which a grounded joint
    // has already counted. Counted again, the frame bar a student draws
    // between two pivots made the crank's pivot "join 3 bodies" and refused
    // its input.
    if (joint.ground && isFrameBar(link)) continue;
    if (!seen.has(link.id)) {
      bodies.push(link);
      seen.add(link.id);
    }
  }
  if (joint instanceof PrisJoint && joint.carrier && !seen.has(joint.carrier.id)) {
    bodies.push(joint.carrier);
    seen.add(joint.carrier.id);
  }
  return bodies;
}

/**
 * Why a joint cannot be an input, as a kind the setup drawer can write its
 * own sentences from. `describeActuator` says the same thing as one sentence,
 * for a menu row's hover and the Edit panel.
 */
export type ActuatorRefusal =
  'not-a-joint' | 'welded' | 'frozen-cylinder' | 'frame' | 'one-body' | 'many-bodies' | 'no-angle';

/**
 * The actuator this joint would be, or the kind of reason it cannot be one.
 *
 * The v1 restriction is exactly two incident bodies. With three, "the angle
 * between the bodies" names no particular pair, and every answer the solvers
 * could pick is a guess the user never made. Refused with a reason rather than
 * driven wrongly.
 */
export function actuatorOrRefusal(joint: Joint): Actuator | ActuatorRefusal {
  if (!(joint instanceof RealJoint)) return 'not-a-joint';
  // A weld is the statement that these bodies do *not* move relative to each
  // other, so there is no freedom at this joint for an input to prescribe.
  // Most welds fuse their links into one compound and are caught by the count
  // below; one the repair pass has not built yet does not, so the flag is asked
  // directly. Driving one would put a commanded angle on top of the weld's own
  // constraint, and the mechanism would report itself unsolvable rather than
  // saying what was wrong.
  //
  // Never asked of a slider, and that was always the rule: what a Slide holds
  // is its riders' *orientation* against the slot, and the freedom a drive
  // prescribes there is the travel along it -- which is how every cylinder in
  // the app is driven. The bit used to sit on a coincident pin that was not the
  // joint a drive was ever set on, so this never had to say so out loud.
  if (joint.isWelded && !joint.ground && !(joint instanceof PrisJoint)) return 'welded';
  // The same statement made about a cylinder, where it is a weld somewhere else
  // rather than a weld here (decision S25). Both of the part's end joints being
  // in one body leaves one body on each side of the seal, so the slide holds
  // nothing apart and there is no travel for a drive to command. Asked before
  // the count below, which would otherwise answer "a driven joint needs two
  // bodies" -- true, and no use to a reader looking at a cylinder.
  if (frozenCylinderAtSeal(joint)) return 'frozen-cylinder';
  // Asked before the count, which folds a frame bar into the ground and would
  // otherwise answer "needs two bodies" -- true, and no help. The drawing
  // arrives here easily: set a crank's input, then ground its far end, and
  // the partition folds the crank into the frame, so the joint belongs to no
  // mechanism and the reader was told "No input is set" beside its arrow.
  if (framePieceAt(joint)) return 'frame';
  const bodies = incidentBodies(joint);
  if (bodies.length < 2) return 'one-body';
  if (bodies.length > 2) return 'many-bodies';

  // Ground first when it is there: a crank's angle is read from the world, not
  // the world's angle from the crank. `incidentBodies` already puts it first.
  const actuator: Actuator = {
    joint,
    referenceBody: bodies[0],
    drivenBody: bodies[1],
    kind: joint instanceof PrisJoint ? 'length' : 'angle',
  };

  // An angle needs a direction to measure from on each side. Ground supplies
  // one without a joint; a body with no second point of its own does not, and
  // the only body like that is a slider's block, whose pin and prismatic joint
  // sit on top of each other. Driving that pin used to be offered, accepted,
  // and then quietly ignored — 360 samples of a mechanism that never moved.
  if (actuator.kind === 'angle') {
    const missing = [actuator.referenceBody, actuator.drivenBody].some(
      (body) => body !== GROUND_BODY && !angleReference(body, joint)
    );
    if (missing) return 'no-angle';
  }
  return actuator;
}

/**
 * The actuator this joint would be, or why it cannot be one, as the sentence a
 * menu row's hover and the Edit panel show.
 */
export function describeActuator(joint: Joint): Actuator | string {
  const found = actuatorOrRefusal(joint);
  return typeof found === 'string' ? refusalSentence(joint, found) : found;
}

/** What each kind of refusal says, about this joint. */
function refusalSentence(joint: Joint, refusal: ActuatorRefusal): string {
  if (!(joint instanceof RealJoint)) return 'Only a joint can be an input.';
  switch (refusal) {
    case 'not-a-joint':
      return 'Only a joint can be an input.';
    case 'welded':
      return "The links at a welded joint can't move against each other. Set it to Revolute, or Add Input to another joint.";
    case 'frozen-cylinder':
      return describeFrozenCylinderDrive(frozenCylinderAtSeal(joint)!);
    case 'frame': {
      // "Its link" rather than the link's name: a link's id can carry a
      // cylinder's buried joint, which only `visibleBodyName` knows to leave
      // out, and it needs the drawing's cylinders, which a joint cannot see
      // from here.
      const pinned = joint.links.flatMap((link) => groundPinsElsewhere(link, joint));
      const which = [...new Set(pinned.map((one) => one.name || one.id))].join(' and ');
      return joint.links.length === 1
        ? `Its link is also grounded at joint ${which}, so it can't turn. Turn off Grounded for joint ${which} to give the input something to turn.`
        : `Every link on it is also grounded at joint ${which}, so none of them can turn. Turn off Grounded for joint ${which} to give the input something to turn.`;
    }
    case 'one-body':
      return 'An input turns one link against another, or against the ground, and only one link meets here.';
    case 'many-bodies':
      return `${meetingHere(joint)} meet here, so the input can't tell which pair to move. Add Input where exactly two links meet.`;
    case 'no-angle':
      return "A slider's block is a single point, so it has no angle to turn. Add Input at the other end of its link.";
  }
}

/** "3 links", or "2 links and the ground": what meets at a joint, counted. */
export function meetingHere(joint: RealJoint): string {
  const bodies = incidentBodies(joint);
  const links = bodies.filter((body) => body !== GROUND_BODY).length;
  const counted = `${links} ${links === 1 ? 'link' : 'links'}`;
  return bodies.includes(GROUND_BODY) ? `${counted} and the ground` : counted;
}

/**
 * A driven-joint refusal in two lengths: a few words for a menu row's
 * right-hand slot, and the model's own sentence for the hover behind it.
 *
 * One source, two lengths: both are written from the same kind of refusal, so
 * a menu and a panel cannot end up disagreeing about why a joint will not take
 * an input.
 */
export function describeActuatorRefusal(joint: Joint): { short: string; long: string } | undefined {
  const found = actuatorOrRefusal(joint);
  if (typeof found !== 'string') return undefined;
  const long = refusalSentence(joint, found);
  const short: Record<ActuatorRefusal, string> = {
    'not-a-joint': 'not a joint',
    welded: 'welded, no freedom',
    'frozen-cylinder': "can't extend",
    frame: 'link is grounded',
    'one-body': 'needs 2 links',
    'many-bodies': 'more than 2 meet',
    'no-angle': 'no angle here',
  };
  return { short: short[found], long };
}

/**
 * The other joints of `link` that pin it to the frame -- not this one, and not
 * a grounded slider, whose ground fixes a line rather than a point.
 */
export function groundPinsElsewhere(link: Link, joint: RealJoint): RealJoint[] {
  return link.joints.filter(
    (other): other is RealJoint =>
      other instanceof RealJoint &&
      other !== joint &&
      other.ground &&
      !(other instanceof PrisJoint) &&
      !coincident(other, joint)
  );
}

/**
 * Whether a link is part of the frame: pinned to the ground at every joint, so
 * it cannot move and is the ground to anything that meets it. `assignBodies`
 * folds such a bar into the world for the same reason. A grounded slider does
 * not pin its point, so a link riding one is not frame.
 */
export function isFrameBar(link: Link): boolean {
  return (
    link.joints.length > 0 &&
    link.joints.every(
      (joint) => joint instanceof RealJoint && joint.ground && !(joint instanceof PrisJoint)
    )
  );
}

/**
 * Whether every link on this grounded pin is pinned to the frame somewhere
 * else too, which leaves it nothing that can turn: a crank grounded at both
 * ends is part of the frame, not a crank.
 */
export function framePieceAt(joint: Joint): boolean {
  if (!(joint instanceof RealJoint) || !joint.ground || joint instanceof PrisJoint) return false;
  return joint.links.length > 0 && joint.links.every(isFrameBar);
}

/** The actuator this joint would be, or nothing. */
export function resolveActuator(joint: Joint): Actuator | undefined {
  const found = actuatorOrRefusal(joint);
  return typeof found === 'string' ? undefined : found;
}

/** Whether this joint could be driven at all — the panel's enable rule. */
export function canDrive(joint: Joint): boolean {
  return resolveActuator(joint) !== undefined;
}

/**
 * A joint on `body` other than the actuator's own, giving the direction the
 * body's angle is measured along.
 *
 * Canonical rather than clever: the body's first other joint, in the order the
 * link serializes its joints. Any consistent choice works — the angle between
 * two bodies does not depend on which of their points you measure it from,
 * only on staying with the same points from one sample to the next.
 *
 * Any choice except one at the same place. A slider's block carries two joints
 * that are always coincident — the pin, and the prismatic joint it rides on —
 * so "the body's first other joint" hands back a point no distance away, and a
 * direction cannot be read from it. Skipped here, and refused above, because a
 * zero-length reference does not fail loudly: it makes an angle of nothing,
 * every sample, and the mechanism sits perfectly still while claiming to run.
 */
export function angleReference(
  body: Link | typeof GROUND_BODY,
  joint: RealJoint
): Joint | undefined {
  if (body === GROUND_BODY) return undefined;
  return body.joints.find((member) => member.id !== joint.id && !coincident(member, joint));
}

/**
 * Two joints at the same point, to within the tolerance the codec leaves.
 *
 * A URL stores user units to three decimals, so two joints written as
 * coincident come back a rounding step apart rather than exactly equal.
 */
function coincident(a: Joint, b: Joint): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) < 1e-6 * MODEL_SCALE;
}
