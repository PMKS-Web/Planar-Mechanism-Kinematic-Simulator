/**
 * One paint order for every cylinder in the drawing (decision S24).
 *
 * A cylinder's skin is a stack — barrel, black head, rod — and the stack is the
 * whole reading: the rod drawn over the head at 0.7 alpha is what makes the
 * head show as a darker band, and that band is how much rod is still in the
 * bore. Painted per cylinder that stack held only while no two cylinders shared
 * a body. Weld two rods to one bar and that one body is painted once, in the
 * first cylinder's stack — which leaves the second cylinder's head painted
 * *after* it, bare black, and the second cylinder's barrel over its own rod.
 *
 * So the order is a property of the drawing rather than of a part. Each thing
 * that gets painted once is a unit: a cylinder's own pieces (its head, and
 * whichever members nothing else has swallowed), and each fused body or weld
 * plate. Per cylinder the constraint is
 *
 *     whatever paints its barrel  <  its head  <  whatever paints its rod
 *
 * and an own member is inside the cylinder's own unit, where both hold by
 * construction. What is left is one edge per *fused* member: the body before
 * the head for a barrel, the head before the body for a rod. Sorted so every
 * edge holds, every cylinder gets the same picture however they are welded
 * together — two rods in one body puts that body after both heads, two barrels
 * in one bracket puts it before both, and a chain gives head 1, the shared
 * body, head 2.
 *
 * **The constraints can contradict each other**, and then something has to
 * give: body X holds rod 1 and barrel 2 while body Y holds rod 2 and barrel 1,
 * or — the everyday case — one body holds both members of the same cylinder.
 * The cycle is broken at a **barrel** edge and never at a rod one, which is the
 * judgment `fusedBodiesOf` used to make on its own for a body holding both: a
 * barrel painted over its head leaves the head plainly visible through the
 * body's own alpha, which is a cue dimmed, while a rod painted under one is a
 * cue deleted. A cycle alternates cylinders and bodies, so it always has a
 * barrel edge to break.
 *
 * Deterministic throughout, and not by input order: the ready set is taken
 * smallest key first and a cycle is broken at its smallest barrel edge, so the
 * same drawing gives the same DOM order every render whatever order the marks
 * arrive in. Angular's `@for` tracking and every hit test depend on that.
 */

import { Cylinder } from './cylinder';
import { CylinderRole, memberIsWelded } from './cylinder-skin';
import { Link } from './link';

/** As much of a drawn cylinder as the layering question needs. */
export interface FusingSkin {
  /** The mark's own key, which is the seal's id. */
  id: string;
  cylinder: Cylinder;
}

/** As much of a Slide's weld plate as the same question needs. */
export interface FusingPlate {
  /** The sliding joint the plate belongs to. */
  id: string;
  /** The bodies it has fused with the block, and therefore stands in for. */
  links: readonly Link[];
}

/** One drawn body, and the members whose own region still selects the member. */
export interface FusedBody<M extends FusingSkin, P extends FusingPlate = FusingPlate> {
  body: Link;
  /**
   * The Slide whose plate draws that body and the black block as one outline,
   * when the body rides one. What is painted then is the plate, not the body:
   * the two are one shape and a plate is the bigger of them.
   */
  plate?: P;
  members: { mark: M; role: CylinderRole }[];
}

/**
 * One thing the skin layer paints, in the order it paints them.
 *
 * Exactly one of the two is set. `mark` is a cylinder's own pieces — its head,
 * and each member nothing bigger has swallowed — and `fused` is a body or plate
 * that stands in for one or more members. Two optional fields rather than a
 * tagged union because the template reads it with `@if (step.mark; as cyl)`.
 */
export interface PaintStep<M extends FusingSkin, P extends FusingPlate = FusingPlate> {
  key: string;
  mark?: M;
  fused?: FusedBody<M, P>;
}

const ROLES = ['barrel', 'rod'] as const;

/** Which shape stands in for a member, or nothing when it draws itself. */
function unitOf<P extends FusingPlate>(
  cylinder: Cylinder,
  role: CylinderRole,
  plates: readonly P[]
): { key: string; body: Link; plate?: P } | undefined {
  const body = role === 'barrel' ? cylinder.barrelRoot : cylinder.rodRoot;
  const plate = plates.find((held) => held.links.some((link) => link.id === body.id));
  if (!plate && !memberIsWelded(cylinder, role)) return undefined;
  return { key: plate ? `plate:${plate.id}` : `body:${body.id}`, body, plate };
}

/**
 * Everything the skin layer paints, deepest first.
 *
 * Both lists are asked because both can hold a member: a bracket welded to a
 * mount, and the weld plate of a Slide the member's end joint is (decision
 * S18).
 */
