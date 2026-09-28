import { Joint, PrisJoint, RealJoint } from '../joint';
import { Link } from '../link';
import { assignBodies, BodyAssignment } from './bodies';
import { MechanismPartition, partitionMechanisms } from './mechanism-partition';
import { constraintSystemOf } from './mobility';
import {
  Edit,
  hiddenJoints,
  holdFor,
  isFreeEnd,
  jointsBeside,
  leavesOneMachine,
  MAX_CANDIDATES,
  mergedAt,
  MobilityFix,
} from './mobility-edits';

/**
 * One linkage drawn as two machines, and the one edit that joins them.
 *
 * A reader draws one linkage and leaves a gap in it: a rod dropped beside the
 * crank pin it was meant for, a coupler never drawn between a crank and a
 * rocker. The partition sees two machines on pivots of their own, and the one
 * holding the input runs -- so the drawer used to offer the other an input of
 * its own, or a slider to carry it, and the drawing ran as something nobody
 * drew. Joining the two is the drawing that was meant, where one edit does it:
 * the edit is counted on the two machines together, and offered only where
 * they come out one machine with one degree of freedom that the input drives.
 */

/** A join, and whether its two joints are drawn all but on top of each other. */
export interface Join {
  fix: MobilityFix;
  /** The two joints nearly coincide, rather than merely standing close. */
  beside: boolean;
}

/**
 * How close a free end has to be to a joint of another machine, against the
 * length of its own link, to be read as dropped short of it: a quarter of the
 * link. Further off, it is a link to draw rather than a joint to drag.
 */
const NEAR = 0.25;

/**
 * The join that makes this machine and one other into one that runs: the most
 * likely one, since the join is the whole answer and a list of them would ask
 * the reader to pick a linkage.
 */
export function joinAcross(
  partition: MechanismPartition,
  drawing: { joints: Joint[]; links: Link[] }
): Join | undefined {
  const own = new Set(partition.ownJoints.map((joint) => joint.id));
  if (own.size === 0) return undefined;
  const { mechanisms } = partitionMechanisms(drawing.joints, drawing.links);
  const hidden = hiddenJoints(drawing.joints);
  let tried = 0;
  for (const other of mechanisms) {
    if (other.ownJoints.some((joint) => own.has(joint.id))) continue;
    const trial = trialOf(together(partition, other));
    if (!trial) continue;
    for (const join of candidates(partition, other, drawing.joints, hidden)) {
      if (tried++ >= MAX_CANDIDATES) return undefined;
      if (counts(trial, join.fix)) return join;
    }
  }
  return undefined;
}

/** Two machines handed to the count as one. */
function together(a: MechanismPartition, b: MechanismPartition): MechanismPartition {
  const joints = [...new Set([...a.joints, ...b.joints])];
  return {
    id: a.id,
    joints,
    ownJoints: [...new Set([...a.ownJoints, ...b.ownJoints])],
    links: [...new Set([...a.links, ...b.links])],
    forces: [],
  };
}

/** What the joined machine is counted against: the one input the two have between them. */
function trialOf(whole: MechanismPartition) {
  const inputs = whole.ownJoints.filter(
    (joint): joint is RealJoint => joint instanceof RealJoint && joint.input
  );
  // Two inputs joined are a second question -- which one drives -- that a
  // join does not answer.
  if (inputs.length > 1) return undefined;
  const [driven] = inputs;
  const assignment = assignBodies(whole.joints, whole.links);
  const system = constraintSystemOf(whole.joints, whole.links, assignment);
  if (!system) return undefined;
  return {
    partition: whole,
    driven,
    needsHold: !!driven && holdFor(driven, system, assignment) !== undefined,
    assignment,
  };
}

/**
 * The joins worth counting, nearest first: two joints all but on top of each
 * other; a free end dropped short of a joint of the other machine; a link
 * between a free end of each.
 */
