/**
 * Where every joint ends up when an edit touches a cylinder.
 *
 * **Only a body drag carries** (decision S21). The reader taking hold of a
 * barrel, a rod, or a body welded to either and moving the whole assembly is a
 * *body motion* — `motion: 'body'` on the pose below, written by
 * `GridUtilsService.dragCylinder` and `rotateCylinder` and by nothing else.
 * That carries every bar welded to either member rigidly, the way picking a
 * part up off the bench does, and a cylinder inside a body being carried rides
 * along with it.
 *
 * **Every other edit writes the cylinder's own joints and nothing else**:
 * dragging an end joint, dragging the slide, a typed angle, *Starts at* or a
 * member length, and a cylinder re-laid because something else moved one of
 * its end joints. A body welded to a member then **changes shape**, exactly as
 * a compound link does when one of its joints is dragged: its other joints
 * stay where the reader put them.
 *
 * This file used to argue the opposite — that moving a member and not the
 * bracket welded to it does not deform the body but *tears* it. Nothing else
 * in the app believes that. Drag one joint of an ordinary compound and that
 * joint moves while the compound changes shape; type a Length or an Angle on a
 * bar and one joint moves. A welded body is rigid in the *simulation*; in the
 * editor it is a shape somebody is still drawing. The maintainer settled it on
 * September 21, 2026: a bar welded to a barrel's end joint must not swing round
 * when the cylinder's far end is dragged, and two cylinders welded into one
 * bracket must not move each other.
 *
 * A whole edit is still planned before any of it is written. One snapshot, one
 * closure, one answer: the gesture's own joint moves and every cylinder
 * consequence are worked out together, and the caller commits all of it or
 * none of it. Nothing here touches a Joint.
 *
 * **Relax, then check.** A cylinder bolted to a body this edit moves has to be
 * re-laid from *both* of its ends, and its second end may not have been placed
 * yet when its first one was — so placements are recomputed until they stop
 * changing, and only the settled result is judged. Judging each write as it
 * happens refuses compatible drawings on the strength of an intermediate
 * position that nothing ever commits.
 *
 * What is judged is the end state: every cylinder the two lengths its own
 * layout chose, nothing locked actually displaced, and — for a body motion
 * alone — every body it carried still rigid and still the same handedness. A
 * body the edit deliberately let change shape is not a failed rigid motion, so
 * it is never asked.
 */

import { Cylinder, CylinderPose } from './cylinder';
import { Joint, RealJoint } from './joint';
import { Link, RealLink } from './link';

export interface Point {
  x: number;
  y: number;
}

/** Where things were before the edit: the plan reads only from here. */
type PoseSnapshot = ReadonlyMap<string, Point>;

interface PosePlanRefusal {
  code: string;
  short: string;
  long: string;
}

/** A rigid motion: rotate about `pivot`, then land the pivot on `to`. */
interface Rigid {
  pivot: Point;
  to: Point;
  cos: number;
  sin: number;
}

/** A bar the edit moved without changing its shape, and what moved it. */
interface CarriedLeaf {
  leaf: Link;
  move: Rigid;
}

export interface EditPlan {
  /** Every joint the plan places, by id. */
  placements: Map<string, Point>;
  /** The ones that actually go somewhere new. */
  movedIds: Set<string>;
  /**
   * Bars carried rigidly, and by what.
   *
   * A body motion puts every bar of both bodies in here; every other edit puts
   * in the cylinder's own barrel and rod alone, because a member that turns
   * about its end joint is still the same bar even when the body welded around
   * it is changing shape.
   *
   * A force or a custom center of mass on one of these is a point somebody
   * fixed to that bar, and it follows this transform exactly. That is not the
   * same as following the body's first two joints: a cylinder being resized
   * moves those two relative to each other, and transporting a bracket's
   * properties through *that* frame stretches them along with a bar they are
   * not on.
   */
  carried: CarriedLeaf[];
  /** Bars the edit deliberately changed the shape of: a resized barrel or rod. */
  reshaped: Link[];
  /**
   * The bodies a **body motion** claimed it was carrying rigidly.
   *
   * Only those. A body the edit deliberately let change shape — the bracket on
   * the end joint a reader is dragging — is not a failed rigid motion, and
   * listing it here would put it in front of a check written to refuse exactly
   * that (S21).
   */
  affectedRoots: Link[];
}

type EditPlanResult = { ok: true; plan: EditPlan } | { ok: false; refusal: PosePlanRefusal };

