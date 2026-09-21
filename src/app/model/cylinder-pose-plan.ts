/**
 * Where every joint ends up when an edit touches a cylinder.
 *
 * Posing a ram used to mean writing its own five coordinates. That is right
 * only while those five are the whole of what moves — which was true exactly
 * as long as a mount could not be welded to anything. Weld a bracket to a
 * mount and the bracket is rigid with the barrel: moving the bar and not the
 * bracket does not deform the body, it *tears* it, and the rebuild that
 * follows reads the wreckage as a link that changed shape.
 *
 * So a whole edit is planned before any of it is written. One snapshot, one
 * closure, one answer: the gesture's own joint moves and every cylinder
 * consequence are worked out together, and the caller commits all of it or
 * none of it. Nothing here touches a Joint.
 *
 * **Relax, then check.** Each side of a ram is rigid about its own mount, so a
 * carried point goes to `mount' + R(q - mount)`. But a ram bolted to a body
 * this edit moves has to be re-laid from *both* of its ends, and its second
 * end may not have been placed yet when its first one was — so placements are
 * recomputed until they stop changing, and only the settled result is judged.
 * Judging each write as it happens refuses compatible drawings on the strength
 * of an intermediate position that nothing ever commits.
 *
 * What is judged is the end state: every rigid body still rigid, every ram
 * still the length it was, nothing locked actually displaced. That is a
 * statement about the drawing rather than about the order the walk happened to
 * visit things in — which is why a ram whose two ends share one body is
 * refused for *extending* rather than for being shared. Translating it is
 * fine, and the old code refused it on sight.
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
   * A force or a custom center of mass on one of these is a point somebody
   * fixed to that body, and it follows this transform exactly. That is not the
   * same as following the body's first two joints: a ram being resized moves
   * those two relative to each other, and transporting a bracket's properties
   * through *that* frame stretches them along with a bar they are not on.
   */
  carried: CarriedLeaf[];
  /** Bars the edit deliberately changed the shape of: a resized barrel or rod. */
  reshaped: Link[];
  /** Top-level bodies the edit touched, for the rebuild that follows. */
  affectedRoots: Link[];
}

type EditPlanResult = { ok: true; plan: EditPlan } | { ok: false; refusal: PosePlanRefusal };

