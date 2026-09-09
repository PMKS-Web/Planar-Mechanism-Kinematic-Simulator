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
  const prescribed = new Map<string, CylinderPose>(
    (request.poses ?? []).map(({ cylinder, pose }) => [cylinder.pin.id, pose])
  );
  const carried = new Map<string, CarriedLeaf>();
  const reshaped = new Map<string, Link>();
  const affectedRoots = new Map<string, Link>();
  let unreachable: Cylinder | undefined;
  let fused: Cylinder | undefined;

  /**
   * A ram's buried end, pin and slider are *derived* from its mounts rather
   * than preserved: that is what makes the part a cylinder and not a bar. So
   * they are exempt from the rigidity check below, which would otherwise read
   * the repair of a bent ram as a body changing shape and refuse to straighten
   * it. The mounts stay in the check, because a bracket is rigid to them.
   */
  const derived = new Set(
    context.cylinders.flatMap((one) => [one.barrelNear.id, one.pin.id, one.slider.id])
  );

  const at = (id: string): Point | undefined => context.snapshot.get(id);
  const now = (id: string): Point | undefined => placements.get(id) ?? at(id);
  const near = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) <= context.tolerance;

  const put = (id: string, to: Point): boolean => {
    const standing = placements.get(id);
    if (standing && near(standing, to)) return false;
    placements.set(id, to);
    return true;
  };

  /**
   * A block is zero-length, so its two joints are one point — including a
   * block bolted to a *mount*, which belongs to no cylinder body and would
   * otherwise be left behind. A grounded one cannot be repaired afterwards
   * by the floating-slider reseat, so it has to be in the plan.
   */
  const settleBlocks = (): boolean => {
    let changed = false;
    for (const [id, to] of [...placements]) {
      const joint = jointById.get(id);
      if (!(joint instanceof RealJoint)) continue;
      for (const link of joint.links) {
        if (!(link instanceof SliderBlock)) continue;
        for (const partner of link.joints) {
          if (partner.id === id) continue;
          if (put(partner.id, { x: to.x, y: to.y })) changed = true;
        }
      }
    }
    return changed;
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

  /** One pass over every cylinder the edit has taken hold of. */
  const relax = (): boolean => {
    let changed = false;

    for (const cylinder of context.cylinders) {
      const askedFor = prescribed.get(cylinder.pin.id);
      const reached = placements.has(cylinder.barrelFar.id) || placements.has(cylinder.rodFar.id);
      if (!askedFor && !reached) continue;

      const wasBarrelFar = at(cylinder.barrelFar.id);
      const wasBarrelNear = at(cylinder.barrelNear.id);
      const wasRodFar = at(cylinder.rodFar.id);
      const wasPin = at(cylinder.pin.id);
      if (!wasBarrelFar || !wasBarrelNear || !wasRodFar || !wasPin) continue;

      // A prescribed pose is the gesture's own answer. A carried one is
      // recomputed from wherever its mounts have got to *this* round, which is
      // the whole reason for looping: a ram's second mount may be placed by
      // some other ram after its first one was already read.
      const pose =
        askedFor ??
        context.layoutFor(cylinder, now(cylinder.barrelFar.id)!, now(cylinder.rodFar.id)!);
      if (!pose) {
        unreachable = cylinder;
        return false;
      }

      // A ram whose two mounts are on one body can be moved, but it cannot
      // extend: the distance between its mounts is a distance between two
      // points of something rigid. Caught here, against the pose that was
      // asked for, so the reader is told which of the two it is rather than
      // being handed whatever the relaxation happened to settle on.
      if (cylinder.barrelRoot.id === cylinder.rodRoot.id) {
        const was = Math.hypot(wasRodFar.x - wasBarrelFar.x, wasRodFar.y - wasBarrelFar.y);
        const asked = Math.hypot(
          pose.rodFar.x - pose.barrelFar.x,
          pose.rodFar.y - pose.barrelFar.y
        );
        if (Math.abs(was - asked) > context.tolerance) {
          fused = cylinder;
          return false;
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
          if (put(mount.id, to)) changed = true;
          continue;
        }
        for (const leaf of leavesOfBody(root)) carried.set(leaf.id, { leaf, move });
        for (const joint of jointsOfBody(root)) {
          if (interior.has(joint.id)) continue;
          const was = at(joint.id);
          if (was && put(joint.id, carryPoint(move, was))) changed = true;
        }
      }

      // The interior is where the extension puts it, not where either body's
      // rigid motion would carry it. The two agree while a ram merely moves
      // and part company the moment it changes length.
      if (put(cylinder.barrelNear.id, pose.barrelNear)) changed = true;
      if (put(cylinder.pin.id, pose.pin)) changed = true;
      if (put(cylinder.slider.id, pose.pin)) changed = true;

      // The ram's own two bars are the only ones this edit may reshape, and
      // only when it actually changes their length.
      const wasLength = Math.hypot(
        wasBarrelNear.x - wasBarrelFar.x,
        wasBarrelNear.y - wasBarrelFar.y
      );
      const nowLength = Math.hypot(
        pose.barrelNear.x - pose.barrelFar.x,
        pose.barrelNear.y - pose.barrelFar.y
      );
      if (Math.abs(wasLength - nowLength) > context.tolerance) {
        reshaped.set(cylinder.barrel.id, cylinder.barrel);
        reshaped.set(cylinder.rod.id, cylinder.rod);
        carried.delete(cylinder.barrel.id);
        carried.delete(cylinder.rod.id);
      }
    }
    return changed;
  };

  // Settle. The cap guards against a drawing that oscillates instead of
  // converging; one that hits it is refused below rather than accepted late.
  const ROUNDS = 24;
  let round = 0;
  for (; round < ROUNDS; round++) {
    const moved = relax();
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
    const blocks = settleBlocks();
    if (!moved && !blocks) break;
  }
  // A plan that never settles is refused -- but say *why* where the drawing
  // can tell us. Two sides of one rigid body pulling against each other is
  // what oscillates here, and "this body cannot change shape" is a sentence a
  // reader can act on where "the parts disagree" is not.
  const settled = round < ROUNDS;
  if (!settled) {
    for (const root of affectedRoots.values()) {
      const refusal = rigidityRefusal(root, context, placements, derived);
      if (refusal) return { ok: false, refusal };
    }
    return {
      ok: false,
      refusal: {
        code: 'cylinder.pose-conflict',
        short: 'parts disagree',
        long: 'The parts here cannot all be where this edit would put them.',
      },
    };
  }

  // --- what the settled drawing has to satisfy ------------------------------

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

  for (const root of affectedRoots.values()) {
    const refusal = rigidityRefusal(root, context, placements, derived);
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
 * Whether a body the edit moved is still the shape it was.
 *
 * Judged on the settled result rather than argued about while it is being
 * built. A ram whose two ends are welded into one body is what this catches,
 * and catches *correctly*: translating it keeps every distance and is allowed,
 * while extending it does not, because the extension is exactly a change in
 * the distance between two points of something rigid.
 *
 * A ram's own interior is left out: those three joints are derived from its
 * mounts every time it is laid out, so they are the one thing here entitled to
 * move relative to the body they sit on.
 */
function rigidityRefusal(
  root: Link,
  context: EditContext,
  placements: Map<string, Point>,
  derived: Set<string>
): PosePlanRefusal | undefined {
  const points = jointsOfBody(root)
    .filter((joint) => !derived.has(joint.id))
    .map((joint) => ({
      was: context.snapshot.get(joint.id),
      to: placements.get(joint.id) ?? context.snapshot.get(joint.id),
    }))
    .filter((pair): pair is { was: Point; to: Point } => !!pair.was && !!pair.to);

  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const before = Math.hypot(
        points[i].was.x - points[j].was.x,
        points[i].was.y - points[j].was.y
      );
      const after = Math.hypot(points[i].to.x - points[j].to.x, points[i].to.y - points[j].to.y);
      if (Math.abs(before - after) > Math.max(context.tolerance, before * 1e-6)) {
        return {
          code: 'cylinder.both-ends-fused',
          short: 'it cannot change shape',
          long: `This edit would change the shape of ${root.id}, which is one rigid body. A cylinder with both mounts welded into one body has nothing to extend against — unweld one of them.`,
        };
      }
    }
  }
  return undefined;
}