/** One cylinder the gesture places outright, and what kind of gesture it is. */
export interface PosedCylinder {
  cylinder: Cylinder;
  pose: CylinderPose;
  /**
   * `'body'` when the reader has the whole assembly in hand.
   *
   * The one thing that makes a welded neighbor move (S21). `dragCylinder` and
   * `rotateCylinder` set it; every other pose — a dragged end joint, a dragged
   * slide, a typed angle, *Starts at*, a member length — leaves it off, and
   * those write the cylinder's own joints and let the bodies around them
   * change shape.
   */
  motion?: 'body';
}

/** What the gesture itself asks for, before any consequence is worked out. */
export interface EditRequest {
  /** Joints the gesture moves directly — a link drag's own joints. */
  moves?: ReadonlyMap<string, Point>;
  /** Cylinders whose pose the gesture prescribes outright. */
  poses?: PosedCylinder[];
}

/**
 * What a reader calls the things a refusal has to name.
 *
 * Nothing here can work it out for itself. A link's id is the sorted letters of
 * its joints, and one of those letters may be a cylinder's buried inner end --
 * so a refusal built from ids offered the reader `CC1F`, a body named after a
 * joint the drawing never draws and they cannot click. The service knows the
 * reader's names (`MechanismService.bodyLabel` / `visibleBodyName`, decisions
 * S10, S11 and S16), so it says them and every id that reaches a sentence here
 * comes through this.
 */
export interface EditNames {
  /** A body as a complete noun phrase: `Link CF`, `Barrel CE`, `Rod ED`. */
  body: (body: Link) => string;
  /** A whole cylinder the same way, by its two end joints: `Cylinder CD`. */
  cylinder: (cylinder: Cylinder) => string;
  /** A joint by the letter it wears, or the name somebody typed on it. */
  joint: (id: string) => string;
}

export interface EditContext {
  cylinders: Cylinder[];
  snapshot: PoseSnapshot;
  /** What to call a body, a cylinder and a joint in anything said out loud. */
  names: EditNames;
  /** A carried cylinder's own layout, from where its two end joints have been put. */
  layoutFor: (cylinder: Cylinder, mountA: Point, mountB: Point) => CylinderPose | undefined;
  /** How far two answers for one point may differ and still be one answer. */
  tolerance: number;
  /** Joints a Lock holds still. */
  frozen?: (id: string) => boolean;
  /**
   * Why a carried cylinder could not reach, when a fixed length is the reason.
   *
   * `layoutFor` answers with a pose or with nothing, which is all a plan needs
   * to know; the reader needs to know *which* number is in the way, and only
   * the caller can see the holds. Worded there, in the sentence the rest of the
   * app words a hold with, so a refusal here and a refusal from a panel field
   * name the same thing the same way.
   */
  heldBy?: (cylinder: Cylinder) => string | undefined;
}

/** Take the positions a plan will be measured against. */
export function snapshotOf(joints: Joint[]): PoseSnapshot {
  return new Map(joints.map((joint) => [joint.id, { x: joint.x, y: joint.y }]));
}

function rigidBetween(pivot: Point, aim: Point, to: Point, aimTo: Point): Rigid | undefined {
  if (
    Math.hypot(aim.x - pivot.x, aim.y - pivot.y) < 1e-9 ||
    Math.hypot(aimTo.x - to.x, aimTo.y - to.y) < 1e-9
  ) {
    return undefined;
  }
  const turn =
    Math.atan2(aimTo.y - to.y, aimTo.x - to.x) - Math.atan2(aim.y - pivot.y, aim.x - pivot.x);
  return { pivot, to, cos: Math.cos(turn), sin: Math.sin(turn) };
}

/**
 * Whether a pose moves a cylinder without changing its shape.
 *
 * Fitted from the two end joints, which are the part's furthest-apart pair, and
 * every one of the four required to land where that fit puts it. What a body
 * motion claims, in one line, so the claim can be checked before anything is
 * written.
 */
function isRigidPose(was: Point[], pose: CylinderPose, tolerance: number): boolean {
  const [wasA, wasB] = was;
  const move = rigidBetween(wasA, wasB, pose.mountA, pose.mountB);
  if (!move) return false;
  const to = [pose.mountA, pose.mountB, pose.inner, pose.seal];
  const span = Math.hypot(wasB.x - wasA.x, wasB.y - wasA.y);
  const slack = Math.max(tolerance, span * 1e-6);
  return was.every((point, index) => {
    const landed = carryPoint(move, point);
    return Math.hypot(landed.x - to[index].x, landed.y - to[index].y) <= slack;
  });
}

