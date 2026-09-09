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
import { Link, RealLink, SliderBlock } from './link';

export interface Point {
  x: number;
  y: number;
}

/** Where things were before the edit: the plan reads only from here. */
export type PoseSnapshot = ReadonlyMap<string, Point>;

export interface PosePlanRefusal {
  code: string;
  short: string;
  long: string;
}

/** A rigid motion: rotate about `pivot`, then land the pivot on `to`. */
export interface Rigid {
  pivot: Point;
  to: Point;
  cos: number;
  sin: number;
}

/** A bar the edit moved without changing its shape, and what moved it. */
export interface CarriedLeaf {
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

export type EditPlanResult = { ok: true; plan: EditPlan } | { ok: false; refusal: PosePlanRefusal };

/** What the gesture itself asks for, before any consequence is worked out. */
export interface EditRequest {
  /** Joints the gesture moves directly — a link drag's own joints. */
  moves?: ReadonlyMap<string, Point>;
  /** Cylinders whose pose the gesture prescribes outright. */
  poses?: { cylinder: Cylinder; pose: CylinderPose }[];
}

export interface EditContext {
  cylinders: Cylinder[];
  snapshot: PoseSnapshot;
  /** A carried ram's own layout, from where its two mounts have been put. */
  layoutFor: (cylinder: Cylinder, barrelFar: Point, rodFar: Point) => CylinderPose | undefined;
  /** How far two answers for one point may differ and still be one answer. */
  tolerance: number;
  /** Joints a Lock holds still. */
  frozen?: (id: string) => boolean;
}

/** Take the positions a plan will be measured against. */
export function snapshotOf(joints: Joint[]): PoseSnapshot {
  return new Map(joints.map((joint) => [joint.id, { x: joint.x, y: joint.y }]));
}

export function rigidBetween(pivot: Point, aim: Point, to: Point, aimTo: Point): Rigid | undefined {
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
export function jointsOfBody(root: Link): Joint[] {
  const found = new Map<string, Joint>();
  const walk = (node: Link) => {
    node.joints.forEach((joint) => found.set(joint.id, joint));
    if (node instanceof RealLink) node.subset.forEach(walk);
  };
  walk(root);
  return [...found.values()];
}

/** The bars inside a body, so a caller can rebuild exactly what it carried. */
export function leavesOfBody(root: Link): Link[] {
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
    (request.poses ?? []).map(({ cylinder, pose }) => [cylinder.pin.id, pose])
  );
  const carried = new Map<string, CarriedLeaf>();
  const reshaped = new Map<string, Link>();
  const reshapedRams = new Set<string>();
  const affectedRoots = new Map<string, Link>();
  let unreachable: Cylinder | undefined;
  let fused: Cylinder | undefined;
  let denied: string | undefined;

  const at = (id: string): Point | undefined => context.snapshot.get(id);
  const now = (id: string): Point | undefined => placements.get(id) ?? at(id);
  const near = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) <= context.tolerance;

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

  // Every joint the plan can reach, so a block partner can be found by id.
  const jointById = new Map<string, Joint>();
  for (const cylinder of context.cylinders) {
    for (const root of [cylinder.barrelRoot, cylinder.rodRoot]) {
      jointsOfBody(root).forEach((joint) => jointById.set(joint.id, joint));
    }
    [
      cylinder.barrelFar,
      cylinder.barrelNear,
      cylinder.pin,
      cylinder.rodFar,
      cylinder.slider,
    ].forEach((joint) => jointById.set(joint.id, joint));
  }

  /** Which rams hang off each mount, so a moved joint knows who to wake. */
  const ramsAtMount = new Map<string, Cylinder[]>();
  for (const cylinder of context.cylinders) {
    for (const mount of [cylinder.barrelFar, cylinder.rodFar]) {
      const list = ramsAtMount.get(mount.id) ?? [];
      list.push(cylinder);
      ramsAtMount.set(mount.id, list);
    }
  }

