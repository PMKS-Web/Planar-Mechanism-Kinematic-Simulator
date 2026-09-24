import { describeActuator, GROUND_BODY } from '../actuator';
import { cylindersIn, isInsideCylinder } from '../cylinder';
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
  holdSlide,
  holdTurn,
  pointMotion,
} from './mobility';

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
export type MobilityFix =
  | { kind: 'ground'; joint: RealJoint }
  | { kind: 'unground'; joint: RealJoint }
  | { kind: 'pin-in-slot'; joint: PrisJoint }
  | { kind: 'delete-link'; link: RealLink };

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
}

const NOTHING: MobilityDiagnosis = { looseLinks: [], looseJoints: [], fixes: [] };

/**
 * How many candidate edits are counted before giving up.
 *
 * Each is a rank and a second-order test on the whole drawing; a classroom
 * drawing has a dozen joints, and one that has hundreds is better served by a
 * sentence that names the loose parts than by a pause while every joint is tried.
 */
const MAX_CANDIDATES = 40;

/** How many fixes a sentence can list before it stops reading as a sentence. */
const MAX_FIXES = 3;

/**
 * A point is still when it moves less than this share of the fastest point in
 * the same freedom. Relative, so it means the same in any unit.
 */
const STILL = 1e-6;

/**
 * Read off the editable drawing rather than a solved copy: a `Mechanism` that
 * failed its mobility check has already emptied its own joints, and the parts
 * named here are the ones a reader is sent to.
 */
export function diagnoseMobility(partition: MechanismPartition): MobilityDiagnosis {
  try {
    return diagnose(partition);
  } catch {
    // A diagnosis is an improvement on a count, never a condition for one. A
    // drawing this cannot read still gets the count and the general advice.
    return NOTHING;
  }
}

function diagnose(partition: MechanismPartition): MobilityDiagnosis {
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
  const fixes =
    free > 1 || loose.looseLinks.length > 0
      ? groundingFixes(trial, loose.looseJoints, hidden)
      : free === 0
        ? rigidFixes(trial, assignment, own, hidden)
        : [];

  return {
    ...loose,
    fixes: fixes.slice(0, MAX_FIXES),
    attachAt: fixes.length === 0 ? freeEndOf(loose.looseJoints) : undefined,
  };
}