function candidates(
  mine: MechanismPartition,
  other: MechanismPartition,
  joints: Joint[],
  hidden: Set<string>
): Join[] {
  const pins = (partition: MechanismPartition) =>
    partition.ownJoints.filter(
      (joint): joint is RealJoint =>
        joint instanceof RealJoint && !(joint instanceof PrisJoint) && !hidden.has(joint.id)
    );
  const ours = pins(mine);
  const theirs = pins(other);
  const across = (a: RealJoint, b: RealJoint) =>
    (ours.includes(a) && theirs.includes(b)) || (ours.includes(b) && theirs.includes(a));
  const freeEnd = (joint: RealJoint) =>
    joint.links.length === 1 && isFreeEnd(joint, joint.links[0], joints);

  const found: Join[] = [];
  const merge = (joint: RealJoint, onto: RealJoint, beside: boolean) => {
    // A locked joint refuses the drag; the other way round is the same join.
    const [from, to] = joint.locked ? [onto, joint] : [joint, onto];
    if (from.locked) return;
    if (found.some(({ fix }) => fix.kind === 'merge' && sameJoints(fix, from, to))) return;
    found.push({ fix: { kind: 'merge', joint: from, onto: to }, beside });
  };

  jointsBeside(joints, hidden)
    .filter(([joint, onto]) => across(joint, onto))
    .forEach(([joint, onto]) => merge(joint, onto, true));

  const near: [RealJoint, RealJoint, number][] = [];
  for (const end of [...ours, ...theirs].filter(freeEnd)) {
    const reach = NEAR * lengthOf(end, end.links[0]);
    for (const onto of ours.includes(end) ? theirs : ours) {
      const distance = Math.hypot(end.x - onto.x, end.y - onto.y);
      if (distance <= reach) near.push([end, onto, distance]);
    }
  }
  near.sort((a, b) => a[2] - b[2]).forEach(([end, onto]) => merge(end, onto, false));

  const bridges = ours
    .filter(freeEnd)
    .flatMap((end) => theirs.filter(freeEnd).map((to) => [end, to] as const))
    .sort(([a, b], [c, d]) => Math.hypot(a.x - b.x, a.y - b.y) - Math.hypot(c.x - d.x, c.y - d.y));
  bridges.forEach(([joint, to]) =>
    found.push({ fix: { kind: 'connect', joint, to }, beside: false })
  );
  return found;
}

function sameJoints(fix: { joint: RealJoint; onto: RealJoint }, a: RealJoint, b: RealJoint) {
  return (fix.joint === a && fix.onto === b) || (fix.joint === b && fix.onto === a);
}

/** How long the link a free end is on reaches from it. */
function lengthOf(end: RealJoint, link: Link): number {
  return Math.max(0, ...link.joints.map((joint) => Math.hypot(joint.x - end.x, joint.y - end.y)));
}

/** Whether the join leaves the two machines one, with one freedom the input drives. */
function counts(trial: NonNullable<ReturnType<typeof trialOf>>, fix: MobilityFix): boolean {
  const { partition, assignment, driven } = trial;
  if (fix.kind === 'merge') {
    return leavesOneMachine(trial, {
      ...mergedAt(partition.joints, assignment, fix.joint, fix.onto),
      touchesInput: fix.joint === driven || fix.onto === driven,
    });
  }
  if (fix.kind === 'connect') return leavesOneMachine(trial, bridged(trial, assignment, fix));
  return false;
}

/** The two machines with a new link between a free end of each. */
function bridged(
  trial: NonNullable<ReturnType<typeof trialOf>>,
  assignment: BodyAssignment,
  fix: { joint: RealJoint; to: RealJoint }
): Edit {
  const bar = `${fix.joint.id}+${fix.to.id}`;
  return {
    groundedAt: (one) => one.ground,
    joints: trial.partition.joints,
    assignment: {
      ...assignment,
      movingBodies: new Set(assignment.movingBodies).add(bar),
      bodiesAt: (at) => {
        const bodies = assignment.bodiesAt(at);
        if (at === fix.joint || at === fix.to) bodies.add(bar);
        return bodies;
      },
    },
  };
}