  /**
   * A block is zero-length, so its two joints are one point — including a
   * block bolted to a *mount*, which belongs to no cylinder body and would
   * otherwise be left behind. A grounded one cannot be repaired afterwards by
   * the floating-slider reseat, so it has to be in the plan.
   */
  const settleBlocks = (): string[] => {
    const changed: string[] = [];
    for (const [id, to] of [...placements]) {
      const joint = jointById.get(id);
      if (!(joint instanceof RealJoint)) continue;
      for (const link of joint.links) {
        if (!(link instanceof SliderBlock)) continue;
        for (const partner of link.joints) {
          if (partner.id === id) continue;
          if (put(partner.id, { x: to.x, y: to.y })) changed.push(partner.id);
        }
      }
    }
    return changed;
  };

  /** Lay out one ram and carry its two bodies. Returns the ids that moved. */
  const settle = (cylinder: Cylinder): string[] => {
    const changed: string[] = [];
    const askedFor = prescribed.get(cylinder.pin.id);

    const wasBarrelFar = at(cylinder.barrelFar.id);
    const wasBarrelNear = at(cylinder.barrelNear.id);
    const wasRodFar = at(cylinder.rodFar.id);
    const wasPin = at(cylinder.pin.id);
    if (!wasBarrelFar || !wasBarrelNear || !wasRodFar || !wasPin) return changed;

    const pose =
      askedFor ??
      context.layoutFor(cylinder, now(cylinder.barrelFar.id)!, now(cylinder.rodFar.id)!);
    if (!pose) {
      unreachable = cylinder;
      return changed;
    }

    // A ram whose two mounts are on one body can be moved, but it cannot
    // extend: the distance between its mounts is a distance between two points
    // of something rigid. Only against a pose that was *asked for* -- a ram
    // reached through the closure may be looking at one mount that has moved
    // and one that has not yet, and that intermediate span means nothing. The
    // final check below is what judges those.
    if (askedFor && cylinder.barrelRoot.id === cylinder.rodRoot.id) {
      const was = Math.hypot(wasRodFar.x - wasBarrelFar.x, wasRodFar.y - wasBarrelFar.y);
      const asked = Math.hypot(pose.rodFar.x - pose.barrelFar.x, pose.rodFar.y - pose.barrelFar.y);
      if (Math.abs(was - asked) > context.tolerance) {
        fused = cylinder;
        return changed;
      }
    }

    const interior = new Set([cylinder.barrelNear.id, cylinder.pin.id, cylinder.slider.id]);
    const sides: [Link, Rigid | undefined, Joint, Point][] = [
      [
        cylinder.barrelRoot,
        rigidBetween(wasBarrelFar, wasBarrelNear, pose.barrelFar, pose.barrelNear),
        cylinder.barrelFar,
        pose.barrelFar,
      ],
      [
        cylinder.rodRoot,
        rigidBetween(wasRodFar, wasPin, pose.rodFar, pose.pin),
        cylinder.rodFar,
        pose.rodFar,
      ],
    ];

    for (const [root, move, mount, to] of sides) {
      affectedRoots.set(root.id, root);
      if (!move) {
        if (put(mount.id, to)) changed.push(mount.id);
        continue;
      }
      for (const leaf of leavesOfBody(root)) carried.set(leaf.id, { leaf, move });
      for (const joint of jointsOfBody(root)) {
        if (interior.has(joint.id)) continue;
        const was = at(joint.id);
        if (was && put(joint.id, carryPoint(move, was))) changed.push(joint.id);
      }
    }

    // The interior is where the extension puts it, not where either body's
    // rigid motion would carry it. The two agree while a ram merely moves and
    // part company the moment it changes length.
    if (put(cylinder.barrelNear.id, pose.barrelNear)) changed.push(cylinder.barrelNear.id);
    if (put(cylinder.pin.id, pose.pin)) changed.push(cylinder.pin.id);
    if (put(cylinder.slider.id, pose.pin)) changed.push(cylinder.slider.id);

    // The ram's own two bars are the only ones this edit may reshape, and only
    // when it actually changes one of their lengths. Both are asked, because a
    // repair straightens a bent *rod* while leaving the barrel alone.
    const span = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
    const barrelChanged =
      Math.abs(span(wasBarrelFar, wasBarrelNear) - span(pose.barrelFar, pose.barrelNear)) >
      context.tolerance;
    const rodChanged =
      Math.abs(span(wasPin, wasRodFar) - span(pose.pin, pose.rodFar)) > context.tolerance;
    if (barrelChanged || rodChanged) {
      reshaped.set(cylinder.barrel.id, cylinder.barrel);
      reshaped.set(cylinder.rod.id, cylinder.rod);
      reshapedRams.add(cylinder.pin.id);
      carried.delete(cylinder.barrel.id);
      carried.delete(cylinder.rod.id);
    }
    return changed;
  };

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
    if (waiting.has(cylinder.pin.id)) return;
    waiting.add(cylinder.pin.id);
    queue.push(cylinder);
  };
  (request.poses ?? []).forEach(({ cylinder }) => wake(cylinder));
  for (const id of placements.keys()) (ramsAtMount.get(id) ?? []).forEach(wake);
  settleBlocks().forEach((id) => (ramsAtMount.get(id) ?? []).forEach(wake));

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
          long: 'The parts here cannot all be where this edit would put them.',
        },
      };
    }
    const cylinder = queue.shift()!;
    waiting.delete(cylinder.pin.id);
    const moved = settle(cylinder);
    if (fused) {
      return {
        ok: false,
        refusal: {
          code: 'cylinder.both-ends-fused',
          short: 'both ends are fused',
          long: `Both mounts of ${fused.barrel.id} are welded into one body, so it has nothing to extend against. Unweld one of them, or move the body without stretching the ram.`,
        },
      };
    }
    if (unreachable) {
      return {
        ok: false,
        refusal: {
          code: 'cylinder.carried-too-far',
          short: 'a ram cannot follow',
          long: `Moving this would stretch ${unreachable.barrel.id} past what it can reach.`,
        },
      };
    }
    [...moved, ...settleBlocks()].forEach((id) => (ramsAtMount.get(id) ?? []).forEach(wake));
  }

  // --- what the settled drawing has to satisfy ------------------------------

  if (denied) {
    return {
      ok: false,
      refusal: {
        code: 'cylinder.pose-conflict',
        short: 'parts disagree',
        long: `This would need joint ${denied} in two places at once: where the drag puts it, and where a cylinder attached to it needs it.`,
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
          long: `Moving this would move joint ${id}, which is locked. Unlock it first.`,
        },
      };
    }
  }

  // A ram's interior is derived from its mounts every time it is laid out, so
  // it is exempt from the body check — but only for the rams this edit
  // actually resized or repaired. Exempting every cylinder's interior always
  // was broader than the rule it stands for, and would have hidden a genuine
  // deformation of a ram that merely moved.
  const exempt = new Set(
    context.cylinders
      .filter((one) => reshapedRams.has(one.pin.id))
      .flatMap((one) => [one.barrelNear.id, one.pin.id, one.slider.id])
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
 * A ram whose own bars this edit resized has its interior left out — those
 * three joints are derived from its mounts rather than carried with them.
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
    return shapeRefusal(root);
  }
  for (const point of points) {
    if (wrong(carryPoint(move, point.was), point.to)) return shapeRefusal(root);
  }
  return undefined;
}

function shapeRefusal(root: Link): PosePlanRefusal {
  return {
    code: 'cylinder.both-ends-fused',
    short: 'it cannot change shape',
    long: `This edit would change the shape of ${root.id}, which is one rigid body. A cylinder with both mounts welded into one body has nothing to extend against — unweld one of them.`,
  };
}