/** The driven joint held still, written as one more constraint. */
function holdFor(
  driven: RealJoint,
  system: ConstraintSystem,
  assignment: BodyAssignment
): Constraint | undefined {
  const actuator = describeActuator(driven);
  if (typeof actuator === 'string') return undefined;
  const bodyOf = (body: Link | typeof GROUND_BODY) =>
    system.bodyAt(body === GROUND_BODY ? WORLD : assignment.bodyOf(body));

  if (actuator.kind === 'angle') {
    return holdTurn(bodyOf(actuator.drivenBody), bodyOf(actuator.referenceBody));
  }
  if (!(driven instanceof PrisJoint)) return undefined;
  const carrier = driven.ground
    ? WORLD
    : driven.carrier
      ? assignment.bodyOf(driven.carrier)
      : undefined;
  if (carrier === undefined) return undefined;
  const rider = [...assignment.bodiesAt(driven)].find((body) => body !== carrier);
  if (rider === undefined) return undefined;
  return holdSlide(
    { x: driven.x, y: driven.y },
    system.bodyAt(rider),
    system.bodyAt(carrier),
    driven.slotAngle
  );
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

/** What every candidate edit is counted against. */
interface Trial {
  partition: MechanismPartition;
  driven: RealJoint | undefined;
  /**
   * Whether the input can be held still as drawn. Where it can, an edit that
   * leaves it nothing to drive has not fixed anything; where it already cannot,
   * that is a different blocker with a sentence of its own.
   */
  needsHold: boolean;
}

/** A drawing as one edit would leave it, described rather than made. */
interface Edit {
  /** What counts as grounded once the edit is made. */
  groundedAt: (joint: RealJoint) => boolean;
  /** The bodies, assigned again for the edited drawing. */
  assignment: BodyAssignment;
  /** The links left, where the edit deletes one. */
  links?: Link[];
  /** Which sliders turn, where the edit changes one. */
  rotates?: (joint: PrisJoint) => boolean;
  /** The edit is to the driven joint itself, so the input as drawn says nothing about it. */
  touchesInput?: boolean;
}

/**
 * Whether an edit leaves one machine with one degree of freedom as drawn, and
 * none once the input is held.
 *
 * "One machine" is asked first, and the way `partitionMechanisms` asks it,
 * because ground anchors what meets it without joining it: grounding a joint in
 * the middle of a chain can cut the chain in two, and a piece left rigid is a
 * machine of its own that cannot move -- however well the other piece runs, and
 * however well the two count together.
 */
function leavesOneMachine({ partition, driven, needsHold }: Trial, edit: Edit): boolean {
  const kept = edit.links ?? partition.links;
  if (!staysOnePiece(partition.joints, edit)) return false;
  const system = constraintSystemOf(partition.joints, kept, edit.assignment, edit.rotates);
  if (!system) return false;
  if (!driven || edit.touchesInput) return freedomsOf(system) === 1;
  const hold = holdFor(driven, system, edit.assignment);
  if (!hold) return !needsHold && freedomsOf(system) === 1;
  return leavesOne(system, system.constraints, hold);
}

/** Whether the moving bodies an edit leaves are joined into one machine. */
function staysOnePiece(joints: Joint[], edit: Edit): boolean {
  const { movingBodies, bodiesAt } = edit.assignment;
  const parent = new Map([...movingBodies].map((body) => [body, body]));
  const find = (body: string): string => {
    let root = body;
    while (parent.get(root) !== root) root = parent.get(root)!;
    return root;
  };
  for (const joint of joints) {
    if (!(joint instanceof RealJoint)) continue;
    // A grounded pin anchors; a grounded slider still carries a moving point.
    if (edit.groundedAt(joint) && !(joint instanceof PrisJoint)) continue;
    const moving = [...bodiesAt(joint)].filter((body) => parent.has(body));
    moving.slice(1).forEach((body) => parent.set(find(body), find(moving[0])));
  }
  return new Set([...movingBodies].map(find)).size <= 1;
}

/**
 * Grounding one loose joint, counted: one machine, one degree of freedom without
 * the hold, none with it.
 *
 * The bodies are assigned again rather than pinned where they are, because that
 * is what the Grounded switch does to the drawing: a link whose last free end is
 * grounded becomes frame, and the chain through the joint stops being one chain.
 */
function groundingFixes(
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
function rigidFixes(
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

/** Whether a joint is still held by the drawing once one of its links is deleted. */
function staysHeld(joint: Joint, deleted: Link): boolean {
  if (!(joint instanceof RealJoint)) return false;
  const kept = joint.links.filter((link) => link !== deleted).length;
  return kept >= 2 || (kept >= 1 && joint.ground);
}

/** One degree of freedom as drawn, and none once the input is held. */
function leavesOne(
  system: ConstraintSystem,
  constraints: Constraint[],
  hold: Constraint | undefined
): boolean {
  if (freedomsOf(system, constraints) !== 1) return false;
  return hold === undefined || freedomsOf(system, [...constraints, hold]) === 0;
}

/** The drawing with one body gone, and the joints it met no longer joining it. */
function withoutBody(assignment: BodyAssignment, body: string): BodyAssignment {
  const movingBodies = new Set(assignment.movingBodies);
  movingBodies.delete(body);
  return {
    ...assignment,
    movingBodies,
    bodiesAt: (at) => {
      const bodies = assignment.bodiesAt(at);
      bodies.delete(body);
      return bodies;
    },
  };
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
 * The joints a cylinder places for itself, never named or offered as a fix: the
 * buried inner end has no letter a reader can see, and neither it nor the seal
 * can be grounded or have its type changed (D14, S11).
 */
function hiddenJoints(joints: Joint[]): Set<string> {
  const hidden = new Set<string>();
  for (const cylinder of cylindersIn(joints)) {
    for (const joint of joints) {
      if (isInsideCylinder(cylinder, joint)) hidden.add(joint.id);
    }
  }
  return hidden;
}