export function cylinderPaintOrder<M extends FusingSkin, P extends FusingPlate>(
  marks: readonly M[],
  plates: readonly P[] = []
): PaintStep<M, P>[] {
  const units = new Map<string, FusedBody<M, P>>();
  /** from -> to, with `from` a unit for a barrel and a cylinder for a rod. */
  const edges: { from: string; to: string }[] = [];
  const cylinderKey = (mark: M) => `cylinder:${mark.id}`;

  for (const mark of marks) {
    for (const role of ROLES) {
      const unit = unitOf(mark.cylinder, role, plates);
      if (!unit) continue;
      const held = units.get(unit.key) ?? { body: unit.body, plate: unit.plate, members: [] };
      // A plate can stand in for two bodies at once, and only one of them can
      // carry the outline's id. The smaller id, so the choice does not depend
      // on which cylinder was drawn first.
      if (unit.body.id < held.body.id) held.body = unit.body;
      held.members.push({ mark, role });
      units.set(unit.key, held);
      edges.push(
        role === 'barrel'
          ? { from: unit.key, to: cylinderKey(mark) }
          : { from: cylinderKey(mark), to: unit.key }
      );
    }
  }

  const keys = [...marks.map(cylinderKey), ...units.keys()].sort();
  const marksByKey = new Map(marks.map((mark) => [cylinderKey(mark), mark]));
  return sortedKeys(keys, edges).map((key) => {
    const mark = marksByKey.get(key);
    return mark ? { key, mark } : { key, fused: units.get(key)! };
  });
}

/**
 * The nodes in an order every edge holds in, breaking cycles at barrel edges.
 *
 * Kahn's algorithm, taking the smallest ready key each time rather than the
 * first one found, so the answer is a function of the graph and not of how it
 * was walked. When nothing is ready the rest of the graph is a cycle: it is
 * found, its smallest barrel edge is dropped, and the whole sort is run again.
 * The graphs here have one node per cylinder and one per fused body, so a
 * restart costs nothing worth saving.
 */
function sortedKeys(keys: string[], edges: { from: string; to: string }[]): string[] {
  let live = edges;
  // One pass per constraint that can be given up, and never more: this runs
  // inside a render, so it answers with something drawable rather than looping
  // if a cycle ever fails to shrink.
  for (let attempt = 0; attempt <= edges.length; attempt++) {
    const successors = new Map(keys.map((key) => [key, [] as string[]]));
    const indegree = new Map(keys.map((key) => [key, 0]));
    for (const edge of live) {
      successors.get(edge.from)!.push(edge.to);
      indegree.set(edge.to, indegree.get(edge.to)! + 1);
    }
    for (const list of successors.values()) list.sort();

    const order: string[] = [];
    const ready = keys.filter((key) => indegree.get(key) === 0);
    while (ready.length > 0) {
      ready.sort();
      const key = ready.shift()!;
      order.push(key);
      for (const next of successors.get(key)!) {
        const left = indegree.get(next)! - 1;
        indegree.set(next, left);
        if (left === 0) ready.push(next);
      }
    }
    if (order.length === keys.length) return order;

    const stuck = keys.filter((key) => !order.includes(key));
    const cycle = cycleAmong(stuck, successors);
    // A cycle alternates cylinders and bodies, so it always holds a barrel
    // edge -- the one that can be dropped for a cue dimmed rather than deleted.
    const broken = barrelEdgeIn(cycle);
    live = live.filter((edge) => !(edge.from === broken.from && edge.to === broken.to));
  }
  // Every constraint given up and still not sorted, which the argument above
  // says cannot happen. Everything is drawn anyway, in a stable order.
  return [...keys].sort();
}

/** A cycle among these nodes, as the run of keys around it. */
function cycleAmong(nodes: string[], successors: Map<string, string[]>): string[] {
  const seen = new Map<string, 'open' | 'done'>();
  const path: string[] = [];
  const walk = (node: string): string[] | undefined => {
    const state = seen.get(node);
    if (state === 'done') return undefined;
    if (state === 'open') return path.slice(path.indexOf(node));
    seen.set(node, 'open');
    path.push(node);
    for (const next of successors.get(node) ?? []) {
      if (!nodes.includes(next)) continue;
      const found = walk(next);
      if (found) return found;
    }
    path.pop();
    seen.set(node, 'done');
    return undefined;
  };
  for (const node of [...nodes].sort()) {
    const found = walk(node);
    if (found) return found;
  }
  // Unreachable: Kahn only stalls on a cycle. Answered rather than thrown, so
  // a drawing is never lost to a layering question.
  return [...nodes].sort().slice(0, 1);
}

/**
 * The barrel edge of a cycle to give up, which is the one leaving a body.
 *
 * Smallest first, so which constraint is dropped is a property of the drawing
 * rather than of where the walk happened to enter the cycle.
 */
function barrelEdgeIn(cycle: string[]): { from: string; to: string } {
  const around = cycle.map((key, index) => ({ from: key, to: cycle[(index + 1) % cycle.length] }));
  const barrels = around.filter((edge) => !edge.from.startsWith('cylinder:'));
  return (barrels.length > 0 ? barrels : around).sort((a, b) =>
    `${a.from}|${a.to}`.localeCompare(`${b.from}|${b.to}`)
  )[0];
}

/**
 * Whether anything bigger stands in for this member, whichever step paints it.
 *
 * The question the skin asks before painting a member on its own: a member
 * another step is drawing inside a bracket or a plate must not also be painted
 * here, or the part comes out twice over itself at 0.7 alpha.
 */
export function memberIsFused<M extends FusingSkin, P extends FusingPlate>(
  steps: readonly PaintStep<M, P>[],
  mark: M,
  role: CylinderRole
): boolean {
  if (memberIsWelded(mark.cylinder, role)) return true;
  for (const step of steps) {
    const held = step.fused?.members.some((one) => one.mark.id === mark.id && one.role === role);
    if (held) return true;
  }
  return false;
}
