/**
 * Where every joint ends up when one cylinder is re-posed.
 *
 * Posing a ram used to mean writing its own five coordinates. That is right
 * only while those five are the whole of what moves — which was true exactly
 * as long as a mount could not be welded to anything. Weld a bracket to a
 * mount and the bracket is rigid with the barrel: moving the bar and not the
 * bracket does not deform the body, it *tears* it, and the rebuild that
 * follows reads the wreckage as a link that changed shape.
 *
 * So a pose is planned before it is written. The plan is a pure function of a
 * snapshot: it carries each side's whole owning body through the rigid motion
 * that side's mount made, follows that through to any other cylinder the
 * motion reaches, and either returns every placement at once or refuses and
 * leaves the drawing alone. Nothing here touches a Joint; the caller commits.
 *
 * The two transforms are the whole idea. Each side of a ram is rigid about its
 * own mount, so:
 *
 *     barrel side: pivot at barrelFar, aligned by barrelFar -> barrelNear
 *     rod side:    pivot at rodFar,    aligned by rodFar    -> pin
 *     a carried point q goes to  mount' + R * (q - mount)
 *
 * They are deliberately separate. A ram extends, so the two sides are *not*
 * one body, and a root that contains both of them is a drawing that cannot
 * extend at all — which this refuses rather than quietly resizing.
 */

import { Cylinder, CylinderPose, cylinderJoints } from './cylinder';
import { Joint } from './joint';
import { Link, RealLink } from './link';

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

export interface CylinderPosePlan {
  /** Every joint that moves, by id, and where it goes. */
  placements: Map<string, Point>;
  /** The bodies carried whole, and the member bars inside them. */
  affectedRoots: Link[];
  affectedLeaves: Link[];
  movedIds: Set<string>;
}

export type PosePlanResult =
  { ok: true; plan: CylinderPosePlan } | { ok: false; refusal: PosePlanRefusal };

/** Take the positions a plan will be measured against. */
export function snapshotOf(joints: Joint[]): PoseSnapshot {
  return new Map(joints.map((joint) => [joint.id, { x: joint.x, y: joint.y }]));
}

/** A rigid motion: rotate about `pivot`, then land the pivot on `to`. */
interface Rigid {
  pivot: Point;
  to: Point;
  cos: number;
  sin: number;
}

function rigidBetween(pivot: Point, aim: Point, to: Point, aimTo: Point): Rigid | undefined {
  const was = Math.atan2(aim.y - pivot.y, aim.x - pivot.x);
  const now = Math.atan2(aimTo.y - to.y, aimTo.x - to.x);
  if (
    Math.hypot(aim.x - pivot.x, aim.y - pivot.y) < 1e-9 ||
    Math.hypot(aimTo.x - to.x, aimTo.y - to.y) < 1e-9
  ) {
    return undefined;
  }
  const turn = now - was;
  return { pivot, to, cos: Math.cos(turn), sin: Math.sin(turn) };
}

