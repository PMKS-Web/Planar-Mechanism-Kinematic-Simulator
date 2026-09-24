import { isFrameBar } from '../actuator';
import { Joint, PrisJoint, RealJoint } from '../joint';
import { Link, RealLink } from '../link';
import { assignBodies, BodyAssignment, WORLD } from './bodies';
import { ConstraintSystem, holdTurn } from './mobility';
import {
  Edit,
  isFreeEnd,
  jointsBeside,
  leavesOneMachine,
  MAX_CANDIDATES,
  mergedAt,
  MobilityFix,
  staysHeld,
  Trial,
  unweldedAt,
  withoutBody,
} from './mobility-edits';

/**
 * The single edits that would give a mechanism one degree of freedom, each
 * counted on the drawing it would leave (`mobility-edits.ts`).
 */

/**
 * Grounding one loose joint, counted: one machine, one degree of freedom without
 * the hold, none with it.
 *
 * The bodies are assigned again rather than pinned where they are, because that
 * is what the Grounded switch does to the drawing: a link whose last free end is
 * grounded becomes frame, and the chain through the joint stops being one chain.
 */
export function groundingFixes(
  trial: Trial,
  looseJoints: RealJoint[],
  hidden: Set<string>
): MobilityFix[] {
  const { joints, links } = trial.partition;
  const fixes: MobilityFix[] = [];
  for (const joint of looseJoints.slice(0, MAX_CANDIDATES)) {
    if (joint instanceof PrisJoint || joint.ground || hidden.has(joint.id)) continue;
    const groundedAt = (one: RealJoint) => one === joint || one.ground;
    const edit: Edit = {
      groundedAt,
      assignment: assignBodies(joints, links, groundedAt),
      touchesInput: joint === trial.driven,
    };
    if (leavesOneMachine(trial, edit)) fixes.push({ kind: 'ground', joint });
  }
  return fixes;
}

/**
 * The edits that could free a mechanism nothing can move, counted.
 *
 * Asked in the order a reader would try them: a ground that is one too many, a
 * Prismatic joint that would move if it were allowed to turn, then a link that
 * is one too many. Each is a different drawing, so each is described by what
 * the edit changes and counted on its own.
 */
export function rigidFixes(
  trial: Trial,
  assignment: BodyAssignment,
  own: Set<string>,
  hidden: Set<string>
): MobilityFix[] {
  const { joints, links } = trial.partition;
  const asDrawn = (joint: RealJoint) => joint.ground;
  const fixes: MobilityFix[] = [];
  let tried = 0;
  const counts = (edit: Edit): boolean => {
    tried++;
    return leavesOneMachine(trial, edit);
  };

  for (const joint of joints) {
    if (tried >= MAX_CANDIDATES) break;
    if (!(joint instanceof RealJoint) || joint instanceof PrisJoint || !joint.ground) continue;
    // The driven joint's ground is what the input turns against.
    if (joint === trial.driven || !own.has(joint.id) || hidden.has(joint.id)) continue;
    // A pin another machine also hangs from is counted with that machine too
    // (`ungroundAcross`): ungrounding it joins the two, and this one alone
    // cannot say what the other brings.
    if (joint.links.some((link) => !links.includes(link) && !isFrameBar(link))) continue;
    // Assigned again rather than edited: a bar pinned down at both ends is part
    // of the frame, and it stops being frame the moment one end is ungrounded.
    const groundedAt = (one: RealJoint) => one !== joint && one.ground;
    if (counts({ groundedAt, assignment: assignBodies(joints, links, groundedAt) })) {
      fixes.push({ kind: 'unground', joint });
    }
  }

  for (const joint of joints) {
    if (tried >= MAX_CANDIDATES) break;
    if (!(joint instanceof PrisJoint) || joint.rotates || joint.isSealed) continue;
    if (!own.has(joint.id) || hidden.has(joint.id)) continue;
    const rotates = (one: PrisJoint) => one === joint || one.rotates;
    if (counts({ groundedAt: asDrawn, assignment, rotates })) {
      fixes.push({ kind: 'pin-in-slot', joint });
    }
  }

  // A pin welded that was meant to turn: Welded is one choice away from
  // Revolute in the joint's type, and nothing on the canvas says which a
  // joint is until it refuses to move.
  for (const joint of joints) {
    if (tried >= MAX_CANDIDATES) break;
    if (!(joint instanceof RealJoint) || joint instanceof PrisJoint || !joint.isWelded) continue;
    if (!own.has(joint.id) || hidden.has(joint.id)) continue;
    const edit = unweldedAt(joints, links, assignment, joint, trial.driven);
    if (edit && counts(edit)) fixes.push({ kind: 'unweld', joint });
  }

  const bodyCount = new Map<string, number>();
  links.forEach((link) => {
    const body = assignment.bodyOf(link);
    bodyCount.set(body, (bodyCount.get(body) ?? 0) + 1);
  });
  for (const link of links) {
    if (tried >= MAX_CANDIDATES) break;
    if (!(link instanceof RealLink)) continue;
    const body = assignment.bodyOf(link);
    // Only a link that is a body of its own: deleting one member of a welded
    // group is not deleting a body, and a cylinder's parts go with the cylinder.
    if (body === WORLD || bodyCount.get(body) !== 1) continue;
    if (link.joints.some((joint) => hidden.has(joint.id) || !own.has(joint.id))) continue;
    // Only a brace: every joint it meets keeps two links, or one and the
    // ground, once it is gone. Deleting the rod of a slider-crank does leave
    // one freedom -- the crank's -- by stranding the slider, and deleting a
    // coupler leaves a crank turning on its own; that is taking the mechanism
    // apart, not fixing it.
    if (!link.joints.every((joint) => staysHeld(joint, link))) continue;
    const kept = links.filter((one) => one !== link);
    if (counts({ groundedAt: asDrawn, assignment: withoutBody(assignment, body), links: kept })) {
      fixes.push({ kind: 'delete-link', link });
    }
  }
  return fixes;
}

