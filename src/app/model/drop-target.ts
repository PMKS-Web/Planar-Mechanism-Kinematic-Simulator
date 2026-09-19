import { Joint, PrisJoint, RealJoint, RevJoint } from './joint';
import { Link, RealLink } from './link';
import { Cylinder, cylinderJoints, isInsideCylinder } from './cylinder';

/** Why a candidate joint cannot receive the joint being dragged. */
export type MergeRefusal =
  | 'same-joint'
  | 'shares-a-link'
  | 'prismatic'
  | 'over-constrained'
  | 'own-carrier'
  | 'not-a-real-joint'
  | 'sealed-cylinder'
  | 'own-cylinder'
  | 'driven-joint'
  | 'weld-cannot-survive'
  /**
   * Two different machines, joined at a pose other than the start.
   *
   * Not a fact about the geometry, which is why it is the one refusal here
   * that depends on when it is asked. Mid-cycle the machine being edited is
   * holding the pose under the reader's hand while every other machine has
   * been restored to its own start, so a body fused across that line would be
   * half one and half the other -- and the anchor it would have to be put back
   * on belongs to a topology that no longer exists.
   */
  | 'crosses-machines';

/** What to tell the user when a merge is refused. */
export const MERGE_REFUSAL_MESSAGES: Record<MergeRefusal, string> = {
  'same-joint': 'A joint cannot be merged into itself.',
  'shares-a-link': 'These joints are on the same link, so merging them would collapse it.',
  prismatic:
    'A slider cannot be merged into another joint — its slot would have nothing to ride. Drag the other joint onto the slider instead.',
  'over-constrained':
    'Merging here would tie the same two joints together twice, over-constraining the mechanism.',
  'own-carrier': 'A slider cannot ride on a link it is part of.',
  'not-a-real-joint': 'This joint cannot be merged.',
  'sealed-cylinder': 'A cylinder is one part — attach at one of the joints at its ends instead.',
  'driven-joint':
    'A driven joint can only join two bodies — remove the input first, or attach somewhere else.',
  'own-cylinder': 'A cylinder cannot fold onto itself.',
  'weld-cannot-survive':
    'The joint these would make cannot be welded, and one of them is — merging here would take the weld off without saying so.',
  'crosses-machines':
    'Joining two mechanisms needs the start pose. Press Back to the start pose, then try again.',
};

/**
 * The same refusals, short enough to sit under the ring while the drag lasts.
 *
 * A red ring on its own leaves the reader to guess which of a dozen rules they
 * hit, and the sentence above arrives in a notification *after* the release --
 * by which time the gesture they would have changed is over. These are the
 * words the canvas says during the drag, in the same voice the context menu
 * grays a row in: lowercase, a phrase rather than a sentence, and short enough
 * not to cover the joints on either side of the one being refused.
 */
export const MERGE_REFUSAL_REASONS: Record<MergeRefusal, string> = {
  'same-joint': 'the same joint',
  'shares-a-link': 'already one bar',
  prismatic: 'a slider cannot merge',
  'over-constrained': 'already tied together',
  'own-carrier': 'its own carrier',
  'not-a-real-joint': 'not a joint',
  'sealed-cylinder': 'inside a cylinder',
  'driven-joint': 'a driven pair',
  'own-cylinder': 'the same cylinder',
  'weld-cannot-survive': 'the weld cannot survive',
  'crosses-machines': 'needs the start pose',
};

/**
 * Whether `source` may be folded into `target`, and if not, why.
 *
 * Returns `undefined` when the merge is legal. The reason is returned rather
 * than a bare boolean because the canvas has to tell the user which rule it
 * hit — a joint that silently refuses to snap reads as a broken drag.
 */

/**
 * Whether merging these two would leave a driven joint joining more than two
 * bodies.
 *
 * Counted on the *result* rather than refusing every merge that touches an
 * input: dropping a lone joint onto a driven crank adds no body and is
 * perfectly reasonable.
 */
