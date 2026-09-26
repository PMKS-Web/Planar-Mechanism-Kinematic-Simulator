import { describeActuator, GROUND_BODY } from '../actuator';
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
import {
  Edit,
  holdFor,
  leavesOne,
  MAX_CANDIDATES,
  MAX_FIXES,
  MobilityFix,
  staysHeld,
  staysOnePiece,
  STILL,
  Trial,
  withoutBody,
} from './mobility-edits';

/**
 * Whether the input's own part can move at all, and where it starts.
 *
 * Split from the diagnosis of loose parts because it asks the opposite
 * question: not what moves with the input held, but what cannot move even
 * with it free.
 */

/** Links around the input that are rigid with the ground, and what would free them. */
export interface StuckInput {
  /** In drawing order. */
  links: RealLink[];
  /** Single edits that would let the input move them, each counted. */
  fixes: MobilityFix[];
}

/** Where the input starts, from how much of the drawing's freedom holding it takes. */
export function startOf(
  system: ConstraintSystem,
  held: Constraint[]
): 'limit' | 'clear' | undefined {
  const firstOrder = freeDirectionsOf(system, held).length;
  if (firstOrder === 0) return 'clear';
  return freedomsOf(system, held) === 0 ? 'limit' : undefined;
}

/**
 * The input's part of the drawing, when it is rigid.
 *
 * A four-bar with a bar across it counts zero, and a link left dangling off it
 * adds the one freedom that makes the total read right. That freedom is the
 * dangling link's; the solver, asked to turn the input, cannot take a step, and
 * it used to be reported as a dead position with advice to drag a joint off a
 * limit the drawing was not at.
 *
 * So: the bodies that do not move in any freedom the drawing has, and among
 * them the group the input's body belongs to. If that group, with nothing else
 * attached, cannot move either, the input is stuck -- and the difference from a
 * real dead position is exactly that. A rocker at the end of its swing is still
 * for an instant, but on its own, pinned to the ground, it turns.
 */
export function stuckInput(
  trial: Trial,
  system: ConstraintSystem,
  assignment: BodyAssignment,
  directions: number[][],
  own: Set<string>,
  hidden: Set<string>
): StuckInput | undefined {
  const { partition, driven } = trial;
  const actuator = driven ? describeActuator(driven) : undefined;
  if (!driven || !actuator || typeof actuator === 'string') return undefined;
  const moving = movingBodiesOf(partition, system, assignment, directions);
  const inputBodies = [actuator.drivenBody, actuator.referenceBody]
    .filter((body): body is Link => body !== GROUND_BODY)
    .map((link) => assignment.bodyOf(link));
  if (inputBodies.some((body) => moving.has(body) || body === WORLD)) return undefined;

  const still = new Set([...assignment.movingBodies].filter((body) => !moving.has(body)));
  const group = groupOf(partition.joints, assignment, still, inputBodies[0]);
  const around = partition.links.filter((link) => group.has(assignment.bodyOf(link)));
  const frame = partition.links.filter((link) => assignment.bodyOf(link) === WORLD);
  const alone = aloneWith(partition.joints, [...around, ...frame], assignment, group);
  if (!alone || freedomsOf(alone) !== 0) return undefined;

  return {
    links: around.filter((link): link is RealLink => link instanceof RealLink),
    fixes: stuckFixes(trial, assignment, around, frame, own, hidden).slice(0, MAX_FIXES),
  };
}

/**
 * The directions the drawing can move in as drawn: the ones that survive the
 * second-order test where any do, so a tangency does not count as motion.
 */
export function freeMotionOf(system: ConstraintSystem): number[][] {
  const found = freeDirectionsOf(system, system.constraints);
  const surviving = found.filter((one) => one.survives);
  return (surviving.length > 0 ? surviving : found).map((one) => one.direction);
}