/** Where a point fixed to the moving body ends up. */
export function carryPoint(move: Rigid, point: Point): Point {
  const dx = point.x - move.pivot.x;
  const dy = point.y - move.pivot.y;
  return {
    x: move.to.x + dx * move.cos - dy * move.sin,
    y: move.to.y + dx * move.sin + dy * move.cos,
  };
}

/** Every joint of a link and of anything nested inside it, each once. */
function jointsOfBody(root: Link): Joint[] {
  const found = new Map<string, Joint>();
  const walk = (node: Link) => {
    node.joints.forEach((joint) => found.set(joint.id, joint));
    if (node instanceof RealLink) node.subset.forEach(walk);
  };
  walk(root);
  return [...found.values()];
}

/** The bars inside a body, so a caller can rebuild exactly what it carried. */
function leavesOfBody(root: Link): Link[] {
  const found = new Map<string, Link>();
  const walk = (node: Link) => {
    found.set(node.id, node);
    if (node instanceof RealLink) node.subset.forEach(walk);
  };
  walk(root);
  return [...found.values()];
}

/**
 * Plan a whole edit: the gesture's own moves, and everything they reach.
 *
 * `layoutFor` re-lays a cylinder from its two proposed end joints, keeping the
 * lengths it was drawn at. Only the caller knows how one is laid out, so only
 * the caller can answer that.
 */
