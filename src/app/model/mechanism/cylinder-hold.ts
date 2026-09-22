/**
 * A cylinder nothing drives holds its length (decision S28).
 *
 * Gruebler is right about the maintainer's triangle of three cylinders: five
 * bodies, six full joints, three freedoms. No reader means that. A cylinder
 * nothing drives is, to the person who drew it, a rigid link of the length it
 * was drawn at -- a ram with its valves shut, a strut. So the drawing should
 * turn about its grounded pin as one rigid triangle, and it does.
 *
 * It cannot be "every undriven cylinder is rigid", because a passive cylinder is
 * also a perfectly good *follower*: put one in a loop the rest of the machine
 * already determines and its length is forced to change. That drawing counts one
 * freedom today, runs today, and must go on running exactly as it does. The rule
 * that separates the two is:
 *
 * > A cylinder nothing drives holds its length unless the machine itself moves
 * > it.
 *
 * Made precise, and asked of the geometry rather than guessed: a passive
 * cylinder is **held** when its slide can still move with the driven coordinate
 * held still. That is a null-space question on the very Jacobian mobility is
 * counted from (`mobility.ts`), with one row added for the drive -- so the
 * answer cannot disagree with the count, and does not depend on the order the
 * cylinders happen to be listed in: every cylinder is judged against the same
 * subspace, and the tie-break below runs over a sorted list.
 *
 * **Held and frozen are one state with two causes.** A cylinder welded inside
 * one body cannot extend because the drawing says so (decision S25); a held one
 * cannot extend because nothing drives it. Both become one rigid body with
 * whatever their members belong to, by the same merge in `assignBodies`, and
 * everything downstream -- the count, the position solve, the forces -- sees the
 * machine that results.
 */

import { Joint, PrisJoint, RealJoint } from '../joint';
import { Link } from '../link';
import { Cylinder, cylindersIn } from '../cylinder';
import { isFrozenCylinder } from '../cylinder-frozen';
import { GROUND_BODY, resolveActuator } from '../actuator';
import { assignBodies, BodyAssignment, WORLD } from './bodies';
import { FreedomFrame, freedomFrameOf } from './mobility';
import { freedomsOf } from './freedoms';

/** What a machine's passive cylinders came to, and the bodies that follow. */
export interface CylinderHoldReport {
  /** The seal ids of the cylinders holding their length. */
  held: Set<string>;
  /**
   * Seal ids whose length nothing decides and which are *not* held all the
   * same, because a freedom had to be left for an input to drive.
   *
   * What readiness says instead of pointing at free ends: on a machine that
   * still counts more than one freedom, a cylinder in this list is where one of
   * them is (decision S28).
   */
  loose: Set<string>;
  /** Barrel and rod root ids to merge, one group per held cylinder. */
  merges: string[][];
}

/** Nothing held, which is what almost every drawing answers. */
const NOTHING: CylinderHoldReport = {
  held: new Set<string>(),
  loose: new Set<string>(),
  merges: [],
};

/**
 * What to call a cylinder when the answer has to be the same twice running.
 *
 * Its two end joints, which is what every panel titles it with -- so the tie
 * break below runs in the order a reader would read the list in, and never in
 * the order the drawing happens to store its joints in.
 */
export function cylinderHoldOrder(cylinder: Cylinder): string {
  const named = (joint: Joint) => (joint as RealJoint).name || joint.id;
  return `${named(cylinder.mountA)}${named(cylinder.mountB)}`;
}

/**
 * Which cylinders of this drawing hold their length, and what that merges.
 *
 * Pure, and decided from the pose it is handed -- the start pose, everywhere it
 * is asked -- so every consumer gets one answer for one machine. Cheap to ask
 * of a drawing with no cylinders, which is the case it is asked about most.
 */
export function cylinderHolds(joints: Joint[], links: Link[]): CylinderHoldReport {
  const cylinders = cylindersIn(joints);
  if (cylinders.length === 0) return NOTHING;

  const loose = assignBodies(joints, links);
  // Driven is not passive, and welded shut is already rigid for a reason of its
  // own. What is left is a cylinder whose length nothing has anything to say
  // about, which is the only kind this rule is about.
  const passive = cylinders
    .filter((cylinder) => !cylinder.seal.input)
    .filter((cylinder) => !isFrozenCylinder(cylinder, loose.bodyOf))
    .sort((a, b) => cylinderHoldOrder(a).localeCompare(cylinderHoldOrder(b)));
  if (passive.length === 0) return NOTHING;

  // The gate, and the whole of why this is safe: a drawing with one freedom is
  // a drawing that runs today, and it is left exactly as it is. Holding only
  // ever happens where the machine currently refuses to move at all.
  const { dof } = freedomsOf(joints, links, loose);
  if (!(dof > 1)) return NOTHING;

  const candidates = undeterminedSlides(joints, links, loose, passive);
  if (candidates.length === 0) return NOTHING;
  const looseSeals = (some: Cylinder[]) => new Set(some.map((cylinder) => cylinder.seal.id));

  // Holding every candidate is the answer wherever it leaves the machine a
  // freedom to be driven through -- the triangle's three cylinders all hold,
  // and the count that follows is the rigid body's one. Where it leaves none,
  // some of the surplus was the machine's to take: cylinders are let go in the
  // order a reader reads them until one freedom is left, and the drawer names
  // whichever are still holding. See the file comment.
  for (let released = 0; released < candidates.length; released++) {
    const holding = candidates.slice(released);
    const merges = holding.map((cylinder) => [cylinder.barrelRoot.id, cylinder.rodRoot.id]);
    if (freedomsOf(joints, links, assignBodies(joints, links, merges)).dof >= 1) {
      return {
        held: looseSeals(holding),
        loose: looseSeals(candidates.slice(0, released)),
        merges,
      };
    }
  }
  return { held: new Set<string>(), loose: looseSeals(candidates), merges: [] };
}