/** The bodies that move in some freedom the drawing has, as drawn. */
export function movingBodiesOf(
  partition: MechanismPartition,
  system: ConstraintSystem,
  assignment: BodyAssignment,
  directions: number[][]
): Set<string> {
  const bodies = [...assignment.movingBodies];
  const pointsOf = new Map(bodies.map((body) => [body, [] as RealJoint[]]));
  for (const link of partition.links) {
    const points = pointsOf.get(assignment.bodyOf(link));
    link.joints.forEach((joint) => joint instanceof RealJoint && points?.push(joint));
  }
  const moving = new Set<string>();
  for (const direction of directions) {
    const speeds = bodies.map((body) =>
      Math.max(
        0,
        ...(pointsOf.get(body) ?? []).map((joint) => {
          const motion = pointMotion(system.bodyAt(body), joint, direction);
          return Math.hypot(motion.x, motion.y);
        })
      )
    );
    const fastest = Math.max(0, ...speeds);
    bodies.forEach((body, index) => {
      if (fastest > 0 && speeds[index] > fastest * STILL) moving.add(body);
    });
  }
  return moving;
}

/**
 * The visible joint of this machine that moves furthest in the drawing's
 * freedom, other than the input's own. Dragging it is what takes a linkage off
 * a limit, and naming it is the difference between advice and a pointer.
 */
export function fastestJoint(
  partition: MechanismPartition,
  system: ConstraintSystem,
  assignment: BodyAssignment,
  directions: number[][],
  own: Set<string>,
  hidden: Set<string>
): RealJoint | undefined {
  const candidates = partition.joints.filter(
    (joint): joint is RealJoint =>
      joint instanceof RealJoint &&
      !joint.input &&
      own.has(joint.id) &&
      !hidden.has(joint.id) &&
      !(joint.ground && !(joint instanceof PrisJoint))
  );
  let best: RealJoint | undefined;
  let fastest = 0;
  for (const direction of directions) {
    for (const joint of candidates) {
      for (const body of assignment.bodiesAt(joint)) {
        if (body === WORLD) continue;
        const motion = pointMotion(system.bodyAt(body), joint, direction);
        const speed = Math.hypot(motion.x, motion.y);
        if (speed > fastest) {
          fastest = speed;
          best = joint;
        }
      }
    }
  }
  return best;
}

/** The bodies among `among` joined to `start` by joints that are not pinned to the ground. */
export function groupOf(
  joints: Joint[],
  assignment: BodyAssignment,
  among: Set<string>,
  start: string
): Set<string> {
  const group = new Set([start]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const joint of joints) {
      if (!(joint instanceof RealJoint)) continue;
      if (joint.ground && !(joint instanceof PrisJoint)) continue;
      const here = [...assignment.bodiesAt(joint)].filter((body) => among.has(body));
      if (!here.some((body) => group.has(body))) continue;
      for (const body of here) {
        if (!group.has(body)) {
          group.add(body);
          grew = true;
        }
      }
    }
  }
  return group;
}

/**
 * These bodies and the frame with nothing else attached: a joint to a body
 * outside them is let go, because that body is free to follow.
 */
export function aloneWith(
  joints: Joint[],
  links: Link[],
  assignment: BodyAssignment,
  keep: Set<string>,
  rotates?: (joint: PrisJoint) => boolean
): ConstraintSystem | undefined {
  const inside = (body: string) => body === WORLD || keep.has(body);
  const alone: BodyAssignment = {
    bodyOf: assignment.bodyOf,
    movingBodies: new Set([...assignment.movingBodies].filter((body) => keep.has(body))),
    bodiesAt: (joint) => new Set([...assignment.bodiesAt(joint)].filter(inside)),
  };
  // A slot cut into a body outside the group holds nothing inside it.
  const held = joints.filter(
    (joint) =>
      !(joint instanceof PrisJoint) ||
      joint.ground ||
      (joint.carrier !== undefined && inside(assignment.bodyOf(joint.carrier)))
  );
  return constraintSystemOf(held, links, alone, rotates);
}

/**
 * The edits that would let the input move its part, counted on that part alone:
 * one freedom as drawn, none with the input held, and the machine still in one
 * piece. Asked in the order `rigidFixes` asks them.
 *
 * Where none counts that far -- a link hangs loose somewhere else too, so no
 * single edit leaves exactly one -- the edits that let the input move its part
 * at all, whatever else still moves. Freeing the input is the step this issue
 * is about; what still moves after it is the next issue, and says so.
 */
