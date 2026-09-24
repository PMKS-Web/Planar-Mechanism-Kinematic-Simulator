import { Joint, PrisJoint, RealJoint } from '../joint';
import { Link, RealLink } from '../link';
import { assignBodies, BodyAssignment, WORLD } from './bodies';
import { MechanismPartition } from './mechanism-partition';
import {
  Constraint,
  ConstraintSystem,
  constraintSystemOf,
  freeDirectionsOf,
  freedomsOf,
  pointMotion,
} from './mobility';
import { hiddenJoints, holdFor, MAX_FIXES, MobilityFix, STILL, Trial } from './mobility-edits';
import { describeActuator } from '../actuator';
import {
  danglingDeletes,
  groundingFixes,
  mergeFixes,
  reconnectFixes,
  rigidFixes,
  ungroundAcross,
  untangleFixes,
} from './mobility-fixes';
import { fastestJoint, freeMotionOf, startOf, StuckInput, stuckInput } from './stuck-input';

export type { MobilityFix } from './mobility-edits';

/** Every joint and link in the drawing, across every machine it holds. */
export interface Drawing {
  joints: Joint[];
  links: Link[];
}
export type { StuckInput } from './stuck-input';

/**
 * Which parts of a mechanism move without being told to, and which one edit
 * would fix that.
 *
 * "This mechanism has 2 degrees of freedom" is a count, and a count does not say
 * where to look. The feedback form collected the same question for two years --
 * "I don't understand why this mechanism cannot be analysed", "the help panel
 * should at least list what requirement is not met" -- about drawings where the
 * count was the only thing the app said. And the sentence under it was advice
 * written for no drawing in particular: "ground another joint" leaves the
 * simplest loose chain there is, A-B-C grounded at A, rigid rather than
 * mobile.
 *
 * So this asks the drawing. Holding the input still and looking for motion that
 * is left names the loose parts; the input alone cannot say where they go. And
 * each fix offered is an edit made to the constraint list, never to a joint, and
 * counted again: only an edit that leaves exactly one degree of freedom -- and
 * none with the input held -- is offered. The one piece of advice that cannot be
 * checked that way, attaching a new link to ground, is reported separately so
 * the sentence can say it as advice rather than as a result.
 */

export interface MobilityDiagnosis {
  /** Links that still move while the input is held still, in drawing order. */
  looseLinks: RealLink[];
  /** Joints a reader can see that still move while the input is held still. */
  looseJoints: RealJoint[];
  /** Single edits that leave exactly one degree of freedom, each counted, not guessed. */
  fixes: MobilityFix[];
  /**
   * Where a new link to ground would take the extra freedom away: a loose joint
   * at the end of a single link, the way a four-bar is finished. Advice, not a
   * checked result, because the link it asks for does not exist yet.
   */
  attachAt?: RealJoint;
  /**
   * The input's own part, when it cannot move at all: set only where the
   * drawing has a freedom and none of it is the input's -- so the count reads
   * one, the solver cannot take a step, and "a dead position" would send the
   * reader to drag a linkage that no drag will free.
   */
  stuck?: StuckInput;
  /**
   * How the input stands at the drawn pose, where its part can move. At a
   * `'limit'`, held still it keeps a freedom to first order that dies at the
   * second, which is what the end of a stroke is. `'clear'` of one, holding it
   * leaves nothing to move at all: it drives the drawing outright, and a solve
   * that cannot start there has no pose to blame. Undefined otherwise.
   */
  inputStart?: 'limit' | 'clear';
  /** The joint to drag off a limit: the one that moves furthest in the drawing's freedom. */
  mover?: RealJoint;
  /**
   * Where the input's pivot joins one body too many -- a brace or a hanging
   * link drawn from it -- the link whose deletion would leave the input one
   * thing to turn and the mechanism one degree of freedom. Counted.
   */
  untangle?: MobilityFix[];
}

const NOTHING: MobilityDiagnosis = { looseLinks: [], looseJoints: [], fixes: [] };

/**
 * Read off the editable drawing rather than a solved copy: a `Mechanism` that
 * failed its mobility check has already emptied its own joints, and the parts
 * named here are the ones a reader is sent to.
 */
export function diagnoseMobility(
  partition: MechanismPartition,
  /**
   * The whole drawing, where the caller has it: the fixes that join this
   * machine to another -- a joint grounded that split one linkage in two, a
   * free end and the pivot its deleted link left behind -- need both halves.
   */
  drawing?: Drawing
): MobilityDiagnosis {
  try {
    return diagnose(partition, drawing);
  } catch {
    // A diagnosis is an improvement on a count, never a condition for one. A
    // drawing this cannot read still gets the count and the general advice.
    return NOTHING;
  }
}