/**
 * Two joints drawn beside each other, merged: the likeliest single mistake
 * there is, and the one no other fix recovers -- grounding the stray joint, or
 * hanging a link off it, makes a drawing that runs and is not the one meant.
 * Asked first, and counted like every other fix.
 */
export function mergeFixes(
  trial: Trial,
  assignment: BodyAssignment,
  own: Set<string>,
  hidden: Set<string>
): MobilityFix[] {
  const { joints } = trial.partition;
  return jointsBeside(joints, hidden)
    .filter(([joint, onto]) => own.has(joint.id) || own.has(onto.id))
    .slice(0, MAX_CANDIDATES)
    .filter(([joint, onto]) =>
      leavesOneMachine(trial, {
        ...mergedAt(joints, assignment, joint, onto),
        touchesInput: joint === trial.driven || onto === trial.driven,
      })
    )
    .map(([joint, onto]): MobilityFix => ({ kind: 'merge', joint, onto }));
}

/**
 * A link left hanging -- one end on the mechanism, the other on nothing --
 * deleted. Whether that is the fix depends on what the reader meant: it is as
 * likely the first bar of more linkage, which is why the sentence offers the
 * link to ground beside it rather than instead of it.
 */
export function danglingDeletes(
  trial: Trial,
  assignment: BodyAssignment,
  own: Set<string>,
  hidden: Set<string>
): MobilityFix[] {
  const { links, joints } = trial.partition;
  const freeEnd = (joint: Joint, link: Link) =>
    isFreeEnd(joint, link, joints) && !(joint as RealJoint).input;
  // What the link hung from keeps what it had before the link was drawn: a
  // crank's tip is a crank's tip again. Only a joint left on nothing at all
  // would be taken apart.
  const keptOn = (joint: Joint, link: Link) =>
    joint instanceof RealJoint && (joint.ground || joint.links.some((one) => one !== link));
  const fixes: MobilityFix[] = [];
  for (const link of links.slice(0, MAX_CANDIDATES)) {
    if (!(link instanceof RealLink)) continue;
    const body = assignment.bodyOf(link);
    if (body === WORLD || links.some((one) => one !== link && assignment.bodyOf(one) === body)) {
      continue;
    }
    if (link.joints.some((joint) => hidden.has(joint.id) || !own.has(joint.id))) continue;
    if (!link.joints.some((joint) => freeEnd(joint, link))) continue;
    if (!link.joints.every((joint) => freeEnd(joint, link) || keptOn(joint, link))) continue;
    const kept = links.filter((one) => one !== link);
    const edit: Edit = {
      groundedAt: (one) => one.ground,
      assignment: withoutBody(assignment, body),
      links: kept,
      joints: trial.partition.joints.filter(
        (joint) => !(link.joints.includes(joint) && freeEnd(joint, link))
      ),
    };
    if (leavesOneMachine(trial, edit)) fixes.push({ kind: 'delete-link', link });
  }
  return fixes;
}