function carry(move: Rigid, point: Point): Point {
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
 * Plan the pose of one cylinder, and of everything that pose reaches.
 *
 * `layoutFor` re-lays a *dependent* cylinder from its two proposed mounts: a
 * ram whose mount is welded to a body this edit is moving has to keep its own
 * length while its ends are carried, which is a different question from the
 * one the caller asked and only the caller knows how to answer.
 */
export function planCylinderPose(
  request: { cylinder: Cylinder; pose: CylinderPose },
  context: {
    cylinders: Cylinder[];
    snapshot: PoseSnapshot;
    /** A dependent ram's own layout, from where its mounts have been put. */
    layoutFor: (cylinder: Cylinder, barrelFar: Point, rodFar: Point) => CylinderPose | undefined;
    /** How far apart two proposals for one joint may be and still agree. */
    tolerance: number;
    /** Joints a Lock holds still. A carried one refuses the whole edit. */
    frozen?: (id: string) => boolean;
  }
): PosePlanResult {
  const placements = new Map<string, Point>();
  const affectedRoots = new Map<string, Link>();
  const affectedLeaves = new Map<string, Link>();
  const posed = new Set<string>();

  const at = (id: string): Point | undefined => context.snapshot.get(id);

  let conflict: PosePlanRefusal | undefined;
  const place = (joint: Joint, to: Point): void => {
    const standing = placements.get(joint.id);
    if (standing) {
      // Two sides of the closure reaching one joint is fine when they agree —
      // a chain that comes back on itself closes. Disagreeing is a drawing
      // whose parts cannot all be where this edit wants them, and the honest
      // answer is to move nothing.
      if (Math.hypot(standing.x - to.x, standing.y - to.y) > context.tolerance) {
        conflict ??= {
          code: 'cylinder.pose-conflict',
          short: 'parts disagree',
          long: `Moving this would ask joint ${joint.name || joint.id} to be in two places at once. Something else here is holding it.`,
        };
      }
      return;
    }
    if (context.frozen?.(joint.id)) {
      conflict ??= {
        code: 'cylinder.pose-locked',
        short: 'a lock holds it',
        long: `Moving this would move joint ${joint.name || joint.id}, which is locked. Unlock it first.`,
      };
      return;
    }
    placements.set(joint.id, to);
  };

  /**
   * Carry one side's whole body, and note the bodies it belongs to.
   *
   * `interior` is left out on purpose. A ram's buried end, its pin and its
   * slider are not rigid with either side in the way a bracket is — they are
   * where the *extension* puts them, and the pose is the only thing that knows
   * that. Carrying them as part of the body and then placing them from the
   * pose is two answers to one question, and they part company the moment the
   * ram changes length rather than merely moving.
   */
  const carrySide = (
    root: Link,
    move: Rigid | undefined,
    mount: Joint,
    to: Point,
    interior: Set<string>
  ): void => {
    affectedRoots.set(root.id, root);
    leavesOfBody(root).forEach((leaf) => affectedLeaves.set(leaf.id, leaf));
    if (!move) {
      // Degenerate frame: the mount still goes where it was asked, and nothing
      // is carried on a rotation that is not defined.
      place(mount, to);
      return;
    }
    jointsOfBody(root).forEach((joint) => {
      if (interior.has(joint.id)) return;
      const was = at(joint.id);
      if (was) place(joint, carry(move, was));
    });
  };

  const queue: { cylinder: Cylinder; pose: CylinderPose }[] = [request];

  while (queue.length > 0 && !conflict) {
    const { cylinder, pose } = queue.shift()!;
    if (posed.has(cylinder.pin.id)) continue;
    posed.add(cylinder.pin.id);

    const wasBarrelFar = at(cylinder.barrelFar.id);
    const wasBarrelNear = at(cylinder.barrelNear.id);
    const wasRodFar = at(cylinder.rodFar.id);
    const wasPin = at(cylinder.pin.id);
    if (!wasBarrelFar || !wasBarrelNear || !wasRodFar || !wasPin) continue;

    // A body holding both sides cannot extend, so there is no pose to plan:
    // the two rigid prescriptions contradict each other, and a ram does not
    // gain a freedom because the editor knows how to resize one.
    if (cylinder.barrelRoot.id === cylinder.rodRoot.id) {
      return {
        ok: false,
        refusal: {
          code: 'cylinder.both-ends-fused',
          short: 'both ends are fused',
          long: 'Both ends of this cylinder are welded into one body, so it has nothing to extend against. Unweld one of its mounts.',
        },
      };
    }

    const interior = new Set([cylinder.barrelNear.id, cylinder.pin.id, cylinder.slider.id]);
    carrySide(
      cylinder.barrelRoot,
      rigidBetween(wasBarrelFar, wasBarrelNear, pose.barrelFar, pose.barrelNear),
      cylinder.barrelFar,
      pose.barrelFar,
      interior
    );
    carrySide(
      cylinder.rodRoot,
      rigidBetween(wasRodFar, wasPin, pose.rodFar, pose.pin),
      cylinder.rodFar,
      pose.rodFar,
      interior
    );
    // The interior belongs to neither body's rigid motion: it is where the
    // requested extension puts it, and the slider rides the pin.
    place(cylinder.barrelNear, pose.barrelNear);
    place(cylinder.pin, pose.pin);
    place(cylinder.slider, pose.pin);

    if (conflict) break;

    // Anything else this motion has taken hold of. A ram whose mount rides a
    // body we just moved has to be re-laid from both of its ends, which may
    // move a further one — so the closure runs until nothing new appears
    // rather than one level deep, which is as far as it used to reach.
    for (const other of context.cylinders) {
      if (posed.has(other.pin.id)) continue;
      const barrelTo = placements.get(other.barrelFar.id);
      const rodTo = placements.get(other.rodFar.id);
      if (!barrelTo && !rodTo) continue;
      const barrelAt = barrelTo ?? at(other.barrelFar.id);
      const rodAt = rodTo ?? at(other.rodFar.id);
      if (!barrelAt || !rodAt) continue;
      const layout = context.layoutFor(other, barrelAt, rodAt);
      if (!layout) {
        return {
          ok: false,
          refusal: {
            code: 'cylinder.carried-too-far',
            short: 'a ram cannot follow',
            long: 'Moving this would stretch another cylinder past what it can reach.',
          },
        };
      }
      // Its mounts are already placed by whatever carried them; the layout is
      // only being asked where its interior and its other end go.
      queue.push({ cylinder: other, pose: layout });
    }
  }

  if (conflict) return { ok: false, refusal: conflict };
  return {
    ok: true,
    plan: {
      placements,
      affectedRoots: [...affectedRoots.values()],
      affectedLeaves: [...affectedLeaves.values()],
      movedIds: new Set(placements.keys()),
    },
  };
}

/** Every joint a cylinder's plan is entitled to write, for a caller's check. */
export function cylinderOwnJointIds(cylinder: Cylinder): Set<string> {
  return new Set(cylinderJoints(cylinder).map((joint) => joint.id));
}