export function planEdit(request: EditRequest, context: EditContext): EditPlanResult {
  /**
   * Every joint some cylinder works out for itself: N and S, of all of them.
   *
   * These are derived from their own part's two end joints, whatever body they
   * happen to sit in, and each is written by that part's own pose below. A
   * body carrying them rigidly is carrying the *bracket* they are welded into,
   * and a bracket has no opinion about how long the cylinder inside it is.
   *
   * It is also why a request may not name one. `moveLinkRigidly` lists every
   * joint of the body it is dragging, and a compound holding a barrel holds N,
   * so a drag of a welded bracket arrived here asking for N in a place its own
   * cylinder was about to overrule — and the disagreement came back to the
   * reader as two parts that could not agree, over a joint the drawing does
   * not draw. Dropped from the request rather than refused: the joint has an
   * owner, and it is not the caller.
   */
  const derivedByARam = new Set(context.cylinders.flatMap((one) => [one.inner.id, one.seal.id]));
  const asked = [...(request.moves ?? [])].filter(([id]) => !derivedByARam.has(id));
  const placements = new Map<string, Point>(asked);
  // What the gesture actually asked for. These are constraints, not opening
  // guesses: a consequence that wants one of them somewhere else has found a
  // drawing that cannot do what was asked, and the honest answer is to refuse
  // rather than to quietly do something adjacent. Overwriting them let a
  // welded bracket be translated by the request and then rotated by the
  // cylinder that followed, so the geometry and the properties disagreed.
  const requested = new Map<string, Point>(asked);
  const prescribed = new Map<string, PosedCylinder>(
    (request.poses ?? []).map((posed) => [posed.cylinder.seal.id, posed])
  );
  const carried = new Map<string, CarriedLeaf>();
  const reshapedRams = new Set<string>();
  /**
   * The bars a **body motion** is carrying, and by what.
   *
   * A subset of `carried`, and the one a rider asks: `carried` also holds each
   * cylinder's own two members, which move rigidly under every edit, and
   * reading a ride off that would have a part carry its neighbors again the
   * moment it re-laid itself.
   */
  const rigidlyCarried = new Map<string, Rigid>();
  const reshaped = new Map<string, Link>();
  /** Each body a body motion carried, with the cylinder that took it along. */
  const affectedRoots = new Map<string, { root: Link; part: Cylinder }>();
  let unreachable: Cylinder | undefined;
  /** How far apart the layout was asked to put that part's two end joints. */
  let unreachableSpan: number | undefined;
  /** A body motion handed a pose that is not a rigid motion of the part. */
  let torn: { cylinder: Cylinder; root: Link } | undefined;
  let denied: string | undefined;

  const at = (id: string): Point | undefined => context.snapshot.get(id);
  const now = (id: string): Point | undefined => placements.get(id) ?? at(id);
  const near = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) <= context.tolerance;
  const spanOf = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  /** A motion that leaves the body it carries exactly where it stands. */
  const stationary = (move: Rigid) =>
    near(move.pivot, move.to) &&
    Math.abs(move.cos - 1) <= context.tolerance &&
    Math.abs(move.sin) <= context.tolerance;
  const sameMove = (a: Rigid, b: Rigid) =>
    near(a.pivot, b.pivot) &&
    near(a.to, b.to) &&
    Math.abs(a.cos - b.cos) <= context.tolerance &&
    Math.abs(a.sin - b.sin) <= context.tolerance;

  /**
   * One code for the class of "the part cannot be where that leaves it", and
   * four different things to say inside it.
   *
   * Two doors reach it — a carried layout that answered with nothing, and the
   * settled drawing failing the check below — and they were one sentence,
   * "Moving this would stretch AB past what it can reach", which named no
   * number the reader could release and no move they could make instead. Which
   * of the four it is *is* knowable here: a member fixed at its length is the
   * caller's `heldBy`, and the other three are read off the span the layout was
   * handed.
   */
  const cannotReach = (
    one: Cylinder,
    because: 'held' | 'closed' | 'nowhere' | 'overruled'
  ): EditPlanResult => {
    const held = context.heldBy?.(one);
    const part = context.names.cylinder(one);
    const ends = `joint ${context.names.joint(one.mountA.id)} or joint ${context.names.joint(
      one.mountB.id
    )}`;
    const why = () => {
      if (held) {
        // "Held by fixed length Rod BC" — the app's own words for a hold, so a
        // refusal here and the padlock in the panel name the same number.
        return `${held}, so ${part} cannot change length to follow this edit. Release what is holding it, or move its other end instead.`;
      }
      if (because === 'nowhere') {
        return `${part} cannot follow this edit: it would put both of its end joints on one point, and a cylinder needs a direction to lie along. Move one of them somewhere else.`;
      }
      if (because === 'closed') {
        return `${part} is already closed as far as it goes, and this edit would bring its two end joints closer still. Move it the other way, or give its barrel a shorter length first.`;
      }
      return `${part} cannot follow this edit: another body in the drawing needs one of its joints somewhere the part cannot reach. Set ${ends} to Revolute, or move one part at a time.`;
    };
    return {
      ok: false,
      refusal: {
        code: 'cylinder.carried-too-far',
        short: 'a cylinder cannot follow',
        long: why(),
      },
    };
  };

  const put = (id: string, to: Point): boolean => {
    const asked = requested.get(id);
    if (asked) {
      if (!near(asked, to)) denied ??= id;
      return false;
    }
    const standing = placements.get(id);
    if (standing && near(standing, to)) return false;
    placements.set(id, to);
    return true;
  };

  /** Which cylinders hang off each end joint, so a moved joint knows who to wake. */
  const ramsAtMount = new Map<string, Cylinder[]>();
  /** And which cylinder each member bar belongs to, so a carried body knows. */
  const ramsOfBar = new Map<string, Cylinder[]>();
  for (const cylinder of context.cylinders) {
    for (const mount of [cylinder.mountA, cylinder.mountB]) {
      const list = ramsAtMount.get(mount.id) ?? [];
      list.push(cylinder);
      ramsAtMount.set(mount.id, list);
    }
    for (const bar of [cylinder.barrel, cylinder.rod]) {
      const list = ramsOfBar.get(bar.id) ?? [];
      list.push(cylinder);
      ramsOfBar.set(bar.id, list);
    }
  }

  // --- propagate in dependency order ---------------------------------------
  //
  // A worklist rather than repeated sweeps over the whole list. A ram is
  // revisited exactly when one of its mounts moves, so a chain settles in one
  // pass however the cylinders happen to be enumerated; sweeping in a fixed
  // order propagated one link of a reversed chain per round and gave up on a
  // long one, calling a perfectly ordinary edit a conflict.
  const queue: Cylinder[] = [];
  const waiting = new Set<string>();
  const wake = (cylinder: Cylinder) => {
    if (waiting.has(cylinder.seal.id)) return;
    waiting.add(cylinder.seal.id);
    queue.push(cylinder);
  };

  // A block used to need settling here: it was zero-length, so its two joints
  // were one point, and a block bolted to a *mount* belonged to no cylinder body
  // and would otherwise have been left behind. A slider is one joint now (Stage
  // 1 of `docs/joint-type-and-cylinder-plan.md`), so there is no partner to
  // carry and the plan moves the joint it was asked to move.

  /**
   * The pose each cylinder was last laid out at, so the settled drawing can be
   * measured against what the layout actually decided.
   */
  const settled = new Map<string, { cylinder: Cylinder; pose: CylinderPose }>();

  /**
   * The rigid motion a cylinder is already riding, when one is.
   *
   * A cylinder whose own barrel is a leaf of a body a **body motion** is
   * carrying has already been told where to go: the body it is bolted inside
   * decided, and the rod goes with the barrel it slides in. Re-laying it
   * between its two end joints instead reads the far end's *old* position as a
   * constraint, which for two barrels welded into one bracket meant the second
   * cylinder writing the bracket back flat over the turn the first one had
   * just been given.
   *
   * Only one side, and only a free far end. Carried on both sides, each end has
   * been placed by a body of its own and the part between them is re-laid, as
   * it always was; and a far end pinned to something else, or to the world, is
   * a constraint the ride would quietly tear off.
   */
  const ridingOn = (cylinder: Cylinder): Rigid | undefined => {
    const onBarrel = rigidlyCarried.get(cylinder.barrel.id);
    if (!onBarrel || rigidlyCarried.has(cylinder.rod.id)) return undefined;
    const far = cylinder.mountB;
    if (far instanceof RealJoint && (far.ground || far.locked)) return undefined;
    const elsewhere =
      far instanceof RealJoint && far.links.some((link) => link.id !== cylinder.rodRoot.id);
    return elsewhere ? undefined : onBarrel;
  };

  /** That ride as a pose: the part's four points, carried and nothing else. */
  const carriedPose = (cylinder: Cylinder, move: Rigid): CylinderPose | undefined => {
    const corners = [cylinder.mountA, cylinder.inner, cylinder.seal, cylinder.mountB].map((joint) =>
      at(joint.id)
    );
    if (corners.some((corner) => !corner)) return undefined;
    const [mountA, inner, seal, mountB] = corners.map((corner) => carryPoint(move, corner!));
    // No `lengths`: this is a rigid motion of a part already drawn, which
    // declares none and is measured against itself.
    return { mountA, inner, seal, mountB };
  };

  /**
   * Lay out one cylinder and write what that reaches. Returns the ids that
   * moved.
   *
   * Two kinds of edit, and the difference is the whole of S21. A **body
   * motion** carries both of the part's bodies rigidly, brackets and all — and
   * so does a *ride*, which is a body motion inherited: the reader picked up a
   * body this cylinder is welded inside, so it is being carried whether or not
   * it was named. Every other pose writes the part's own four joints, leaves
   * each member rigid about its own end joint, and lets whatever is welded
   * around it change shape.
   */
  const settle = (cylinder: Cylinder): string[] => {
    const changed: string[] = [];
    const posed = prescribed.get(cylinder.seal.id);
    const askedFor = posed?.pose;
    const asBody = posed?.motion === 'body';

    const wasMountA = at(cylinder.mountA.id);
    const wasInner = at(cylinder.inner.id);
    const wasMountB = at(cylinder.mountB.id);
    const wasSeal = at(cylinder.seal.id);
    if (!wasMountA || !wasInner || !wasMountB || !wasSeal) return changed;

    const ride = askedFor ? undefined : ridingOn(cylinder);
    // One body motion reaches every part welded into what it picked up: the
    // second cylinder in a bracket rides the first, and whatever is welded to
    // *its* far end rides with it. Stopping the carry at the named part broke
    // the chain one cylinder in.
    const body = asBody || ride !== undefined;
    const pose =
      askedFor ??
      (ride && carriedPose(cylinder, ride)) ??
      context.layoutFor(cylinder, now(cylinder.mountA.id)!, now(cylinder.mountB.id)!);
    if (!pose) {
      unreachable = cylinder;
      // How far apart the layout was asked to hold the two ends, which is what
      // tells "on one point" from "shorter than the part closes to".
      unreachableSpan = spanOf(now(cylinder.mountA.id)!, now(cylinder.mountB.id)!);
      return changed;
    }
    settled.set(cylinder.seal.id, { cylinder, pose });

    // A cylinder whose two end joints are welded into one body used to be
    // refused an extension here, on the reading that the distance between two
    // points of a rigid body is not a number an edit gets to choose. S21 says
    // it is: the body changes shape, the way a welded triangle does when a
    // corner is dragged. What such a drawing cannot do is *simulate*, and
    // saying so is `mechanism/readiness.ts`'s job rather than the editor's.

    // What is left of that, one level up: a **body motion** promises a rigid
    // pose, and the carry below hands each of the part's two bodies one motion
    // on that promise. A pose that is not rigid hands them two different ones,
    // which pulls a body holding both of a cylinder's ends apart. Refused here,
    // before a joint is placed, so the sentence is about the shape rather than
    // about the arithmetic that fell over downstream.
    if (
      asBody &&
      !isRigidPose([wasMountA, wasMountB, wasInner, wasSeal], pose, context.tolerance)
    ) {
      torn = { cylinder, root: cylinder.barrelRoot };
      return changed;
    }

    const sides = [
      {
        root: cylinder.barrelRoot,
        member: cylinder.barrel,
        move: rigidBetween(wasMountA, wasInner, pose.mountA, pose.inner),
        mount: cylinder.mountA,
        to: pose.mountA,
      },
      {
        root: cylinder.rodRoot,
        member: cylinder.rod,
        move: rigidBetween(wasMountB, wasSeal, pose.mountB, pose.seal),
        mount: cylinder.mountB,
        to: pose.mountB,
      },
    ];

    for (const { root, member, move, mount, to } of sides) {
      if (put(mount.id, to)) changed.push(mount.id);
      if (!body) {
        // The member is still the bar it was -- a barrel that turns about its
        // own end joint is the same barrel -- so a force or a hand-placed
        // center of mass on *it* goes through that motion. Nothing else does.
        // A bracket welded to this end joint holds a joint that moved and two
        // that did not, which is a body changing shape, and that is what the
        // rest of the app does to a compound whose joint is dragged (S21).
        if (move) carried.set(member.id, { leaf: member, move });
        continue;
      }
      if (!affectedRoots.has(root.id)) affectedRoots.set(root.id, { root, part: cylinder });
      if (!move) continue;
      for (const leaf of leavesOfBody(root)) {
        const before = rigidlyCarried.get(leaf.id);
        rigidlyCarried.set(leaf.id, move);
        carried.set(leaf.id, { leaf, move });
        // A cylinder inside this body has just been moved by it, whether or not
        // any of its own joints did, so it has to be asked where that leaves it
        // -- but only when the motion is news. A body that is standing still,
        // or that is being carried through the motion it was already being
        // carried through, has told it nothing, and two cylinders inside one
        // bracket would otherwise wake each other over the same rotation until
        // the visit limit called an ordinary turn a conflict.
        if (stationary(move) || (before && sameMove(before, move))) continue;
        for (const rider of ramsOfBar.get(leaf.id) ?? []) {
          if (rider.seal.id !== cylinder.seal.id) wake(rider);
        }
      }
      for (const joint of jointsOfBody(root)) {
        if (derivedByARam.has(joint.id)) continue;
        const was = at(joint.id);
        if (was && put(joint.id, carryPoint(move, was))) changed.push(joint.id);
      }
    }

    // The interior is where the extension puts it, not where either body's
    // rigid motion would carry it. The two agree while a cylinder merely moves
    // and part company the moment it changes length.
    if (put(cylinder.inner.id, pose.inner)) changed.push(cylinder.inner.id);
    if (put(cylinder.seal.id, pose.seal)) changed.push(cylinder.seal.id);

    // The cylinder's own two bars are the only ones this edit may reshape, and
    // only when it actually changes one of their lengths. Both are asked,
    // because a repair straightens a bent *rod* while leaving the barrel alone.
    const span = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
    const barrelChanged =
      Math.abs(span(wasMountA, wasInner) - span(pose.mountA, pose.inner)) > context.tolerance;
    const rodChanged =
      Math.abs(span(wasSeal, wasMountB) - span(pose.seal, pose.mountB)) > context.tolerance;
    if (barrelChanged || rodChanged) {
      reshaped.set(cylinder.barrel.id, cylinder.barrel);
      reshaped.set(cylinder.rod.id, cylinder.rod);
      reshapedRams.add(cylinder.seal.id);
      // A bar this edit resized is not a bar it carried, whichever door put it
      // in either list -- including a ride it has just re-laid itself out of.
      carried.delete(cylinder.barrel.id);
      carried.delete(cylinder.rod.id);
      rigidlyCarried.delete(cylinder.barrel.id);
      rigidlyCarried.delete(cylinder.rod.id);
    }
    return changed;
  };

  (request.poses ?? []).forEach(({ cylinder }) => wake(cylinder));
  for (const id of placements.keys()) (ramsAtMount.get(id) ?? []).forEach(wake);

  // Enough revisits for every cylinder to answer every other one, and no more:
  // a drawing whose demands genuinely cycle stops here and is judged below.
  const VISITS = context.cylinders.length * (context.cylinders.length + 4) + 16;
  let visits = 0;
  while (queue.length > 0) {
    if (++visits > VISITS) {
      return {
        ok: false,
        refusal: {
          code: 'cylinder.pose-conflict',
          short: 'parts disagree',
          long: 'The cylinders here each depend on where the others end up, so this edit has no one answer. Move one of them at a time.',
        },
      };
    }
    const cylinder = queue.shift()!;
    waiting.delete(cylinder.seal.id);
    const moved = settle(cylinder);
    if (torn) {
      return { ok: false, refusal: shapeRefusal(torn.root, torn.cylinder, context) };
    }
    if (unreachable) {
      // Coincident ends have no axis to lie along; anything further apart than
      // that was a span the part could not shrink to.
      const nowhere = (unreachableSpan ?? 0) <= context.tolerance;
      return cannotReach(unreachable, nowhere ? 'nowhere' : 'closed');
    }
    moved.forEach((id) => (ramsAtMount.get(id) ?? []).forEach(wake));
  }

  // --- what the settled drawing has to satisfy ------------------------------

  // The gesture's own joints really were honored. A layout hands both end
  // joints back exactly where it was given them, so under S21 the only way in
  // is a request that both moves joints and prescribes a body motion over one
  // of them — nothing in the app does that, and the guard is what says so.
  if (denied) {
    const pulling = ramsAtMount.get(denied) ?? [];
    const by =
      pulling.length > 0 ? context.names.cylinder(pulling[0]) : 'a cylinder attached to it';
    return {
      ok: false,
      refusal: {
        code: 'cylinder.pose-conflict',
        short: 'parts disagree',
        long: `This edit needs joint ${context.names.joint(denied)} in two places at once: where it is being moved to, and where ${by} has to have it. Move one of them at a time.`,
      },
    };
  }

  for (const [id, to] of placements) {
    const was = at(id);
    // A lock refuses *displacement*, not appearing in the plan. Every pose
    // names both mounts, and a rotation about one of them leaves that one
    // exactly where it was — which used to be refused as if it had moved.
    if (was && !near(was, to) && context.frozen?.(id)) {
      return {
        ok: false,
        refusal: {
          code: 'cylinder.pose-locked',
          short: 'a lock holds it',
          long: `This edit would move joint ${context.names.joint(id)}, and a Lock is holding it where it is. Unlock that joint, or move something the Lock does not reach.`,
        },
      };
    }
  }

  // Every cylinder this edit laid out has to have ended up the two lengths its
  // own layout chose. A pose says what those are (`CylinderPose.lengths`), so
  // this holds the settled drawing to the arithmetic rather than to the four
  // points, which is the difference that matters: a pose whose points were
  // edited after it was built agrees with itself and not with its own numbers.
  // That is exactly how a rod holding its length came to be stretched — the
  // requested mount written back over the fitted one, and the difference
  // absorbed by the one member that was supposed to be fixed. A rigid motion
  // of a part already drawn declares no lengths and is measured against
  // itself, which is all there is to check there.
  for (const { cylinder, pose } of settled.values()) {
    const a = now(cylinder.mountA.id);
    const n = now(cylinder.inner.id);
    const s = now(cylinder.seal.id);
    const b = now(cylinder.mountB.id);
    if (!a || !n || !s || !b) continue;
    const meant = pose.lengths ?? {
      barrel: spanOf(pose.mountA, pose.inner),
      rod: spanOf(pose.seal, pose.mountB),
    };
    const off = (placed: number, wanted: number) => Math.abs(placed - wanted) > context.tolerance;
    if (off(spanOf(a, n), meant.barrel) || off(spanOf(s, b), meant.rod)) {
      return cannotReach(cylinder, 'overruled');
    }
  }

  // A cylinder's interior is derived from its end joints every time it is laid
  // out, so it is exempt from the body check — but only for the parts this edit
  // actually resized or repaired. Exempting every cylinder's interior always
  // was broader than the rule it stands for, and would have hidden a genuine
  // deformation of a part that merely moved.
  const exempt = new Set(
    context.cylinders
      .filter((one) => reshapedRams.has(one.seal.id))
      .flatMap((one) => [one.inner.id, one.seal.id])
  );
  // Only what a body motion said it was carrying. Under S21 every other edit
  // lets the bodies around a cylinder change shape on purpose, so `affectedRoots`
  // holds nothing from them and this loop runs over nothing.
  for (const { root, part } of affectedRoots.values()) {
    const refusal = rigidityRefusal(root, part, context, placements, exempt);
    if (refusal) return { ok: false, refusal };
  }

  return {
    ok: true,
    plan: {
      placements,
      movedIds: new Set(
        [...placements].filter(([id, to]) => !near(at(id) ?? to, to)).map(([id]) => id)
      ),
      carried: [...carried.values()],
      reshaped: [...reshaped.values()],
      affectedRoots: [...affectedRoots.values()].map(({ root }) => root),
    },
  };
}