function drivenWouldLoseItsPair(source: RealJoint, target: RealJoint): boolean {
  if (!source.input && !target.input) return false;
  const bodies = new Set<string>();
  [...source.links, ...target.links].forEach((link) => bodies.add(link.id));
  return bodies.size + (source.ground || target.ground ? 1 : 0) > 2;
}

export function refuseJointMerge(
  source: Joint,
  target: Joint,
  /**
   * The drawing's sealed cylinders, when the caller has them.
   *
   * A mount is only recognizable against the whole mechanism, and the two
   * callers that need the mount rules have that knowledge in different shapes:
   * the service holds the joint list, the live drop ring holds an already
   * resolved set from its per-revision cache and a joint list too *filtered*
   * to resolve one from. Passing the answer rather than the ingredients is
   * what lets both ask this one function -- the ring used to carry a private
   * copy of one mount rule and silently skip the rest.
   */
  cylinders: Cylinder[] = []
): MergeRefusal | undefined {
  if (source.id === target.id) return 'same-joint';
  // A joint inside a cylinder is not an attachment point: a merge into the seal
  // would hang a third joint on the rod and break the part. The joints at the
  // two ends remain legal targets — they are exactly where a cylinder attaches
  // to the rest of the linkage.
  //
  // Asked here rather than only at the commit, which is where it used to live.
  // The seal has a hitbox now (decision S11), so it is a joint a drag can
  // plainly be aimed at: left to `mergeJoints` alone, the ring went green over
  // the square and the refusal arrived on release.
  if (cylinders.some((c) => isInsideCylinder(c, source) || isInsideCylinder(c, target))) {
    return 'sealed-cylinder';
  }
  // A slider can be merged *into* and not out of. Dropping a pin onto one is
  // how a link comes to ride a slot, which is the whole point of the gesture;
  // dragging the slider onto a pin would leave its slot naming a joint that no
  // longer exists, because the survivor of a merge is the target.
  //
  // The rule read both ways while a slider was three objects: the prismatic
  // joint had no hitbox, the coincident pin was what a reader could drag, and
  // merging that pin left the slider behind attached to the survivor. The
  // slider is the joint a reader drags now (Stage 1 of
  // `docs/joint-type-and-cylinder-plan.md`), so only the source is refused.
  if (source instanceof PrisJoint) return 'prismatic';
  if (!(source instanceof RealJoint) || !(target instanceof RealJoint)) return 'not-a-real-joint';

  // A slider merged into one of its own carrier's joints would ride on a link
  // it is now part of: the slot's direction is measured from two joints, one of
  // which has become the block itself, so the constraint refers to its own
  // answer. `isSlotWellFormed` refuses that shape for the PrisJoint, but the
  // merge happens to its paired pin, which that check never sees -- so the
  // assembly stayed non-dangling and unflagged, sliding on itself.
  if (ridesOn(source, target) || ridesOn(target, source)) return 'own-carrier';

  // An input prescribes the freedom between *two* bodies (§2.9), so a merge
  // that would leave three meeting at a driven joint takes away the thing the
  // input names. Refused at the drag, where it is one red ring and a sentence,
  // rather than after the fact — a driven joint an edit has made ambiguous
  // stops the whole mechanism simulating, and the edit that did it is by then
  // several actions ago.
  if (drivenWouldLoseItsPair(source, target)) return 'driven-joint';

  // Two joints on one link collapsing to one point would leave that link a
  // zero-length body — degenerate for every solver downstream.
  if (source.links.some((link) => target.links.some((other) => other.id === link.id))) {
    return 'shares-a-link';
  }

  if (wouldOverConstrain(source, target)) return 'over-constrained';

  // A cylinder folded onto itself is no cylinder. Asked of every ram rather
  // than of the first one found at each joint: a mount can belong to two rams
  // at once -- one ram's rod mount is the next one's barrel mount, which is
  // how a boom and a stick are drawn -- and looking up one cylinder per joint
  // found *different* rams for the two ends and let the merge through. The
  // question is whether any single ram has both of these as its mounts.
  const isMountOf = (cylinder: Cylinder, joint: Joint) =>
    cylinder.mountA.id === joint.id || cylinder.mountB.id === joint.id;
  if (cylinders.some((c) => isMountOf(c, source) && isMountOf(c, target))) {
    return 'own-cylinder';
  }

  // The rule that stood beside this one -- no weld may meet a mount -- is
  // gone: a welded mount is what this whole feature is, and the survivor's
  // weld is checked for survivability in `mergeJoints` before anything is
  // taken apart.

  return undefined;
}