/**
 * The link to take off an input's pivot, where a third body there leaves the
 * input unable to say which to turn: a brace drawn from the crank's pivot, or
 * a link left hanging off it. Counted with the input held on the one link that
 * is left, because the drawing as it stands has no input to hold.
 */
export function untangleFixes(
  trial: Trial,
  assignment: BodyAssignment,
  own: Set<string>,
  hidden: Set<string>
): MobilityFix[] {
  const { driven } = trial;
  if (!driven || driven instanceof PrisJoint || !driven.ground) return [];
  const atInput = driven.links.filter(
    (link): link is RealLink => link instanceof RealLink && !isFrameBar(link)
  );
  if (atInput.length !== 2) return [];
  const { links, joints } = trial.partition;
  const freeEnd = (joint: Joint, link: Link) => isFreeEnd(joint, link, joints);
  const fixes: MobilityFix[] = [];
  const holdOn = (kept: Link) => (system: ConstraintSystem) =>
    holdTurn(system.bodyAt(assignment.bodyOf(kept)), system.bodyAt(WORLD));
  for (const link of atInput) {
    const [kept] = atInput.filter((one) => one !== link);
    // A link hanging off the pivot and nothing else turns on its own, so the
    // partition made it a machine of its own and it is not among these links.
    // Deleting it changes nothing here but which body the input turns.
    if (!links.includes(link)) {
      const hanging = link.joints.every((joint) => joint === driven || freeEnd(joint, link));
      const asItIs: Edit = { groundedAt: (one) => one.ground, assignment, hold: holdOn(kept) };
      if (hanging && links.includes(kept) && leavesOneMachine(trial, asItIs)) {
        fixes.push({ kind: 'delete-link', link });
      }
      continue;
    }
    const body = assignment.bodyOf(link);
    if (body === WORLD || links.some((one) => one !== link && assignment.bodyOf(one) === body)) {
      continue;
    }
    if (link.joints.some((joint) => hidden.has(joint.id) || !own.has(joint.id))) continue;
    if (
      !link.joints.every(
        (joint) => joint === driven || freeEnd(joint, link) || staysHeld(joint, link)
      )
    ) {
      continue;
    }
    const edit: Edit = {
      groundedAt: (one) => one.ground,
      assignment: withoutBody(assignment, body),
      links: links.filter((one) => one !== link),
      joints: trial.partition.joints.filter(
        (joint) => !(link.joints.includes(joint) && freeEnd(joint, link))
      ),
      hold: holdOn(kept),
    };
    if (leavesOneMachine(trial, edit)) fixes.push({ kind: 'delete-link', link });
  }
  // Or the far end of one of them grounded, which makes it frame: the bar a
  // student draws between two pivots, with the second pivot left ungrounded.
  for (const link of atInput) {
    const loose = link.joints.filter(
      (joint): joint is RealJoint =>
        joint !== driven &&
        joint instanceof RealJoint &&
        !joint.ground &&
        !(joint instanceof PrisJoint)
    );
    if (loose.length !== 1 || hidden.has(loose[0].id) || !own.has(loose[0].id)) continue;
    const [pivot] = loose;
    const [kept] = atInput.filter((one) => one !== link);
    const groundedAt = (one: RealJoint) => one === pivot || one.ground;
    const edit: Edit = {
      groundedAt,
      assignment: assignBodies(trial.partition.joints, links, groundedAt),
      hold: holdOn(kept),
    };
    if (leavesOneMachine(trial, edit)) fixes.push({ kind: 'ground', joint: pivot });
  }
  return fixes;
}

/**
 * A grounded joint that one linkage was split in two at, ungrounded: counted on
 * both halves together, because each half alone is rigid and neither can see
 * that the other is the freedom it lost. A moving joint grounded by mistake is
 * how this happens -- the count on each side is below one, and a local fix,
 * ungrounding a real pivot, only moves the problem to the other half.
 */
