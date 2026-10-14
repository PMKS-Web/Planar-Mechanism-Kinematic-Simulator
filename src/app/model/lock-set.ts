import { Joint, RealJoint } from './joint';
import { Link } from './link';
import { Force } from './force';
import { Cylinder, cylinderJoints, cylindersIn } from './cylinder';

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
 * - A sealed cylinder's interior joints only ever move as the whole part
 *   moves, so holding one holds all of them. A held *mount* stays a held
 *   mount: dragging the other mount anchors it, and a body drag can still
 *   swing the part about it, so the implication deliberately does not run
 *   outward.
 *
 * There was a symmetric case beside it until Stage 1 of
 * `docs/joint-type-and-cylinder-plan.md`: a slider was a prismatic joint and a
 * coincident pin joined by a zero-length block, so holding either had to hold
 * both. A slider is one joint now, so the pair that rule spoke about does not
 * exist and the rule went with it.
 *
 * A floating slider is still the one mark that is not about a point on the
 * drawing. It has exactly one freedom — where it sits along its slot — and
 * that is what its mark spends: the channel stays free, and the reseat carries
 * the slider along at the offset it was locked at. So the mark reaches itself
 * and stops. Holding the pair of joints that cuts the channel, which is what a
 * world-position lock would have to do, froze two joints the reader never
 * marked and had no way to predict from the one they did.
 */
export type Lockable = RealJoint | Force;

interface Implication {
  ifAnyOf: string[];
  freeze: string[];
}

/**
 * The ids of every joint the current Lock marks hold still.
 *
 * `sealedParts` lets a caller that already keeps the assembly walk cached hand it
 * over. This is asked from template bindings, several times per joint per
 * change-detection pass, and rediscovering every sealed cylinder each time is
 * the whole cost of the answer on a drawing with no locks in it at all.
 */
export function frozenJointIds(
  joints: Joint[],
  links: Link[],
  sealedParts?: Cylinder[]
): Set<string> {
  const frozen = new Set<string>();
  joints.forEach((joint) => {
    if (joint instanceof RealJoint && joint.locked) frozen.add(joint.id);
  });
  // Nothing is marked, so no implication can fire and nothing has to be walked
  // to prove it: every rule below is guarded on the set already holding one of
  // its antecedents.
  if (frozen.size === 0) return frozen;
  return closeOverConsequences(frozen, joints, links, sealedParts);
}

/**
 * Grow a held set until every implication is satisfied. Iterated to a fixed
 * point — a drawing can chain them, two rams sharing a mount being the way —
 * and it terminates because each pass only adds.
 */
function closeOverConsequences(
  frozen: Set<string>,
  joints: Joint[],
  links: Link[],
  sealedParts?: Cylinder[]
): Set<string> {
  const rules: Implication[] = [];

  (sealedParts ?? cylindersIn(joints)).forEach((sealed) => {
    rules.push({
      ifAnyOf: [sealed.seal.id, sealed.inner.id],
      freeze: cylinderJoints(sealed).map((joint) => joint.id),
    });
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
export function locksHolding(
  jointId: string,
  joints: Joint[],
  links: Link[],
  sealedParts?: Cylinder[]
): Lockable[] {
  return joints
    .filter((joint): joint is RealJoint => joint instanceof RealJoint && joint.locked)
    .filter((locked) =>
      closeOverConsequences(new Set([locked.id]), joints, links, sealedParts).has(jointId)
    );
}
