import { describeActuator, GROUND_BODY } from '../actuator';
import { cylindersIn, isInsideCylinder } from '../cylinder';
import { Joint, PrisJoint, RealJoint } from '../joint';
import { Link, RealLink } from '../link';
import { BodyAssignment, WORLD } from './bodies';
import { MechanismPartition } from './mechanism-partition';
import {
  Constraint,
  ConstraintSystem,
  constraintSystemOf,
  freedomsOf,
  holdSlide,
  holdTurn,
} from './mobility';

/**
 * Counting an edit before anyone makes it.
 *
 * A fix is offered only once the drawing it would leave has been counted: one
 * machine, one degree of freedom as drawn, none with the input held. The edit
 * is described -- what counts as grounded, how the bodies fall, which links are
 * left -- and never made to a joint, so asking costs nothing and cannot leave a
 * trace in the drawing the reader is looking at.
 */

/** One edit the diagnosis can count and a reader can make. */
export type MobilityFix =
  | { kind: 'ground'; joint: RealJoint }
  | { kind: 'unground'; joint: RealJoint }
  | { kind: 'pin-in-slot'; joint: PrisJoint }
  | { kind: 'unweld'; joint: RealJoint }
  | { kind: 'delete-link'; link: RealLink }
  /** Drag `joint` onto `onto`: two joints drawn beside each other that were meant as one. */
  | { kind: 'merge'; joint: RealJoint; onto: RealJoint }
  /** A new link from `joint` to `to`, a grounded pivot left with nothing on it. */
  | { kind: 'connect'; joint: RealJoint; to: RealJoint };

/**
 * How many candidate edits are counted before giving up.
 *
 * Each is a rank and a second-order test on the whole drawing; a classroom
 * drawing has a dozen joints, and one that has hundreds is better served by a
 * sentence that names the loose parts than by a pause while every joint is tried.
 */
export const MAX_CANDIDATES = 40;

/** How many fixes a sentence can list before it stops reading as a sentence. */
export const MAX_FIXES = 3;

/**
 * A point is still when it moves less than this share of the fastest point in
 * the same freedom. Relative, so it means the same in any unit.
 */
export const STILL = 1e-6;