/**
 * Whether the merge would leave two distinct links rigidly holding the same
 * pair of joints, so that one of them adds no freedom and the solvers see a
 * redundant constraint.
 *
 * Sharing *two* joints is the test, not being an exact duplicate. A bar B–C
 * alongside a ternary link B–C–G is the same defect as two bars B–C: B and C
 * are already fixed relative to each other by the ternary body, so the bar
 * over-constrains them. Only pairs are enough to catch it, because any pair
 * shared by two bodies is a pair each one fixes on its own.
 */
function wouldOverConstrain(source: RealJoint, target: RealJoint): boolean {
  return source.links.some((link) => {
    const merged = jointIDSet(link, source.id, target.id);
    return target.links.some((other) => sharedIDCount(merged, jointIDSet(other)) >= 2);
  });
}

/**
 * Whether `joint` slides along a link that `other` is a member of.
 *
 * Asked of the joint itself rather than of a coincident partner: a slider used
 * to be reached from the pin beside it through `connectedJoints`, and only the
 * block that joined the two put them in each other's lists at all.
 */
function ridesOn(joint: RealJoint, other: RealJoint): boolean {
  return (
    joint instanceof PrisJoint &&
    joint.isFloating &&
    joint.carrier!.joints.some((member) => member.id === other.id)
  );
}

function jointIDSet(link: Link, replace?: string, replacement?: string): Set<string> {
  return new Set(link.joints.map((joint) => (joint.id === replace ? replacement! : joint.id)));
}

function sharedIDCount(a: Set<string>, b: Set<string>): number {
  return [...a].filter((id) => b.has(id)).length;
}

/**
 * The joint `source` would merge into if the drag were released at (x, y).
 *
 * Nearest legal candidate within `radius` wins. Ties cannot be resolved
 * meaningfully at this scale, so the first of an exact tie is taken and the
 * user resolves it by moving.
 *
 * Phase 4.3 adds a second kind of drop target — a link body, for creating a
 * slot. When that lands, a joint in range must still win over a link in range:
 * the joint target is the more specific intent, and it is the only one the user
 * can aim at precisely.
 */