export function stuckFixes(
  trial: Trial,
  assignment: BodyAssignment,
  around: Link[],
  frame: Link[],
  own: Set<string>,
  hidden: Set<string>
): MobilityFix[] {
  const counted = stuckEdits(trial, assignment, around, frame, own, hidden, 'one');
  return counted.length
    ? counted
    : stuckEdits(trial, assignment, around, frame, own, hidden, 'moves');
}

/**
 * The candidate edits, each tested as `test` asks: `'one'` for one freedom left
 * to the input's part, `'moves'` for any that the input drives. A link deleted
 * under `'moves'` may leave a ground pivot with nothing on it -- a rocker
 * taken off the pivot it hung from -- which the counted test does not allow.
 */
function stuckEdits(
  trial: Trial,
  assignment: BodyAssignment,
  around: Link[],
  frame: Link[],
  own: Set<string>,
  hidden: Set<string>,
  test: 'one' | 'moves'
): MobilityFix[] {
  const { partition, driven } = trial;
  const { joints, links } = partition;
  const fixes: MobilityFix[] = [];
  let tried = 0;
  const frees = (edit: Edit, kept: Link[] = [...around, ...frame]): boolean => {
    tried++;
    if (!driven || !staysOnePiece(joints, edit)) return false;
    const keep = new Set(
      kept.map((link) => edit.assignment.bodyOf(link)).filter((body) => body !== WORLD)
    );
    const alone = aloneWith(joints, kept, edit.assignment, keep, edit.rotates);
    const hold = alone ? holdFor(driven, alone, edit.assignment) : undefined;
    if (!alone || !hold) return false;
    if (test === 'one') return leavesOne(alone, alone.constraints, hold);
    const free = freedomsOf(alone);
    return free >= 1 && freedomsOf(alone, [...alone.constraints, hold]) < free;
  };
  const touches = new Set(around.flatMap((link) => link.joints.map((joint) => joint.id)));
  const pivotLeftBare = (joint: Joint) =>
    test === 'moves' && joint instanceof RealJoint && joint.ground && !(joint instanceof PrisJoint);

  for (const joint of joints) {
    if (tried >= MAX_CANDIDATES) break;
    if (!(joint instanceof RealJoint) || joint instanceof PrisJoint || !joint.ground) continue;
    if (joint === driven || !touches.has(joint.id) || !own.has(joint.id)) continue;
    if (hidden.has(joint.id)) continue;
    const groundedAt = (one: RealJoint) => one !== joint && one.ground;
    if (frees({ groundedAt, assignment: assignBodies(joints, links, groundedAt) })) {
      fixes.push({ kind: 'unground', joint });
    }
  }

  for (const joint of joints) {
    if (tried >= MAX_CANDIDATES) break;
    if (!(joint instanceof PrisJoint) || joint.rotates || joint.isSealed) continue;
    if (!touches.has(joint.id) || !own.has(joint.id) || hidden.has(joint.id)) continue;
    const rotates = (one: PrisJoint) => one === joint || one.rotates;
    if (frees({ groundedAt: (one) => one.ground, assignment, rotates })) {
      fixes.push({ kind: 'pin-in-slot', joint });
    }
  }

  const bodyCount = new Map<string, number>();
  links.forEach((link) => {
    const body = assignment.bodyOf(link);
    bodyCount.set(body, (bodyCount.get(body) ?? 0) + 1);
  });
  for (const link of around) {
    if (tried >= MAX_CANDIDATES) break;
    if (!(link instanceof RealLink)) continue;
    const body = assignment.bodyOf(link);
    if (bodyCount.get(body) !== 1) continue;
    if (link.joints.some((joint) => hidden.has(joint.id) || !own.has(joint.id))) continue;
    // The input's own link is what it drives; taking it away is not a fix.
    if (driven?.links.includes(link)) continue;
    if (!link.joints.every((joint) => staysHeld(joint, link, joints) || pivotLeftBare(joint))) {
      continue;
    }
    const edit: Edit = {
      groundedAt: (one) => one.ground,
      assignment: withoutBody(assignment, body),
    };
    if (
      frees(
        edit,
        [...around, ...frame].filter((one) => one !== link)
      )
    ) {
      fixes.push({ kind: 'delete-link', link });
    }
  }
  return fixes;
}
