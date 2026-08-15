import { Joint, PrisJoint, RealJoint } from './joint';
import { Link, RealLink, SliderBlock } from './link';
import { Force } from './force';
import { cylinderJoints, sealedCylinderStructures } from './cylinder';

/**
 * Which joints the current Lock marks hold still.
 *
 * There is exactly one kind of positional lock: a mark on a *joint*. Locking
 * a link is a shortcut that marks all of its joints, and unlocking one of
 * those joints afterwards frees exactly that joint — there is no second,
 * link-level ledger to keep in agreement with the first. (It also means a
 * weld can never hide a lock: welding restructures links, and the marks do
 * not live on links.) Forces carry their own mark, having no joints.
 *
 * What a drag has to respect is still a *set* of held joints, because some
 * joints travel together whatever the drag asked. The closure is a set of
 * one-way implications — "held" spreads along consequence, not membership:
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
export type Lockable = RealJoint | Force;

interface Implication {
  ifAnyOf: string[];
  freeze: string[];
}

/**
 * Every body, welded or free: the roots and the leaves inside each compound.
 * The closure walks them all so a slider block buried by a weld still binds
 * its coincident pair.
 */
function allBodies(links: Link[]): Link[] {
  return links.flatMap((link) => [link, ...(link instanceof RealLink ? link.subset : [])]);
}

/** The ids of every joint the current Lock marks hold still. */
export function frozenJointIds(joints: Joint[], links: Link[]): Set<string> {
  const frozen = new Set<string>();
  joints.forEach((joint) => {
    if (joint instanceof RealJoint && joint.locked) frozen.add(joint.id);
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

  allBodies(links).forEach((link) => {
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
 * The marks that hold this joint still — what an Unlock action has to clear
 * for the joint to move again. Each marked joint is asked alone: the closure
 * of just that mark either reaches the joint or it does not.
 */
export function locksHolding(jointId: string, joints: Joint[], links: Link[]): Lockable[] {
  return joints
    .filter((joint): joint is RealJoint => joint instanceof RealJoint && joint.locked)
    .filter((locked) => closeOverConsequences(new Set([locked.id]), joints, links).has(jointId));
}
