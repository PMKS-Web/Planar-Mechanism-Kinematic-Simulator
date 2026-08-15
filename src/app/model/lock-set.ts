import { Joint, PrisJoint, RealJoint } from './joint';
import { Link, SliderBlock } from './link';
import { Force } from './force';
import { cylinderJoints, sealedCylinderStructures } from './cylinder';

/**
 * Which joints a set of Lock marks holds still.
 *
 * A lock is a mark on an object; what a drag has to respect is a set of
 * *joints* that may not move, because both drag operations bottom out in
 * writing joint coordinates. This module is the one place that translation
 * happens, so the drag gates, the panel, and the canvas paint all agree on
 * what is held.
 *
 * The closure is a set of one-way implications, because "held" spreads along
 * *consequence*, not along membership:
 *
 * - A slider's block joint is coincident with its pin, so holding either
 *   holds both — the one symmetric case.
 * - A sealed cylinder's interior joints only ever move as the whole part
 *   moves, so holding one holds all five. A held *mount* stays a held mount:
 *   dragging the other mount anchors it, and a body drag can still swing the
 *   part about it, so the implication deliberately does not run outward.
 * - A floating slot's pin is reseated onto its channel after every edit, so
 *   holding the pin means holding the two joints that define the channel —
 *   but holding a channel joint does not pin the slider that rides it.
 */
export type Lockable = RealJoint | Link | Force;

interface Implication {
  ifAnyOf: string[];
  freeze: string[];
}

/** Everything with a lock mark set, in canvas paint order: joints, links, forces. */
export function lockedObjects(joints: Joint[], links: Link[], forces: Force[]): Lockable[] {
  return [
    ...joints.filter((joint): joint is RealJoint => joint instanceof RealJoint && joint.locked),
    ...links.filter((link) => link.locked),
    ...forces.filter((force) => force.locked),
  ];
}

/** The ids of every joint the current Lock marks hold still. */
export function frozenJointIds(joints: Joint[], links: Link[]): Set<string> {
  const frozen = new Set<string>();
  joints.forEach((joint) => {
    if (joint instanceof RealJoint && joint.locked) frozen.add(joint.id);
  });
  links.forEach((link) => {
    if (link.locked) link.joints.forEach((joint) => frozen.add(joint.id));
  });
  return closeOverConsequences(frozen, joints, links);
}

/**
 * Grow a held set until every implication is satisfied. Iterated to a fixed
 * point — freezing a block joint can seal a cylinder's interior, which can pin
 * a floating slot's channel — and it terminates because each pass only adds.
 */
function closeOverConsequences(frozen: Set<string>, joints: Joint[], links: Link[]): Set<string> {
  const rules: Implication[] = [];

  links.forEach((link) => {
    if (!(link instanceof SliderBlock)) return;
    const pair = link.joints.map((joint) => joint.id);
    rules.push({ ifAnyOf: pair, freeze: pair });
  });

  sealedCylinderStructures(joints).forEach((sealed) => {
    rules.push({
      ifAnyOf: [sealed.pin.id, sealed.slider.id, sealed.barrelNear.id],
      freeze: cylinderJoints(sealed).map((joint) => joint.id),
    });
  });

  joints.forEach((joint) => {
    if (!(joint instanceof PrisJoint) || !joint.isFloating) return;
    const slotA = joint.slotJointA;
    const slotB = joint.slotJointB;
    if (!slotA || !slotB) return;
    rules.push({ ifAnyOf: [joint.id], freeze: [slotA.id, slotB.id] });
  });

  let grew = true;
  while (grew) {
    grew = false;
    for (const rule of rules) {
      if (!rule.ifAnyOf.some((id) => frozen.has(id))) continue;
      for (const id of rule.freeze) {
        if (!frozen.has(id)) {
          frozen.add(id);
          grew = true;
        }
      }
    }
  }
  return frozen;
}

/**
 * The locked objects that hold this joint still — what an Unlock action has
 * to clear for the joint to move again. Each locked mark is asked alone: the
 * closure of just that mark either reaches the joint or it does not.
 */
export function locksHolding(jointId: string, joints: Joint[], links: Link[]): Lockable[] {
  return lockedObjects(joints, links, []).filter((locked) => {
    const seed = new Set<string>();
    if (locked instanceof RealJoint) seed.add(locked.id);
    else if (locked instanceof Link) locked.joints.forEach((joint) => seed.add(joint.id));
    return closeOverConsequences(seed, joints, links).has(jointId);
  });
}