export function resolveJointDropTarget(
  source: Joint,
  x: number,
  y: number,
  joints: Joint[],
  radius: number
): RealJoint | undefined {
  let best: RealJoint | undefined;
  let bestDistance = radius;

  joints.forEach((candidate) => {
    // Any real joint, a slider included. Dropping a pin onto one is how a link
    // comes to ride a slot, and while a slider was a prismatic joint with a
    // coincident pin it was that *pin* -- a `RevJoint` -- that this caught. The
    // slider is the joint with the hitbox now, so narrowing to `RevJoint` here
    // would silently take the pin-in-slot gesture away. Which direction is
    // legal is `refuseJointMerge`'s answer, not this filter's.
    if (!(candidate instanceof RealJoint)) return;
    if (refuseJointMerge(source, candidate)) return;
    const distance = Math.hypot(candidate.x - x, candidate.y - y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  });

  return best;
}

/**
 * A slot the drag would cut, if released on a link body (§4.3).
 *
 * `x` and `y` are the drop point projected onto the slot line: the dragged
 * joint is pulled onto it while previewing, the same way joint-snap captures,
 * so where it lands is never a surprise.
 */
export interface SlotDropCandidate {
  carrier: Link;
  a: Joint;
  b: Joint;
  x: number;
  y: number;
}

/**
 * The slot `source` would cut if the drag were released at (x, y).
 *
 * A link with n joints offers up to n(n-1)/2 candidate pairs, so the one whose
 * segment the drop point is nearest wins — and the caller shows which before
 * release, because on anything but a binary link the choice is not obvious from
 * the cursor alone.
 *
 * The segment is used rather than the infinite line through the pair: a point
 * out past the end of a bar is not between those two joints, and claiming that
 * pair would cut a slot where the user is not pointing.
 *
 * A link the dragged joint already belongs to is never offered. It would be a
 * joint sliding in its own body, and offering it only to refuse it would put a
 * red preview on the one link the user is most likely to sweep across. Nor is
 * one holding the other end of the dragged joint's own ram — see
 * `slotWouldFoldACylinder`.
 */
export function resolveSlotDropTarget(
  source: Joint,
  x: number,
  y: number,
  links: Link[],
  radius: number,
  /** The drawing's sealed cylinders, when the caller has them. */
  cylinders: Cylinder[] = []
): SlotDropCandidate | undefined {
  let best: SlotDropCandidate | undefined;
  let bestDistance = radius;

  for (const carrier of links) {
    if (carrier.joints.some((joint) => joint.id === source.id)) continue;
    // Not offered rather than previewed and refused, for the same reason the
    // far end of the link you are holding is not offered: the drawing already
    // says the ram and this body are joined, so there is no rule there worth
    // explaining, and a legal bar further out can still win the drop.
    if (slotWouldFoldACylinder(source, carrier, cylinders)) continue;
    // The pair comes out of the bar in whatever order it holds its joints, so
    // the slot this cuts has no promised direction. Decision S1's rule — slot
    // joint A is the mount, slot joint B the buried end — is about a *sealed*
    // slot, and a slot cut by dropping a joint on a bar is never one: sealing
    // happens at creation and nothing here can reach a cylinder's inside.
    for (const members of slotJointPools(carrier)) {
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          const near = closestPointOnSegment(x, y, members[i], members[j]);
          if (near.distance < bestDistance) {
            bestDistance = near.distance;
            best = { carrier, a: members[i], b: members[j], x: near.x, y: near.y };
          }
        }
      }
    }
  }

  return best;
}

/**
 * Whether a slot on `carrier` would make `source`'s own ram ride a body its
 * other end is already fixed to.
 *
 * The drop pulls the dragged joint onto the carrier's line, and when that line
 * already passes through the ram's other mount there is nowhere for the part to
 * go but shorter. Far enough and it folds inside out — the mount crosses back
 * past its own barrel's buried end, which is a part drawn in an order it cannot
 * be assembled in and a pose the solver then refuses. This is the slot half of
 * `own-cylinder`: the merge path has refused folding a ram onto itself all
 * along, and the two ends being one part is just as true when the thing between
 * them is a slot.
 *
 * Asked of every ram the joint is a mount of, not the first — a shared mount is
 * one ram's rod end and the next one's barrel end, and either of the two far
 * ends lying on the carrier is enough.
 */
export function slotWouldFoldACylinder(
  source: Joint,
  carrier: Link,
  cylinders: Cylinder[]
): boolean {
  const farEnds = cylinders
    .filter((c) => c.mountA.id === source.id || c.mountB.id === source.id)
    .map((c) => (c.mountA.id === source.id ? c.mountB.id : c.mountA.id));
  if (farEnds.length === 0) return false;
  const members = new Set<string>();
  const collect = (link: Link) => link.joints.forEach((joint) => members.add(joint.id));
  collect(carrier);
  if (carrier instanceof RealLink) carrier.subset.forEach(collect);
  return farEnds.some((id) => members.has(id));
}

/**
 * The joint pairs a carrier may hang a slot between, grouped by rigid body.
 *
 * A slot has to lie between two joints of the same drawn bar — that segment is
 * where the channel is cut. A welded compound's `joints` is the union of its
 * sub-links' joints, so pairing across it offered segments joining joints of
 * *different* constituent bars: a diagonal through the compound's empty corner,
 * with the previewed channel floating partly outside the body. Restricting the
 * pairs to one sub-link at a time is exactly the non-welded rule applied to
 * each bar the compound is made of; a link with no subset is unchanged.
 */