/**
 * Whether a body a **body motion** carried is still the same body, in the same
 * handedness.
 *
 * Asked of nothing else (S21). A bracket on the end joint a reader is dragging
 * is meant to change shape, and putting it in front of this check is how a
 * perfectly ordinary drag came to be refused as a tear.
 *
 * Not pairwise distances, which a *reflection* preserves just as well as a
 * rotation: the transform is fitted from the body's two furthest-apart points
 * and every other point is required to land where that transform puts it.
 * `rigidBetween` only ever builds a rotation, so a mirrored body fails here
 * rather than passing a check that could not see the difference.
 *
 * A cylinder whose own bars this edit resized has its interior left out — both
 * of those joints are derived from its end joints rather than carried with them.
 */
function rigidityRefusal(
  root: Link,
  part: Cylinder,
  context: EditContext,
  placements: Map<string, Point>,
  exempt: Set<string>
): PosePlanRefusal | undefined {
  const points = jointsOfBody(root)
    .filter((joint) => !exempt.has(joint.id))
    .map((joint) => ({
      was: context.snapshot.get(joint.id),
      to: placements.get(joint.id) ?? context.snapshot.get(joint.id),
    }))
    .filter((pair): pair is { was: Point; to: Point } => !!pair.was && !!pair.to);
  if (points.length < 2) return undefined;

  let first = 0;
  let second = 1;
  let widest = -1;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const span = Math.hypot(points[i].was.x - points[j].was.x, points[i].was.y - points[j].was.y);
      if (span > widest) {
        widest = span;
        first = i;
        second = j;
      }
    }
  }
  if (widest <= context.tolerance) return undefined;

  const move = rigidBetween(
    points[first].was,
    points[second].was,
    points[first].to,
    points[second].to
  );
  const wrong = (a: Point, b: Point) =>
    Math.hypot(a.x - b.x, a.y - b.y) > Math.max(context.tolerance, widest * 1e-6);
  if (!move || wrong(carryPoint(move, points[second].was), points[second].to)) {
    return shapeRefusal(root, part, context);
  }
  for (const point of points) {
    if (wrong(carryPoint(move, point.was), point.to)) return shapeRefusal(root, part, context);
  }
  return undefined;
}

/**
 * Why a body a body motion was carrying could not go where it was taken.
 *
 * One sentence, where there were four. Three of the four spoke about a
 * cylinder being *re-laid* pulling a welded body out of shape, and under S21
 * that is not a refusal at all — it is the edit doing what the reader asked,
 * so those three were deleted rather than left as branches nothing can enter.
 * What is left guards the promise `motion: 'body'` makes: a body drag picks the
 * whole assembly up, and every bar welded into it arrives in the shape it
 * started in.
 *
 * The body is always one of the cylinder's own two, because `affectedRoots`
 * holds nothing else, so the sentence can name the part and the weld to undo.
 */
function shapeRefusal(root: Link, part: Cylinder, context: EditContext): PosePlanRefusal {
  const body = context.names.body(root);
  const end = root.id === part.barrelRoot.id ? part.mountA : part.mountB;
  return {
    code: 'cylinder.pose-conflict',
    short: 'it cannot change shape',
    long: `Moving ${context.names.cylinder(
      part
    )} as one piece would change the shape of ${body}, which is one rigid body: something else in the drawing needs one of its joints somewhere else. Set joint ${context.names.joint(
      end.id
    )} to Revolute to let the cylinder move on its own, or move one part at a time.`,
  };
}