/** Just the seal ids, for the many callers that want nothing else. */
export function heldCylinderSeals(joints: Joint[], links: Link[]): Set<string> {
  return cylinderHolds(joints, links).held;
}

/** A phrase of the form "A, B and C", which is how a reader would say a list. */
function listed(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * What the drawer says about a machine that runs because its cylinders are
 * holding their length.
 *
 * Said, and not left to be discovered: a reader who drew three rams and got a
 * rigid triangle would otherwise conclude the solver is broken. It is a note
 * rather than a warning because nothing here is wrong — the machine is doing
 * what the drawing means — and it ends with the one thing to do about it.
 *
 * "Holds its length", never "locked" (a Lock is a different thing here, and is
 * about position) and never "frozen", which is a word for this file and not for
 * a reader.
 */
export function describeHeldCylinders(
  held: readonly Cylinder[],
  /** The document's length unit, as `Mechanism.unit` states it. */
  unit: string,
  /** Model units per user unit, so the length reads as the reader's number. */
  perUnit: number
): { title: string; body: string } {
  const one = held.length === 1;
  const named = held.map((cylinder) => cylinderHoldOrder(cylinder));
  const lengths = held.map((cylinder) => {
    const span = Math.hypot(
      cylinder.mountB.x - cylinder.mountA.x,
      cylinder.mountB.y - cylinder.mountA.y
    );
    return (span / perUnit).toFixed(2);
  });
  const drives = held.map((cylinder) => (cylinder.seal as RealJoint).name || cylinder.seal.id);
  return {
    title: one ? 'A cylinder is holding its length' : 'Cylinders are holding their length',
    body:
      (one
        ? `Nothing drives cylinder ${named[0]} and the rest of the mechanism does not move it, so it holds the ${lengths[0]} ${unit} it was drawn at and counts as a rigid link of that length.`
        : `Nothing drives ${
            held.length === 2 ? 'either' : 'any'
          } of cylinders ${listed(named)} and the rest of the mechanism does not move them, so each holds the length it was drawn at — ${listed(
            lengths
          )} ${unit} — and counts as a rigid link of that length.`) +
      ` Right-click ${one ? `joint ${drives[0]}` : `the joint inside one of them — ${listed(drives)} —`} and switch on Driven Input to make ${one ? 'it' : 'that one'} extend instead.`,
  };
}

/**
 * The passive cylinders whose length the input does not settle.
 *
 * Hold the driven coordinate still and ask what the constraints still allow. A
 * cylinder whose slide moves in one of those motions is a length nothing is
 * deciding, and it is what this rule holds; a cylinder whose slide stands still
 * in all of them is a follower the machine itself moves, and it is left alone.
 *
 * With nothing driving the machine there is no coordinate to hold, so every
 * passive cylinder that can move at all is a candidate and the caller's tie
 * break is what leaves a freedom for the input that has yet to arrive. The set
 * is judged again the moment one goes on, which is what makes "3 degrees of
 * freedom" turn into "nothing drives this mechanism" rather than into silence.
 */
function undeterminedSlides(
  joints: Joint[],
  links: Link[],
  assignment: BodyAssignment,
  passive: Cylinder[]
): Cylinder[] {
  const frame = freedomFrameOf(joints, links, assignment);
  if (!frame) return [];
  const drive = driveRow(joints, assignment, frame);
  const free = frame.freedoms(drive ? [drive] : []);
  if (free.length === 0) return [];
  // Every freedom is scaled to move the drawing by a thousandth of its size, so
  // a slide that travels a millionth of that is standing still as far as any
  // arithmetic here can tell.
  const still = frame.reach * 1e-3 * 1e-6;
  return passive.filter((cylinder) => {
    const row = frame.slideRow(cylinder.seal);
    if (!row) return false;
    return free.some((motion) => Math.abs(frame.slideAlong(row, motion)) > still);
  });
}

/**
 * The row that holds this machine's driven coordinate still, if it has one.
 *
 * Through `resolveActuator`, because what a drive prescribes is a freedom
 * between *two* bodies and that record is the one place which pair is settled.
 * A driven slide holds its travel; a driven pin holds the angle of the body it
 * turns, measured against whatever it turns against.
 */
function driveRow(
  joints: Joint[],
  assignment: BodyAssignment,
  frame: FreedomFrame
): number[] | undefined {
  const driven = joints.find(
    (joint): joint is RealJoint => joint instanceof RealJoint && joint.input
  );
  if (!driven) return undefined;
  if (driven instanceof PrisJoint) return frame.slideRow(driven);
  const actuator = resolveActuator(driven);
  if (!actuator) return undefined;
  const bodyName = (body: Link | typeof GROUND_BODY): string =>
    body === GROUND_BODY ? WORLD : assignment.bodyOf(body);
  return frame.turnRow(bodyName(actuator.drivenBody), bodyName(actuator.referenceBody));
}