function slotJointPools(carrier: Link): Joint[][] {
  if (carrier instanceof RealLink && carrier.subset.length > 0) {
    const pools = carrier.subset
      .filter((leaf): leaf is RealLink => leaf instanceof RealLink)
      .map((leaf) => leaf.joints);
    if (pools.length > 0) return pools;
  }
  return [carrier.joints];
}

function closestPointOnSegment(
  x: number,
  y: number,
  a: Joint,
  b: Joint
): { x: number; y: number; distance: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  // Two coincident joints define no line, so no slot either.
  if (lengthSquared < 1e-12) return { x: a.x, y: a.y, distance: Infinity };
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / lengthSquared));
  const px = a.x + t * dx;
  const py = a.y + t * dy;
  return { x: px, y: py, distance: Math.hypot(x - px, y - py) };
}

/** The joint a drag is currently aimed at, and why it would refuse the merge. */
export interface JointDropCandidate {
  /** Any real joint, a slider included -- see `resolveJointDropTarget`. */
  joint: RealJoint;
  /** Absent when the merge is legal. */
  refusal?: MergeRefusal;
}

/**
 * The joint `source` is aiming at if the drag were released at (x, y),
 * *including* one it is not allowed to merge with.
 *
 * Nearest wins outright, legal or not. A refused joint that silently declines to
 * light up reads as a dead drop zone, so the canvas needs the near miss in order
 * to mark it red and say why. `resolveJointDropTarget` remains the "may I merge"
 * question; this one is "what am I pointing at".
 */
export function resolveDropCandidate(
  source: Joint,
  x: number,
  y: number,
  joints: Joint[],
  radius: number,
  /**
   * Precomputed sealed-cylinder structures, from the service's per-revision
   * cache. Passed in rather than derived here, because deriving per candidate
   * per pointermove is exactly the kind of quadratic work the drag stutter
   * came from.
   *
   * It was also, for a while, the only way to get an answer at all: the
   * caller's `joints` list holds what the reader can see, and the resolution
   * used to enter through a joint that list leaves out — so deriving from it
   * found nothing, which is how the mount rules silently skipped the drag and
   * the refusal arrived at the release with no ring before it. The lookup
   * enters at the seal now, and the seal is a joint the reader can see.
   */
  cylinders: Cylinder[] = []
): JointDropCandidate | undefined {
  let best: JointDropCandidate | undefined;
  let bestDistance = radius;
  // Every ram the dragged joint belongs to, not the first: a shared mount is
  // on two, and excluding only one of them offered the other's own joints as
  // drop targets.
  const sourceCylinders = cylinders.filter((c) =>
    cylinderJoints(c).some((member) => member.id === source.id)
  );
  joints.forEach((candidate) => {
    // A slider is an ordinary target -- see `resolveJointDropTarget`.
    if (!(candidate instanceof RealJoint)) return;
    // The joint under the cursor is the one being dragged; pointing at itself is
    // not a near miss worth reporting.
    if (candidate.id === source.id) return;
    // A joint of the dragged mount's own cylinder is not a target at all —
    // like the far end of a held link, the drawing already says they are one
    // part, so there is nothing to mark red and a legal joint further out can
    // still win.
    if (sourceCylinders.some((c) => cylinderJoints(c).some((m) => m.id === candidate.id))) {
      return;
    }
    const refusal = refuseJointMerge(source, candidate, cylinders);
    // Nor is the other end of the link you are holding. Marking that in red
    // would be explaining something the drawing already says — the two have a
    // bar between them — so it is not a target at all, and a legal joint
    // further out can still win.
    if (refusal === 'shares-a-link') return;
    const distance = Math.hypot(candidate.x - x, candidate.y - y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { joint: candidate, refusal };
    }
  });

  return best;
}