/** What every candidate edit is counted against. */
export interface Trial {
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
export interface Edit {
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
  /** The joints left, where the edit takes one away -- a merge keeps one of two. */
  joints?: Joint[];
  /**
   * The input held still in the edited drawing, where the edit changes what the
   * input drives -- a link taken off its pivot -- so the drawing as it stands
   * cannot say.
   */
  hold?: (system: ConstraintSystem) => Constraint | undefined;
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
export function leavesOneMachine({ partition, driven, needsHold }: Trial, edit: Edit): boolean {
  const kept = edit.links ?? partition.links;
  const joints = edit.joints ?? partition.joints;
  if (!staysOnePiece(joints, edit)) return false;
  const system = constraintSystemOf(joints, kept, edit.assignment, edit.rotates);
  if (!system) return false;
  if (edit.hold) {
    const hold = edit.hold(system);
    return hold !== undefined && leavesOne(system, system.constraints, hold);
  }
  // An edit that leaves the input's pivot joining more than two bodies has
  // left the input unable to say which to turn -- ungrounding the far end of a
  // frame bar drawn from it does -- whatever the count.
  if (driven && !edit.touchesInput && edit.assignment.bodiesAt(driven).size > 2) return false;
  if (!driven || edit.touchesInput) return freedomsOf(system) === 1;
  const hold = holdFor(driven, system, edit.assignment);
  if (!hold) return !needsHold && freedomsOf(system) === 1;
  return leavesOne(system, system.constraints, hold);
}

/** Whether the moving bodies an edit leaves are joined into one machine. */
export function staysOnePiece(joints: Joint[], edit: Edit): boolean {
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

/** The driven joint held still, written as one more constraint. */
export function holdFor(
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

/** One degree of freedom as drawn, and none once the input is held. */
export function leavesOne(
  system: ConstraintSystem,
  constraints: Constraint[],
  hold: Constraint | undefined
): boolean {
  if (freedomsOf(system, constraints) !== 1) return false;
  return hold === undefined || freedomsOf(system, [...constraints, hold]) === 0;
}

/** The drawing with one body gone, and the joints it met no longer joining it. */
export function withoutBody(assignment: BodyAssignment, body: string): BodyAssignment {
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
 * Whether a joint is still held by the drawing once one of its links is deleted:
 * two links left, or one and the ground, or one that is a plate -- a corner of a
 * three-joint link left on its own is a point on that link, not a loose end.
 */
export function staysHeld(joint: Joint, deleted: Link): boolean {
  if (!(joint instanceof RealJoint)) return false;
  const kept = joint.links.filter((link) => link !== deleted);
  return kept.length >= 2 || (kept.length === 1 && (joint.ground || kept[0].joints.length >= 3));
}

/**
 * The joints a cylinder places for itself, never named or offered as a fix: the
 * buried inner end has no letter a reader can see, and neither it nor the seal
 * can be grounded or have its type changed (D14, S11).
 */
export function hiddenJoints(joints: Joint[]): Set<string> {
  const hidden = new Set<string>();
  for (const cylinder of cylindersIn(joints)) {
    for (const joint of joints) {
      if (isInsideCylinder(cylinder, joint)) hidden.add(joint.id);
    }
  }
  return hidden;
}

/**
 * The drawing with a weld taken out at `joint`, as Unweld leaves it: the
 * compound goes back to the members it was welded from, grouped by the welds
 * that are left.
 *
 * Only a compound that is a body of its own is split here. One that is itself
 * rigid with something else -- welded into a cylinder's barrel, say -- is a
 * bigger question than one weld, and is not offered.
 */
export function unweldedAt(
  joints: Joint[],
  links: Link[],
  assignment: BodyAssignment,
  joint: RealJoint,
  /**
   * The driven joint, where the input turns the compound: asked about the
   * compound afterwards, the hold means the piece the input is on.
   */
  drivenAt?: Joint
): Edit | undefined {
  const compound = joint.links.find(
    (link): link is RealLink => link instanceof RealLink && link.subset.length > 1
  );
  if (!compound || !links.includes(compound)) return undefined;
  const body = assignment.bodyOf(compound);
  if (
    body === WORLD ||
    links.some((link) => link !== compound && assignment.bodyOf(link) === body)
  ) {
    return undefined;
  }
  const leaves = leavesOf(compound);
  // A bracket welded to a cylinder's barrel or rod is a mount (decision S16),
  // and unwelding it re-lays the whole part: more than one weld's worth of
  // change, and not something a count of this drawing can say in advance.
  if (
    cylindersIn(joints).some((cylinder) =>
      leaves.some((leaf) => leaf.id === cylinder.barrel.id || leaf.id === cylinder.rod.id)
    )
  ) {
    return undefined;
  }
  // By letter rather than by object: a member can still hold the joint a
  // slider replaced, and it is the same joint as far as the drawing goes.
  const holds = (leaf: Link, at: Joint | undefined) =>
    at !== undefined && leaf.joints.some((one) => one.id === at.id);
  // Members stay together where they meet at another welded joint.
  const parent = new Map(leaves.map((leaf) => [leaf.id, leaf.id]));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    return root;
  };
  for (const a of leaves) {
    for (const b of leaves) {
      const weldedTogether =
        a !== b &&
        a.joints.some(
          (one) => one.id !== joint.id && one instanceof RealJoint && one.isWelded && holds(b, one)
        );
      if (weldedTogether) parent.set(find(a.id), find(b.id));
    }
  }
  const bodyOfLeaf = (leaf: Link) => `${body}/${find(leaf.id)}`;
  const pieces = new Set(leaves.map(bodyOfLeaf));
  if (pieces.size < 2) return undefined;
  const movingBodies = new Set(assignment.movingBodies);
  movingBodies.delete(body);
  pieces.forEach((piece) => movingBodies.add(piece));
  return {
    groundedAt: (one) => one.ground,
    links: links.filter((link) => link !== compound).concat(leaves),
    assignment: {
      bodyOf: (link) =>
        leaves.includes(link)
          ? bodyOfLeaf(link)
          : link === compound
            ? bodyOfLeaf(leaves.find((leaf) => holds(leaf, drivenAt)) ?? leaves[0])
            : assignment.bodyOf(link),
      movingBodies,
      bodiesAt: (at) => {
        const bodies = assignment.bodiesAt(at);
        if (!bodies.delete(body)) return bodies;
        leaves.filter((leaf) => holds(leaf, at)).forEach((leaf) => bodies.add(bodyOfLeaf(leaf)));
        return bodies;
      },
    },
  };
}

/** The members a compound was welded from, however deeply. */
function leavesOf(link: Link): Link[] {
  return link instanceof RealLink && link.subset.length > 0
    ? link.subset.flatMap(leavesOf)
    : [link];
}

/**
 * The drawing with `joint` dragged onto `onto`: one joint where there were
 * two, holding everything either held, grounded if either was.
 */
export function mergedAt(
  joints: Joint[],
  assignment: BodyAssignment,
  joint: RealJoint,
  onto: RealJoint
): Edit {
  const grounded = joint.ground || onto.ground;
  return {
    groundedAt: (one) => (one === onto ? grounded : one.ground),
    joints: joints.filter((one) => one !== joint),
    assignment: {
      ...assignment,
      bodiesAt: (at) => {
        const bodies = assignment.bodiesAt(at);
        if (at !== onto) return bodies;
        assignment.bodiesAt(joint).forEach((one) => bodies.add(one));
        if (grounded) bodies.add(WORLD);
        return bodies;
      },
    },
  };
}

/**
 * Pairs of joints drawn so close they were surely meant as one: nearer each
 * other than a twentieth of the drawing's own size, on no link together. The
 * joint with fewer links -- or, between equals, the later one -- is the one
 * that was dropped, and goes onto the other.
 */
export function jointsBeside(joints: Joint[], hidden: Set<string>): [RealJoint, RealJoint][] {
  const pins = joints.filter(
    (one): one is RealJoint =>
      one instanceof RealJoint && !(one instanceof PrisJoint) && !hidden.has(one.id)
  );
  if (pins.length < 2) return [];
  const xs = pins.map((one) => one.x);
  const ys = pins.map((one) => one.y);
  const span = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const near = span * BESIDE;
  const pairs: [RealJoint, RealJoint][] = [];
  pins.forEach((a, i) =>
    pins.slice(i + 1).forEach((b) => {
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (distance === 0 || distance > near) return;
      if (a.links.some((link) => b.links.includes(link))) return;
      // The one holding fewer links was dropped; between equals, the later one,
      // since joints take their letters in the order they are drawn.
      pairs.push(a.links.length < b.links.length ? [a, b] : [b, a]);
    })
  );
  return pairs.sort(
    ([a, b], [c, d]) => Math.hypot(a.x - b.x, a.y - b.y) - Math.hypot(c.x - d.x, c.y - d.y)
  );
}

/**
 * How near two joints must be, against the drawing's size, to be read as one
 * dropped beside the other. A joint's own mark is about this big on a
 * classroom drawing; two distinct joints drawn this close are rare, and a merge
 * offered for them is still counted before it is said.
 */
const BESIDE = 0.05;

/**
 * Whether `joint` is the loose end of `link`: on nothing else, grounded to
 * nothing, and holding no slot. A slider rides the slot it is on and a slot's
 * end joint places the slot, so neither is loose however few links it has.
 */
export function isFreeEnd(joint: Joint, link: Link, joints: Joint[]): boolean {
  return (
    joint instanceof RealJoint &&
    !(joint instanceof PrisJoint) &&
    !joint.ground &&
    joint.links.length === 1 &&
    joint.links[0] === link &&
    !joints.some(
      (one) => one instanceof PrisJoint && (one.slotJointA === joint || one.slotJointB === joint)
    )
  );
}