export function ungroundAcross(
  trial: Trial,
  drawing: { joints: Joint[]; links: Link[] },
  own: Set<string>,
  hidden: Set<string>
): MobilityFix[] {
  const { partition } = trial;
  const fixes: MobilityFix[] = [];
  const pins = partition.joints.filter(
    (joint): joint is RealJoint =>
      joint instanceof RealJoint &&
      joint.ground &&
      !(joint instanceof PrisJoint) &&
      joint !== trial.driven &&
      own.has(joint.id) &&
      !hidden.has(joint.id) &&
      joint.links.some((link) => !partition.links.includes(link) && !isFrameBar(link))
  );
  for (const pin of pins.slice(0, MAX_CANDIDATES)) {
    const groundedAt = (one: RealJoint) => one !== pin && one.ground;
    const moving = reachable(partition.links, groundedAt, drawing.joints);
    // With the frame each half is solved against: a bar pinned down at both
    // ends is handed to every machine it touches, and left out, a half with a
    // slot cut into one counts a freedom it does not have.
    const touched = new Set(moving.flatMap((link) => link.joints));
    const frame = drawing.links.filter(
      (link) => isFrameBar(link) && link.joints.some((joint) => touched.has(joint))
    );
    const links = [...moving, ...frame];
    const joints = [...new Set(links.flatMap((link) => link.joints))];
    const whole = { ...partition, joints, ownJoints: joints, links };
    const driven =
      trial.driven ??
      joints.find((joint): joint is RealJoint => joint instanceof RealJoint && joint.input);
    const edit: Edit = { groundedAt, assignment: assignBodies(joints, links, groundedAt) };
    if (leavesOneMachine({ ...trial, partition: whole, driven }, edit)) {
      fixes.push({ kind: 'unground', joint: pin });
    }
  }
  return fixes;
}

/**
 * Every link joined to these through a joint that is not pinned down, or
 * through a slot: a slider riding a link joins its own links to that one, and
 * a cylinder's rod is reached from its barrel no other way.
 */
function reachable(
  start: Link[],
  groundedAt: (joint: RealJoint) => boolean,
  joints: Joint[]
): Link[] {
  const found = new Set(start);
  const queue = [...start];
  const add = (other: Link) => {
    if (!found.has(other) && !isFrameBar(other)) {
      found.add(other);
      queue.push(other);
    }
  };
  while (queue.length) {
    const link = queue.pop()!;
    joints
      .filter((one): one is PrisJoint => one instanceof PrisJoint && one.carrier === link)
      .forEach((slider) => slider.links.forEach(add));
    for (const joint of link.joints) {
      if (!(joint instanceof RealJoint)) continue;
      if (groundedAt(joint) && !(joint instanceof PrisJoint)) continue;
      joint.links.forEach(add);
      if (joint instanceof PrisJoint && joint.carrier) add(joint.carrier);
    }
  }
  return [...found];
}

/**
 * A link from a free end to a grounded pivot that has nothing on it. Deleting
 * a link leaves its pivot behind as a joint on its own, and the free end it
 * held is the other half of the same mistake: joining them is the drawing that
 * was there before.
 */
export function reconnectFixes(
  trial: Trial,
  assignment: BodyAssignment,
  drawing: { joints: Joint[]; links: Link[] },
  looseJoints: RealJoint[],
  hidden: Set<string>
): MobilityFix[] {
  const pivots = drawing.joints.filter(
    (joint): joint is RealJoint =>
      joint instanceof RealJoint &&
      joint.ground &&
      !(joint instanceof PrisJoint) &&
      joint.links.length === 0 &&
      !hidden.has(joint.id)
  );
  const ends = looseJoints.filter(
    (joint) => !joint.ground && !(joint instanceof PrisJoint) && !hidden.has(joint.id)
  );
  const pairs = ends
    .flatMap((end) => pivots.map((pivot) => [end, pivot] as const))
    .sort(([a, b], [c, d]) => Math.hypot(a.x - b.x, a.y - b.y) - Math.hypot(c.x - d.x, c.y - d.y));
  const fixes: MobilityFix[] = [];
  for (const [end, pivot] of pairs.slice(0, MAX_CANDIDATES)) {
    const bar = `${end.id}+${pivot.id}`;
    const movingBodies = new Set(assignment.movingBodies).add(bar);
    const edit: Edit = {
      groundedAt: (one) => one.ground,
      joints: [...trial.partition.joints, pivot],
      assignment: {
        ...assignment,
        movingBodies,
        bodiesAt: (at) => {
          const bodies = assignment.bodiesAt(at);
          if (at === end || at === pivot) bodies.add(bar);
          return bodies;
        },
      },
    };
    if (leavesOneMachine(trial, edit)) fixes.push({ kind: 'connect', joint: end, to: pivot });
  }
  return fixes;
}