function diagnose(partition: MechanismPartition, drawing?: Drawing): MobilityDiagnosis {
  const { joints, links } = partition;
  const assignment = assignBodies(joints, links);
  const system = constraintSystemOf(joints, links, assignment);
  if (!system) return NOTHING;

  const driven = partition.ownJoints.find(
    (joint): joint is RealJoint => joint instanceof RealJoint && joint.input
  );
  const hold = driven ? holdFor(driven, system, assignment) : undefined;
  const held = hold ? [...system.constraints, hold] : system.constraints;
  const hidden = hiddenJoints(joints);
  const own = new Set(partition.ownJoints.map((joint) => joint.id));

  const loose = looseParts(partition, system, assignment, held, hidden);
  const free = freedomsOf(system);
  const trial: Trial = { partition, driven, needsHold: hold !== undefined };
  // Two joints drawn beside each other are asked about first: whatever else
  // would also count right, a merge is the drawing that was meant.
  const merges = mergeFixes(trial, assignment, own, hidden);
  const fixes =
    free > 1 || loose.looseLinks.length > 0
      ? [
          ...merges,
          ...(drawing ? reconnectFixes(trial, assignment, drawing, loose.looseJoints, hidden) : []),
          ...groundingFixes(trial, loose.looseJoints, hidden),
          ...danglingDeletes(trial, assignment, own, hidden),
        ]
      : free === 0
        ? [...merges, ...rigidOnes(trial, assignment, drawing, own, hidden)]
        : merges;

  const directions = driven && free >= 1 ? freeMotionOf(system) : [];
  const stuck =
    directions.length > 0
      ? stuckInput(trial, system, assignment, directions, own, hidden)
      : undefined;
  const inputStart = directions.length > 0 && !stuck && hold ? startOf(system, held) : undefined;
  const mover =
    inputStart === 'limit'
      ? fastestJoint(partition, system, assignment, directions, own, hidden)
      : undefined;

  return {
    ...loose,
    fixes: fixes.slice(0, MAX_FIXES),
    // Beside a deleted dangling link as well as instead of every other fix:
    // the link may be the first bar of more linkage rather than a mistake.
    attachAt: fixes.every((fix) => fix.kind === 'delete-link')
      ? freeEndOf(loose.looseJoints)
      : undefined,
    stuck,
    inputStart,
    mover,
    untangle:
      driven && typeof describeActuator(driven) === 'string'
        ? untangleFixes(trial, assignment, own, hidden).slice(0, MAX_FIXES)
        : undefined,
  };
}

/**
 * Every link and visible joint that moves in some freedom left with the input
 * held.
 *
 * Only the freedoms that survive the second-order test are read where any do,
 * so a tangency -- a linkage touching a limit rather than moving -- does not name
 * parts that cannot actually go anywhere.
 */
function looseParts(
  partition: MechanismPartition,
  system: ConstraintSystem,
  assignment: BodyAssignment,
  held: Constraint[],
  hidden: Set<string>
): Pick<MobilityDiagnosis, 'looseLinks' | 'looseJoints'> {
  const found = freeDirectionsOf(system, held);
  const surviving = found.filter((one) => one.survives);
  const directions = (surviving.length > 0 ? surviving : found).map((one) => one.direction);
  if (directions.length === 0 || freedomsOf(system, held) === 0) {
    return { looseLinks: [], looseJoints: [] };
  }

  const speedOf = (joint: RealJoint, direction: number[]): number =>
    Math.max(
      0,
      ...[...assignment.bodiesAt(joint)]
        .filter((body) => body !== WORLD)
        .map((body) => {
          const motion = pointMotion(system.bodyAt(body), joint, direction);
          return Math.hypot(motion.x, motion.y);
        })
    );

  const candidates = partition.joints.filter(
    (joint): joint is RealJoint => joint instanceof RealJoint
  );
  const moving = new Set<string>();
  for (const direction of directions) {
    const speeds = candidates.map((joint) => speedOf(joint, direction));
    const fastest = Math.max(0, ...speeds);
    if (fastest === 0) continue;
    candidates.forEach((joint, index) => {
      if (speeds[index] > fastest * STILL) moving.add(joint.id);
    });
  }

  const own = new Set(partition.ownJoints.map((joint) => joint.id));
  const looseJoints = candidates.filter(
    (joint) => moving.has(joint.id) && own.has(joint.id) && !hidden.has(joint.id)
  );
  // A link is loose when any of its joints is: a rigid body that moves at one
  // of its points moves as a whole.
  const looseLinks = partition.links.filter(
    (link): link is RealLink =>
      link instanceof RealLink &&
      assignment.bodyOf(link) !== WORLD &&
      link.joints.some((joint) => moving.has(joint.id) && own.has(joint.id))
  );
  return { looseLinks, looseJoints };
}

/**
 * A loose joint where a link to ground finishes the mechanism: the far end of a
 * single bar, the way the fourth pin of a four-bar is. A joint on a link that
 * already has two others is a tracer point, and a tracer takes no link.
 */
function freeEndOf(looseJoints: RealJoint[]): RealJoint | undefined {
  return looseJoints.find(
    (joint) =>
      !(joint instanceof PrisJoint) &&
      !joint.ground &&
      joint.links.length === 1 &&
      joint.links[0].joints.length <= 2
  );
}

/**
 * The fixes for a machine nothing can move. A joint that split one linkage in
 * two, ungrounded, is the whole answer where there is one: the half this
 * machine can fix alone -- ungrounding a real pivot -- leaves the other half
 * rigid, and counts right only for the half it can see.
 */
function rigidOnes(
  trial: Trial,
  assignment: BodyAssignment,
  drawing: Drawing | undefined,
  own: Set<string>,
  hidden: Set<string>
): MobilityFix[] {
  const across = drawing ? ungroundAcross(trial, drawing, own, hidden) : [];
  return across.length ? across : rigidFixes(trial, assignment, own, hidden);
}