/** What the gesture itself asks for, before any consequence is worked out. */
export interface EditRequest {
  /** Joints the gesture moves directly — a link drag's own joints. */
  moves?: ReadonlyMap<string, Point>;
  /** Cylinders whose pose the gesture prescribes outright. */
  poses?: { cylinder: Cylinder; pose: CylinderPose }[];
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
  /** A carried ram's own layout, from where its two mounts have been put. */
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
 * `layoutFor` re-lays a *carried* ram from its two proposed mounts, keeping
 * the length it was drawn at. Only the caller knows how a ram is laid out, so
 * only the caller can answer that.
 */
export function planEdit(request: EditRequest, context: EditContext): EditPlanResult {
  const placements = new Map<string, Point>(request.moves ?? []);
  // What the gesture actually asked for. These are constraints, not opening
  // guesses: a consequence that wants one of them somewhere else has found a
  // drawing that cannot do what was asked, and the honest answer is to refuse
  // rather than to quietly do something adjacent. Overwriting them let a
  // welded bracket be translated by the request and then rotated by the ram
  // that followed, so the geometry and the properties disagreed.
  const requested = new Map<string, Point>(request.moves ?? []);
  const prescribed = new Map<string, CylinderPose>(
    (request.poses ?? []).map(({ cylinder, pose }) => [cylinder.seal.id, pose])
  );
  const carried = new Map<string, CarriedLeaf>();
  const reshaped = new Map<string, Link>();
  const reshapedRams = new Set<string>();
  const affectedRoots = new Map<string, Link>();
  let unreachable: Cylinder | undefined;
  /** How far apart the layout was asked to put that part's two end joints. */
  let unreachableSpan: number | undefined;
  let fused: Cylinder | undefined;
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
      return `${part} cannot follow this edit: another body in the drawing needs one of its joints somewhere the part cannot reach. Unweld ${ends}, or move one part at a time.`;
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

  /**
   * Every joint some cylinder works out for itself: N and S, of all of them.
   *
   * These are derived from their own part's two mounts, whatever body they
   * happen to sit in, and each is written by that part's own pose below. A
   * body carrying them rigidly is carrying the *bracket* they are welded into,
   * and a bracket has no opinion about how long the ram inside it is.
   *
   * This used to be each ram's own two, worked out inside `settle` -- which is
   * the same thing exactly as long as no two rams share a body. Weld two
   * barrels into one bracket and it stops being the same thing: laying out the
   * first ram put its N where the new length wanted it, placing the mount they
   * share woke the second, and the second carried that bracket -- N and all --
   * back to where it had started. The check below then found the ram the reader
   * had just resized was not the length they typed and said it could not reach.
   */
  const derivedByARam = new Set(context.cylinders.flatMap((one) => [one.inner.id, one.seal.id]));

  /** Which rams hang off each mount, so a moved joint knows who to wake. */
  const ramsAtMount = new Map<string, Cylinder[]>();
  /** And which ram each member bar belongs to, so a carried body knows too. */
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
   * The rigid motion a ram is already riding, when one is.
   *
   * A ram whose own barrel is a leaf of a body this edit is carrying has
   * already been told where to go: the body it is bolted inside decided, and
   * the rod goes with the barrel it slides in. Re-laying it between its two
   * mounts instead reads the far end's *old* position as a constraint, which
   * for two barrels welded into one bracket meant the second ram writing the
   * bracket back flat over the turn the first one had just been given.
   *
   * Only one side, and only a free far end. Carried on both sides, each end has
   * been placed by a body of its own and the part between them is re-laid, as
   * it always was; and a far end pinned to something else, or to the world, is
   * a constraint the ride would quietly tear off.
   */
  const ridingOn = (cylinder: Cylinder): Rigid | undefined => {
    const onBarrel = carried.get(cylinder.barrel.id)?.move;
    if (!onBarrel || carried.has(cylinder.rod.id)) return undefined;
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

  /** Lay out one ram and carry its two bodies. Returns the ids that moved. */
  const settle = (cylinder: Cylinder): string[] => {
    const changed: string[] = [];
    const askedFor = prescribed.get(cylinder.seal.id);

    const wasMountA = at(cylinder.mountA.id);
    const wasInner = at(cylinder.inner.id);
    const wasMountB = at(cylinder.mountB.id);
    const wasSeal = at(cylinder.seal.id);
    if (!wasMountA || !wasInner || !wasMountB || !wasSeal) return changed;

    const ride = askedFor ? undefined : ridingOn(cylinder);
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

    // A ram whose two mounts are on one body can be moved, but it cannot
    // extend: the distance between its mounts is a distance between two points
    // of something rigid. Only against a pose that was *asked for* -- a ram
    // reached through the closure may be looking at one mount that has moved
    // and one that has not yet, and that intermediate span means nothing. The
    // final check below is what judges those.
    if (askedFor && cylinder.barrelRoot.id === cylinder.rodRoot.id) {
      const was = Math.hypot(wasMountB.x - wasMountA.x, wasMountB.y - wasMountA.y);
      const asked = Math.hypot(pose.mountB.x - pose.mountA.x, pose.mountB.y - pose.mountA.y);
      if (Math.abs(was - asked) > context.tolerance) {
        fused = cylinder;
        return changed;
      }
    }

    const sides: [Link, Rigid | undefined, Joint, Point][] = [
      [
        cylinder.barrelRoot,
        rigidBetween(wasMountA, wasInner, pose.mountA, pose.inner),
        cylinder.mountA,
        pose.mountA,
      ],
      [
        cylinder.rodRoot,
        rigidBetween(wasMountB, wasSeal, pose.mountB, pose.seal),
        cylinder.mountB,
        pose.mountB,
      ],
    ];

    for (const [root, move, mount, to] of sides) {
      affectedRoots.set(root.id, root);
      if (!move) {
        if (put(mount.id, to)) changed.push(mount.id);
        continue;
      }
      for (const leaf of leavesOfBody(root)) {
        const before = carried.get(leaf.id)?.move;
        carried.set(leaf.id, { leaf, move });
        // A ram inside this body has just been moved by it, whether or not any
        // of its own joints did, so it has to be asked where that leaves it --
        // but only when the motion is news. A body that is standing still, or
        // that is being carried through the motion it was already being carried
        // through, has told it nothing, and two rams inside one bracket would
        // otherwise wake each other over the same rotation until the visit
        // limit called an ordinary turn a conflict.
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
    // rigid motion would carry it. The two agree while a ram merely moves and
    // part company the moment it changes length.
    if (put(cylinder.inner.id, pose.inner)) changed.push(cylinder.inner.id);
    if (put(cylinder.seal.id, pose.seal)) changed.push(cylinder.seal.id);

    // The ram's own two bars are the only ones this edit may reshape, and only
    // when it actually changes one of their lengths. Both are asked, because a
    // repair straightens a bent *rod* while leaving the barrel alone.
    const span = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
    const barrelChanged =
      Math.abs(span(wasMountA, wasInner) - span(pose.mountA, pose.inner)) > context.tolerance;
    const rodChanged =
      Math.abs(span(wasSeal, wasMountB) - span(pose.seal, pose.mountB)) > context.tolerance;
    if (barrelChanged || rodChanged) {
      reshaped.set(cylinder.barrel.id, cylinder.barrel);
      reshaped.set(cylinder.rod.id, cylinder.rod);
      reshapedRams.add(cylinder.seal.id);
      carried.delete(cylinder.barrel.id);
      carried.delete(cylinder.rod.id);
    }
    return changed;
  };

  (request.poses ?? []).forEach(({ cylinder }) => wake(cylinder));
  for (const id of placements.keys()) (ramsAtMount.get(id) ?? []).forEach(wake);

  // Enough revisits for every ram to answer every other one, and no more: a
  // drawing whose demands genuinely cycle stops here and is judged below.
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
    if (fused) {
      return { ok: false, refusal: bothEndsFused(fused, fused.barrelRoot, context) };
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

  // A ram's interior is derived from its mounts every time it is laid out, so
  // it is exempt from the body check — but only for the rams this edit
  // actually resized or repaired. Exempting every cylinder's interior always
  // was broader than the rule it stands for, and would have hidden a genuine
  // deformation of a ram that merely moved.
  const exempt = new Set(
    context.cylinders
      .filter((one) => reshapedRams.has(one.seal.id))
      .flatMap((one) => [one.inner.id, one.seal.id])
  );
  for (const root of affectedRoots.values()) {
    const refusal = rigidityRefusal(root, context, placements, exempt);
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
      affectedRoots: [...affectedRoots.values()],
    },
  };
}

/**
 * Whether a body the edit moved is still the same body, in the same handedness.
 *
 * Not pairwise distances, which a *reflection* preserves just as well as a
 * rotation: the transform is fitted from the body's two furthest-apart points
 * and every other point is required to land where that transform puts it.
 * `rigidBetween` only ever builds a rotation, so a mirrored body fails here
 * rather than passing a check that could not see the difference.
 *
 * A cylinder whose own bars this edit resized has its interior left out — both
 * of those joints are derived from its mounts rather than carried with them.
 */
function rigidityRefusal(
  root: Link,
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
    return shapeRefusal(root, context);
  }
  for (const point of points) {
    if (wrong(carryPoint(move, point.was), point.to)) return shapeRefusal(root, context);
  }
  return undefined;
}

/** A joint two bodies both hold, which is the pin tying them to each other. */
function jointBothHold(one: Link, other: Link, apartFrom: ReadonlySet<string>): string | undefined {
  const mine = new Set(jointsOfBody(one).map((joint) => joint.id));
  return jointsOfBody(other).find((joint) => mine.has(joint.id) && !apartFrom.has(joint.id))?.id;
}

/**
 * Both end joints of one cylinder inside one rigid body: it can be moved, it
 * cannot be extended, and the way out is to unweld one of its ends.
 */
function bothEndsFused(ram: Cylinder, body: Link, context: EditContext): PosePlanRefusal {
  return {
    code: 'cylinder.both-ends-fused',
    short: 'both ends are in one body',
    long: `${context.names.cylinder(ram)} cannot change length: both of its end joints are welded into ${context.names.body(
      body
    )}, which is one rigid body, so nothing can move them apart. Unweld joint ${context.names.joint(
      ram.mountA.id
    )} or joint ${context.names.joint(ram.mountB.id)} first.`,
  };
}

/**
 * Why a body this edit would pull out of shape cannot be pulled out of shape.
 *
 * Three different facts used to share one sentence, and the sentence was only
 * ever true of the first of them: it told a reader whose cylinder sat between
 * *two* bodies pinned to each other that both of its ends were welded into one
 * — and named that one body `CC1F`, after a joint the drawing never draws. What
 * is in the way is knowable from the drawing, so each case says its own.
 */
function shapeRefusal(root: Link, context: EditContext): PosePlanRefusal {
  const body = context.names.body(root);
  const ram = context.cylinders.find(
    (one) => one.barrelRoot.id === root.id || one.rodRoot.id === root.id
  );
  if (!ram) {
    return {
      code: 'cylinder.pose-conflict',
      short: 'it cannot change shape',
      long: `This edit would change the shape of ${body}, which is one rigid body. Move the whole body, or unweld it so its bars can move on their own.`,
    };
  }
  if (ram.barrelRoot.id === ram.rodRoot.id) return bothEndsFused(ram, root, context);

  const part = context.names.cylinder(ram);
  const ends = `joint ${context.names.joint(ram.mountA.id)} or joint ${context.names.joint(
    ram.mountB.id
  )}`;
  // Its own four joints are not what ties the two bodies together; anything
  // else they both hold is.
  const pin = jointBothHold(
    ram.barrelRoot,
    ram.rodRoot,
    new Set([ram.mountA.id, ram.inner.id, ram.seal.id, ram.mountB.id])
  );
  if (pin) {
    return {
      code: 'cylinder.pose-conflict',
      short: 'its ends are tied together',
      long: `${part} cannot change length here: one end is welded into ${context.names.body(
        ram.barrelRoot
      )} and the other into ${context.names.body(
        ram.rodRoot
      )}, and those two bodies meet again at joint ${context.names.joint(
        pin
      )} — so the drawing has nothing to give. Unweld ${ends} first.`,
    };
  }
  const end = root.id === ram.barrelRoot.id ? ram.mountA : ram.mountB;
  return {
    code: 'cylinder.pose-conflict',
    short: 'it cannot change shape',
    long: `This edit would change the shape of ${body}, which is one rigid body: ${part} cannot move the way it is being asked to without taking that body with it. Unweld joint ${context.names.joint(
      end.id
    )} to let the cylinder move on its own.`,
  };
}
