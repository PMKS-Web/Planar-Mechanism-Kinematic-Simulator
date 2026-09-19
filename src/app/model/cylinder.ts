/**
 * The atomic cylinder primitive.
 *
 * A cylinder used to be an inferred pattern — any Slide whose rod and barrel
 * happened to line up earned the skin, with a per-session picker to override
 * it. It is now a first-class, menu-created, permanent part: the prismatic
 * joint carries an `isSealed` bit that lives in the URL codec (so it survives
 * undo/redo, which replays URLs), and sealed ⇔ skinned, always.
 *
 * **The record is looked up from the seal, and nothing is measured to find a
 * role** (Stage 2 of `docs/joint-type-and-cylinder-plan.md`, decision S1). The
 * slot's own order is the answer: `slotJointA` is the mount the cylinder
 * rotates about and `slotJointB` is the inner end buried under the rod. A
 * geometric test used to stand here as well — collinear, opposite sides, equal
 * lengths — and it had to be forgiving enough to keep recognizing a part whose
 * geometry was momentarily wrong, which is the whole of what it could ever
 * have caught. Sealed is the answer now, at every moment, and the interior is
 * *derived* rather than checked (`derivedInterior`).
 */

import { Joint, PrisJoint } from './joint';
import { Link, RealLink } from './link';
import { slideAssemblyAt } from './slide-assembly';
import { CYLINDER } from './joint-marks';
import { SettingsService } from '../services/settings.service';

export interface Cylinder {
  /**
   * S — the sealed prismatic joint: the sliding seal, and the pin the rod
   * hangs on. The whole record is looked up from it and from nothing else.
   *
   * Two joints until Stage 1 made a slider one joint: a prismatic joint, a
   * coincident `RevJoint` carrying the weld that sealed them, and a zero-length
   * block joining the two. They were kept here under two names — `slider` and
   * `pin` — through Stage 1, because the sliding seal and the pin the rod hangs
   * on are the same joint but not the same idea. One name now, because one idea
   * won: the seal is what a cylinder is.
   */
  seal: PrisJoint;
  /** The carrier, drawn as the barrel. A leaf when welded into a compound. */
  barrel: Link;
  /** The rider, drawn as the rod. A leaf when welded into a compound. */
  rod: RealLink;
  /**
   * The top-level links the barrel and rod belong to — themselves when nothing
   * has swallowed them, and the compound when a mount is welded into a
   * neighbor.
   *
   * The pair is the whole of the difference between what the skin draws and
   * what an edit has to move. `barrel` and `rod` are the two-joint bars the
   * silhouette is composed from and the panel reports lengths for; the roots
   * are the rigid bodies a pose has to carry, so that welding a mount into a
   * bracket does not leave the bracket standing where the cylinder used to be.
   */
  barrelRoot: Link;
  rodRoot: RealLink;
  /** A — the barrel's outer end, the joint the cylinder rotates about. */
  mountA: Joint;
  /** B — the rod's outer end, the other attachment point. */
  mountB: Joint;
  /**
   * N — the barrel's inner end, buried where the rod overlaps the barrel.
   * Owned by the seal: no hitbox, no hover, no selection, and its position
   * derived rather than drawn.
   */
  inner: Joint;
  /**
   * Where in its own travel the seal stands, 0 (shut) to 1 (open).
   *
   * Read, not stored — a getter, because the record list is cached per
   * `cylinderRevision` and a drag moves joints without touching the topology.
   * A field would go stale the first time a mount moved, and it would go stale
   * silently, which is worse than being recomputed on every read of a number
   * this cheap.
   */
  readonly start: number;
}

/**
 * How far clear of the barrel's own mount the head sits when the ram is shut.
 *
 * The whole of the closed end. The head's back edge travels from here to the
 * barrel's mouth — at 0% it stands this far off the mount joint, so the two
 * never collide on screen, and at 100% it has come **entirely out of the
 * barrel** and rides the exposed rod. Those two ends are the stops, drawn
 * rather than annotated, which is why the barrel carries no notches.
 *
 * Everything else about the part follows from it and the stroke:
 *
 *     barrel = rod = stroke + CLEARANCE      (equal by construction)
 *     along  = CLEARANCE + headHalf + stroke × start   (pin, from the mount)
 *     span   = stroke × (1 + start) + LOCK
 *
 * `LOCK` is not a third constant; it falls out of barrel = rod, which is the
 * point of holding them equal. A cylinder is one size number and one position
 * number, and closed and open stop being free to disagree with the stroke —
 * there is no longer any such thing as an impossible cylinder, only one that is
 * too small.
 *
 * This used to be a *bore*: twice `MARK.slotInset + MARK.blockAlongHalf`, on
 * the reading that the head stays wholly inside the barrel and the slot keeps
 * its margin at each end. Both halves of that were wrong for a sealed part. The
 * barrel is a closed body and the drawing never shows a slot, so the inset
 * bought nothing; and a head that never leaves the barrel gives full extension
 * no silhouette of its own — closed and open differed only in how much rod was
 * outside. It also made the shortest ram the app could draw more than three
 * times longer than it needs to be.
 */
export const HEAD_CLEARANCE_R = 1.4;

/**
 * The head's half-length on a barrel of this length.
 *
 * Full size — a bare slider's whole block — on any ram with room for it, which
 * is every ram of a normal size. It only shrinks when it has to: the head has
 * to fit inside the barrel at full retraction, so on a short ram it is half the
 * barrel and no more, and it grows back to full the moment the barrel does.
 * That is the *only* reason it is a function and not a constant.
 *
 * Floored at square (`headAlongHalfMin`), which is what stops a ram shrinking
 * without limit and is therefore the real bottom of the whole part:
 * `MIN_STROKE_R` is read straight off it.
 */
export function cylinderHeadHalf(
  barrelLength: number,
  r: number = 0.15 * SettingsService.objectScale
): number {
  const wanted = Math.min(CYLINDER.headAlongHalfMax * r, barrelLength / 2);
  return Math.max(CYLINDER.headAlongHalfMin * r, wanted);
}

/**
 * The span a ram carries beyond its stroke terms: a clearance at each end of
 * the barrel, plus the head's own half-length. Derived, never chosen —
 * `span - lock` is what a mount drag has left to spend on stroke.
 *
 * A function of the stroke rather than a constant, because the head is: on a
 * ram long enough to hold a full-size block it is flat, and below that it
 * follows the barrel down.
 */
export function cylinderLock(stroke: number, r: number): number {
  return 2 * HEAD_CLEARANCE_R * r + cylinderHeadHalf(stroke + HEAD_CLEARANCE_R * r, r);
}

/**
 * The shortest stroke a cylinder may have: the one whose barrel is exactly a
 * square head.
 *
 * Derived, not chosen. `barrel = stroke + CLEARANCE` and the head is at most
 * half the barrel, so this is the stroke at which the barrel measures twice the
 * shortest head that still reads as one — closed, the head is just inside it;
 * open, just outside. Any less and the head hangs out of both ends of a barrel
 * shorter than itself.
 *
 * It was a flat 0.34 R, deliberately far below anything worth building, on the
 * reasoning that a *readable* minimum is a separate question and stopping a
 * drag at a visible size would feel arbitrary. Under the old bore that was
 * nearly harmless: the barrel still measured 13 R at the floor, because the
 * bore was doing the work. With the clearance at 1.4 R there is nothing else
 * holding it up, and the floor produced a black block with a stub of barrel
 * behind it. The head is what sets the floor now.
 */
export const MIN_STROKE_R = 2 * CYLINDER.headAlongHalfMin - HEAD_CLEARANCE_R;

/** A cylinder member: the bar the skin draws, and the body an edit must move. */
export interface CylinderMember<T extends Link = Link> {
  /** The two-joint bar itself. */
  leaf: Link;
  /** The top-level link that owns it — the leaf itself when nothing does. */
  root: T;
}

/**
 * Every two-joint bar at or under `root` that satisfies `keep`.
 *
 * Recursive, because a subset may itself hold subsets: a bracket welded to a
 * mount and then welded again into something larger nests one level further
 * each time, and a member found only at the top level would go missing at
 * exactly the point the drawing got complicated.
 */
function memberCandidates(root: Link, keep: (leaf: Link) => boolean): Link[] {
  const found = new Map<string, Link>();
  const walk = (node: Link) => {
    if (node.joints.length === 2 && keep(node)) found.set(node.id, node);
    if (node instanceof RealLink) node.subset.forEach(walk);
  };
  walk(root);
  return [...found.values()];
}

/**
 * The member bar inside `root` that satisfies `keep`, with `root` itself.
 *
 * A mount welded into a neighboring link absorbs the barrel (or rod) into a
 * compound; the member bar survives as a subset leaf and stays the thing the
 * skin describes, while the compound is what a drag has to carry.
 *
 * **Exactly one candidate, or none.** Choosing the first of several would be
 * guessing which bar is the cylinder, and the answer would depend on the order
 * the reader happened to draw things in. A sealed structure with two candidate
 * rods is malformed, and saying so leaves the caller free to report it rather
 * than to draw a ram that is not there.
 */
function resolveMember<T extends Link>(
  root: T,
  keep: (leaf: Link) => boolean
): CylinderMember<T> | undefined {
  const found = memberCandidates(root, keep);
  return found.length === 1 ? { leaf: found[0], root } : undefined;
}

/**
 * The cylinder this seal is the seal of, or nothing.
 *
 * The one lookup. It asks the seal for everything: sealed, a well-formed
 * floating slot, one rider — and then reads the roles straight off the slot,
 * `slotJointA` being the mount and `slotJointB` the inner end (decision S1).
 * There used to be two lookups here, one structural and one geometry-checked,
 * because every guard, drag route and delete cascade had to keep recognizing a
 * part whose geometry was momentarily wrong while the skin wanted to stop
 * drawing one that had gone bent. Deriving the interior instead of checking it
 * leaves one answer for both to quote.
 */
export function cylinderAtSeal(joint: Joint): Cylinder | undefined {
  const assembly = slideAssemblyAt(joint);
  if (!assembly || !assembly.slider.isSealed) return undefined;
  const seal = assembly.slider;
  if (!seal.isFloating || !seal.isSlotWellFormed) return undefined;
  // Two rods on one seal is not a cylinder with a choice to make; it is a
  // drawing that has not settled, and every caller would rather be told so.
  if (assembly.riders.length !== 1) return undefined;

  const mountA = seal.slotJointA!;
  const inner = seal.slotJointB!;
  // A mount welded into a neighboring link turns the carrier (or rider) into
  // a compound; the member bar survives as a subset leaf and stays the thing
  // the skin describes.
  const rod = resolveMember(assembly.riders[0], (leaf) =>
    leaf.joints.some((member) => member.id === seal.id)
  );
  const barrel = resolveMember(
    seal.carrier!,
    (leaf) =>
      leaf.joints.some((member) => member.id === mountA.id) &&
      leaf.joints.some((member) => member.id === inner.id)
  );
  if (!rod || !(rod.leaf instanceof RealLink) || !barrel) return undefined;

  const mountB = rod.leaf.joints.find((member) => member.id !== seal.id);
  if (!mountB) return undefined;

  return {
    seal,
    barrel: barrel.leaf,
    rod: rod.leaf,
    barrelRoot: barrel.root,
    rodRoot: rod.root,
    mountA,
    mountB,
    inner,
    get start(): number {
      return cylinderSizeAt(mountA, inner, mountB).start;
    },
  };
}

/** Every cylinder in the mechanism. Sealed ⇔ cylinder ⇔ skinned. */
export function cylindersIn(joints: Joint[]): Cylinder[] {
  return joints
    .map((joint) => cylinderAtSeal(joint))
    .filter((found): found is Cylinder => found !== undefined);
}

/**
 * Every joint of a cylinder: its two mounts, the buried inner end, and the
 * seal the rod is pinned to.
 *
 * Four, where it used to be five. The pin and the slider were two coincident
 * joints and are one now, and callers count, delete and freeze by this list --
 * so it names four things rather than the same joint twice.
 */
export function cylinderJoints(cylinder: Cylinder): Joint[] {
  return [cylinder.mountA, cylinder.inner, cylinder.seal, cylinder.mountB];
}

/**
 * The cylinder this joint is a member of, from any of its four joints.
 * Membership is what every permanence guard and drag route asks, and the
 * lookup answers it from the seal alone, so protection cannot lapse while a
 * geometry is momentarily wrong.
 */
export function cylinderOfJoint(joints: Joint[], joint: Joint | undefined): Cylinder | undefined {
  return cylinderOfJointIn(cylindersIn(joints), joint);
}

/** Same membership question against a precomputed structure list. */
export function cylinderOfJointIn(
  cylinders: Cylinder[],
  joint: Joint | undefined
): Cylinder | undefined {
  if (!joint) return undefined;
  return cylinders.find((cylinder) =>
    cylinderJoints(cylinder).some((member) => member.id === joint.id)
  );
}

/** Every cylinder this joint is a member of: one mount can carry two rams. */
export function cylindersOfJointIn(cylinders: Cylinder[], joint: Joint | undefined): Cylinder[] {
  if (!joint) return [];
  return cylinders.filter((cylinder) =>
    cylinderJoints(cylinder).some((member) => member.id === joint.id)
  );
}

/** The two joints a cylinder attaches to the rest of the drawing by. */
export function cylinderMounts(cylinder: Cylinder): Joint[] {
  return [cylinder.mountA, cylinder.mountB];
}

/** Whether this joint is one of the cylinder's two mounts. */
export function isCylinderMount(cylinder: Cylinder, joint: Joint): boolean {
  return cylinderMounts(cylinder).some((mount) => mount.id === joint.id);
}

/**
 * The cylinders this joint is a *mount* of, and the ones it is *inside*.
 *
 * Kept apart because they answer opposite questions and one joint can be both
 * — a mount of one ram is an ordinary joint to weld or slide, while any
 * interior membership at all closes the same controls. Every caller that used
 * to ask "is this joint on a cylinder" was really asking one of these two, and
 * membership alone is the answer to neither.
 */
export function cylinderMountsAt(cylinders: Cylinder[], joint: Joint | undefined): Cylinder[] {
  if (!joint) return [];
  return cylinders.filter((cylinder) => isCylinderMount(cylinder, joint));
}

export function cylindersEnclosing(cylinders: Cylinder[], joint: Joint | undefined): Cylinder[] {
  if (!joint) return [];
  return cylinders.filter((cylinder) => isInsideCylinder(cylinder, joint));
}

/** The cylinder this link is a member of — barrel or rod. */
export function cylinderOfLink(joints: Joint[], link: Link | undefined): Cylinder | undefined {
  return cylinderOfLinkIn(cylindersIn(joints), link);
}

/** Whether `link`, or anything nested under it, is one of the cylinder's bars. */
function ownsMember(link: Link, cylinder: Cylinder): boolean {
  const memberIds = [cylinder.barrel.id, cylinder.rod.id];
  // Recursive, and not one level: a compound that has itself been welded into
  // something larger still owns the member, and a delete or a drag that missed
  // it would tear the ram it was carrying.
  const holds = (node: Link): boolean =>
    memberIds.includes(node.id) ||
    (node instanceof RealLink && node.subset.some((leaf) => holds(leaf)));
  return holds(link);
}

/**
 * Every cylinder with a member at or under this link.
 *
 * Plural because one compound can swallow several: two rams welded into one
 * bracket are both casualties of deleting it, and a first match would take one
 * of them and leave the other's joints behind.
 */
export function cylindersOfLinkIn(cylinders: Cylinder[], link: Link | undefined): Cylinder[] {
  if (!link) return [];
  return cylinders.filter((cylinder) => ownsMember(link, cylinder));
}

/**
 * The cylinder this link *is* a bar of — barrel, rod or block — as opposed to
 * one it merely carries.
 *
 * The recursive question above is the right one for a cascade: a delete or a
 * drag that missed a ram welded somewhere under a body would tear it. It is the
 * wrong one for *identity*, and until a mount could be welded nothing had to
 * tell the two apart, because no compound ever held a cylinder leaf. Now one
 * does, and every consumer that asked the recursive question in order to name
 * what it was looking at answered with the ram: select the bracket welded to a
 * rod mount and the panel said "Edit Cylinder AB", the menu header said
 * "Cylinder AB · Barrel and rod", and its delete row said "Delete Cylinder" and
 * took only the ram -- while Delete on the same selection took the whole body.
 *
 * This is the question `NewGridComponent.skinnedLink` has always asked of the
 * drawing, which is why the drawing was right about it and the words were not.
 */
export function cylinderOfBarIn(
  cylinders: Cylinder[],
  link: Link | undefined
): Cylinder | undefined {
  if (!link) return undefined;
  return cylinders.find((cylinder) => [cylinder.barrel.id, cylinder.rod.id].includes(link.id));
}

/** The link-membership question against a precomputed structure list. */
export function cylinderOfLinkIn(
  cylinders: Cylinder[],
  link: Link | undefined
): Cylinder | undefined {
  return cylindersOfLinkIn(cylinders, link)[0];
}

/**
 * Whether this joint is the cylinder's *hidden* one: N, and only N.
 *
 * `isCylinderInterior` used to answer for N and S together, and it was two
 * questions wearing one name (decision S11). This is the one about what the
 * reader can see — no hitbox, no letter, nothing counted — and S is none of
 * those things once it is the square a reader can select. The other question,
 * about what the layout owns, is `isInsideCylinder`.
 */
export function isCylinderInner(cylinder: Cylinder, joint: Joint): boolean {
  return cylinder.inner.id === joint.id;
}

/**
 * Whether this joint is one the cylinder itself places: N or S.
 *
 * The question every *edit* asks. Both are put where the layout says, so
 * neither is an anchor for a hold, and neither may be welded, merged onto or
 * have a slot cut through it. Say `isCylinderInner` instead when the question
 * is what the reader can see.
 */
export function isInsideCylinder(cylinder: Cylinder, joint: Joint): boolean {
  return [cylinder.inner.id, cylinder.seal.id].includes(joint.id);
}

/** A freshly drawn cylinder opens at mid-travel, so it has room to go either way. */
export const CYLINDER_CREATION_START = 0.5;

export interface CylinderCreation extends CylinderPose {
  angleRad: number;
  /** Mount-to-mount distance actually used, after the minimum is applied. */
  span: number;
  barrelLength: number;
  pinFromMount: number;
  rodLength: number;
}

/**
 * The smallest cylinder a creation gesture will draw, in objectScale.
 *
 * Larger than the smallest cylinder that can *exist* (`SPAN_MIN_R`, which is
 * the fully-retracted floor) because a new ram opens at mid-travel: a span at
 * the retracted floor would give it two thirds of the floor stroke and land
 * under the minimum. Drawn at this span it gets exactly the floor stroke with
 * half of it already used.
 */
export const CYLINDER_MIN_SPAN_SCALE =
  0.15 * 1.5 * MIN_STROKE_R + cylinderLock(0.15 * MIN_STROKE_R, 0.15);

/**
 * Lay out a new cylinder from the two points of the creation gesture: the
 * start point is the barrel-side mount, `end` is where the rod finishes.
 *
 * The ram opens at mid-travel, so the drawn span is `1.5 × stroke + lock` and
 * the stroke is two thirds of what is left after the lock. Inverted through the
 * same span rule a mount drag uses rather than by hand, because the lock is not
 * a constant: on a short ram the head follows the barrel down and takes the
 * lock with it. A span below the minimum clamps (a zero-length click cannot
 * make a degenerate part), keeping the drawn direction — or +x when there is
 * none.
 */
export function cylinderCreationLayout(
  start: { x: number; y: number },
  end: { x: number; y: number },
  objectScale: number
): CylinderCreation {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const drawn = Math.hypot(dx, dy);
  const angleRad = drawn < 1e-9 ? 0 : Math.atan2(dy, dx);
  const r = 0.15 * objectScale;
  const flex = cylinderSpanLayoutFrom(drawn, CYLINDER_CREATION_START, r);
  const ux = Math.cos(angleRad);
  const uy = Math.sin(angleRad);
  const at = (along: number) => ({ x: start.x + along * ux, y: start.y + along * uy });
  return {
    angleRad,
    span: flex.span,
    barrelLength: flex.barrel,
    pinFromMount: flex.pinAlong,
    rodLength: flex.rod,
    barrelFar: at(0),
    barrelNear: at(flex.barrel),
    pin: at(flex.pinAlong),
    rodFar: at(flex.span),
  };
}

/**
 * How far from the barrel's mount the pin may sit: the head's own travel.
 *
 * Measured to the *pin*, so both ends carry the head's half-length. Closed, the
 * head's back edge stands `HEAD_CLEARANCE_R` off the mount; open, that same
 * back edge has reached the mouth and the head is entirely outside the barrel —
 * which is why `max` runs past the barrel's own length rather than stopping
 * short of it.
 *
 * One definition, read by everything that would otherwise disagree — the
 * drawing places the head by it and the simulation treats the interval as the
 * cylinder's stroke. A driven cylinder can therefore only reach poses the part
 * can actually be drawn in, and it reverses at the ends of its own travel
 * rather than telescoping out of its barrel.
 *
 * `usable` is the answer to "is there anywhere to go", and it is a flag rather
 * than an inverted interval on purpose. A barrel shorter than the clearance has
 * no travel, and every caller here clamps or samples against `[min, max]` —
 * handed `max < min` they would silently do something. Object Scale can walk a
 * legal barrel under it at any moment (it changes R and rebuilds), so this is a
 * state the app reaches, not a defensive branch: the interval collapses to the
 * one point the head can occupy and the flag says so out loud.
 */
export function cylinderStrokeAlong(
  barrelLength: number,
  r: number = 0.15 * SettingsService.objectScale
): { min: number; max: number; usable: boolean } {
  const head = cylinderHeadHalf(barrelLength, r);
  const min = HEAD_CLEARANCE_R * r + head;
  const max = barrelLength + head;
  if (!(max - min >= MIN_STROKE_R * r)) {
    const collapsed = barrelLength / 2 + head;
    return { min: collapsed, max: collapsed, usable: false };
  }
  return { min, max, usable: true };
}

/** The stroke a barrel of this length has, floored at nothing rather than going negative. */
export function cylinderStroke(
  barrelLength: number,
  r: number = 0.15 * SettingsService.objectScale
): number {
  return Math.max(0, barrelLength - HEAD_CLEARANCE_R * r);
}

/** The shortest mount-to-mount span a ram can have: fully retracted, at the floor. */
export function cylinderMinimumSpan(r: number): number {
  return MIN_STROKE_R * r + cylinderLock(MIN_STROKE_R * r, r);
}

/** Mount-to-mount span at each end of the travel, for a given stroke. */
export function cylinderSpanRange(
  stroke: number,
  r: number
): { retracted: number; extended: number } {
  const lock = cylinderLock(stroke, r);
  return { retracted: stroke + lock, extended: 2 * stroke + lock };
}

/** Where the two joints a cylinder owns belong, given where its mounts are. */
export interface DerivedInterior {
  inner: { x: number; y: number };
  seal: { x: number; y: number };
}

/**
 * Where N and S belong: on the axis, at the lengths the two bars already have
 * (decision S2).
 *
 * The mounts are the reader's handles and are never an output. The axis is A→B
 * and nothing else, so N goes one barrel along it from A and S one rod back
 * from B. For a cylinder that is already straight both answers are where the
 * joints already are, which is why this can run after every rebuild and
 * usually write nothing.
 *
 * This replaced a *repair*, which planned a whole edit — carrying welded
 * brackets, judging locks, refusing — to arrive at the same two points. A
 * repair has to be asked whether it is allowed; a derivation does not, because
 * it only ever writes the two joints the seal owns. What it will not do is
 * clamp S into the travel: raising Object Scale grows the head under a part
 * nobody touched and can leave S outside the stops, and snapping it in would
 * move a joint with no undo entry and destroy the geometry that scaling back
 * down would otherwise restore. Left alone the part stays exactly as drawn and
 * the solver refuses to run it, which is what the panel already says.
 */
export function derivedInterior(cylinder: Cylinder): DerivedInterior | undefined {
  const { mountA, mountB, inner, seal } = cylinder;
  const dx = mountB.x - mountA.x;
  const dy = mountB.y - mountA.y;
  const span = Math.hypot(dx, dy);
  // Coincident mounts give no axis to lay anything along. A cylinder cannot
  // reach that state from the app, and one that arrives there from a URL is
  // better left as drawn than folded onto a direction picked at random.
  if (span < 1e-9) return undefined;
  const ux = dx / span;
  const uy = dy / span;

  const barrelLength = Math.hypot(inner.x - mountA.x, inner.y - mountA.y);
  const rodLength = Math.hypot(mountB.x - seal.x, mountB.y - seal.y);

  return {
    inner: { x: mountA.x + barrelLength * ux, y: mountA.y + barrelLength * uy },
    seal: { x: mountB.x - rodLength * ux, y: mountB.y - rodLength * uy },
  };
}

/**
 * Re-lay a ram between two mounts that have moved, resizing it to reach.
 *
 * The straightener above holds the size it finds, which is right when the
 * question is "put this back on its axis" and wrong when the mounts themselves
 * have been carried apart: the head lands as far outside the barrel as the
 * stretch, joined to it by nothing, and the part is drawn in two pieces.
 *
 * Two rams can share a mount -- the first's rod end is the second's barrel end
 * -- so moving one moves the other's mount without the other being asked. This
 * is what asks it. Both halves grow or shrink together, exactly as a drag on a
 * ram's own mount resizes it past its stops, so both of its ends move; and both
 * mounts are held, because they belong to whatever moved them.
 *
 * Only called where a mount is known to have moved. Applied blindly it could
 * not tell that from a barrel some other write had shortened, and would quietly
 * repair a starved ram into a working one.
 */
export function stretchedCylinderPose(
  barrelMount: { x: number; y: number },
  rodMount: { x: number; y: number },
  barrelLength: number,
  r: number
): CylinderPose | undefined {
  const dx = rodMount.x - barrelMount.x;
  const dy = rodMount.y - barrelMount.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1e-9 || !(barrelLength > 1e-9)) return undefined;
  const ux = dx / distance;
  const uy = dy / distance;
  const flex = cylinderSpanLayout(distance, cylinderStroke(barrelLength, r), r);
  const at = (along: number) => ({
    x: barrelMount.x + along * ux,
    y: barrelMount.y + along * uy,
  });
  return {
    barrelFar: { x: barrelMount.x, y: barrelMount.y },
    barrelNear: at(flex.barrel),
    pin: at(flex.pinAlong),
    rodFar: { x: rodMount.x, y: rodMount.y },
    atMinimum: flex.atMinimum,
  };
}

/** Where each joint of a re-posed cylinder lands. */
export interface CylinderPose {
  /** True when the layout had to hold the ram at its shortest. */
  atMinimum?: boolean;
  barrelFar: { x: number; y: number };
  barrelNear: { x: number; y: number };
  /** Where the slider the rod hangs on goes. */
  pin: { x: number; y: number };
  rodFar: { x: number; y: number };
}

/** Barrel, rod and pin for a given size and position. The one place they are built. */
export function cylinderMembers(stroke: number, start: number, r: number): CylinderMembers {
  const held = Math.max(stroke, MIN_STROKE_R * r);
  const at = Math.min(Math.max(start, 0), 1);
  // Equal by construction. Everything below is addition along the axis.
  const barrel = held + HEAD_CLEARANCE_R * r;
  const pinAlong = HEAD_CLEARANCE_R * r + cylinderHeadHalf(barrel, r) + held * at;
  return {
    span: pinAlong + barrel,
    barrel,
    pinAlong,
    rod: barrel,
    stroke: held,
    start: at,
    // Reported rather than merely applied: a gesture that has stopped following
    // the cursor should be able to say why, and only the layout knows.
    atMinimum: held > stroke,
  };
}

/** A ram's members, and whether making it took the floor. */
export interface CylinderMembers {
  span: number;
  barrel: number;
  pinAlong: number;
  rod: number;
  stroke: number;
  start: number;
  atMinimum: boolean;
}

/**
 * Pose first, then size — the rule a mount drag follows, and the one the panel
 * follows when a length is typed into *Starts at*.
 *
 * Inside the ram's own travel the size is untouched and the piston simply
 * slides to where it was asked for. Push past a stop and the ram resizes, with
 * barrel and rod staying equal: pulling past fully-extended grows it, and
 * because *both* halves grow the mount travels twice as fast as the stroke
 * does; pushing past fully-retracted shrinks it one-for-one until the floor.
 *
 * The ordering is the point. Posing is the common intent and resizing the rare
 * one, so the cheap half of the gesture does the common thing and you have to
 * push through a detent — the ram's own stop — to reach the expensive one. A
 * drag that stays inside the travel is therefore guaranteed non-destructive:
 * the ram you sized cannot be resized by accident.
 */
export function cylinderSpanLayout(
  span: number,
  currentStroke: number,
  r: number
): CylinderMembers {
  const stroke = Math.max(currentStroke, MIN_STROKE_R * r);
  const { retracted, extended } = cylinderSpanRange(stroke, r);
  if (span >= retracted && span <= extended) {
    return cylinderMembers(stroke, (span - retracted) / stroke, r);
  }
  return cylinderSpanLayoutFrom(span, span > extended ? 1 : 0, r);
}

/**
 * The stroke that puts a ram of the given start exactly at this span.
 *
 * Bisected rather than rearranged. `span = stroke × (1 + start) + lock`, and the
 * lock is a constant only while the head is: below that the head is half the
 * barrel and follows the stroke down, so an inverted formula needs a case per
 * regime and a test for which one lands — three chances to be subtly wrong at
 * the seams, on the path a drag runs every pointermove. `span` is strictly
 * increasing in `stroke` throughout, so bisection needs none of that and
 * converges to well under the six decimals every coordinate is rounded to.
 */
export function cylinderSpanLayoutFrom(span: number, start: number, r: number): CylinderMembers {
  const floor = MIN_STROKE_R * r;
  let low = floor;
  // A stroke can never exceed the span it has to fit inside, lock or no lock.
  let high = Math.max(floor, span);
  for (let step = 0; step < 60; step++) {
    const mid = (low + high) / 2;
    if (cylinderMembers(mid, start, r).span > span) high = mid;
    else low = mid;
  }
  return cylinderMembers(low, start, r);
}

/**
 * Re-pose a cylinder from its two mounts — the parametric drag (§ cylinder 6).
 *
 * The span between the mounts drives the layout: inside the ram's own travel
 * only the pin moves, and past either end of it the ram resizes. The `anchor`
 * mount stays exactly where it is in every case, and collinearity holds by
 * construction: every returned point is on the axis. `barrelLength` is read —
 * it is what the current stroke is measured from, and the whole point of the
 * rule is that a span inside the travel does *not* change it.
 */
export function layoutCylinder(
  barrelMount: { x: number; y: number },
  rodMount: { x: number; y: number },
  /** The barrel as it stands, which is what the current stroke is read from. */
  barrelLength: number,
  r: number,
  anchor: 'barrel' | 'rod',
  /**
   * The axis direction before this move. A drag that crosses the anchor
   * would otherwise flip the part 180° the instant the direction reverses;
   * with the hint, the crossing clamps at the minimum span on the side the
   * part was already on.
   */
  axisHint?: { x: number; y: number }
): CylinderPose | undefined {
  const dx = rodMount.x - barrelMount.x;
  const dy = rodMount.y - barrelMount.y;
  let distance = Math.hypot(dx, dy);
  let ux: number;
  let uy: number;
  const hintLen = axisHint ? Math.hypot(axisHint.x, axisHint.y) : 0;
  if (distance < 1e-9) {
    // Coincident mounts define no axis; the hint does, if there is one.
    if (!(hintLen > 1e-9)) return undefined;
    ux = axisHint!.x / hintLen;
    uy = axisHint!.y / hintLen;
    distance = 0;
  } else {
    ux = dx / distance;
    uy = dy / distance;
    if (hintLen > 1e-9 && ux * axisHint!.x + uy * axisHint!.y < 0) {
      // The dragged mount crossed the anchor: hold the old axis and let the
      // span clamp at its minimum rather than flipping the part.
      ux = axisHint!.x / hintLen;
      uy = axisHint!.y / hintLen;
      distance = 0;
    }
  }

  const flex = cylinderSpanLayout(distance, cylinderStroke(barrelLength, r), r);

  const a =
    anchor === 'barrel'
      ? { x: barrelMount.x, y: barrelMount.y }
      : { x: rodMount.x - flex.span * ux, y: rodMount.y - flex.span * uy };
  const c =
    anchor === 'barrel'
      ? { x: barrelMount.x + flex.span * ux, y: barrelMount.y + flex.span * uy }
      : { x: rodMount.x, y: rodMount.y };

  return {
    barrelFar: a,
    barrelNear: { x: a.x + flex.barrel * ux, y: a.y + flex.barrel * uy },
    pin: { x: a.x + flex.pinAlong * ux, y: a.y + flex.pinAlong * uy },
    rodFar: c,
    atMinimum: flex.atMinimum,
  };
}

/**
 * Re-pose a cylinder from the size and position themselves — what the panel
 * writes, and the one thing the span rule above cannot express.
 *
 * Size and pose are two different edits. Asked for a longer stroke at the same
 * start, the resulting span usually still lies *inside* the old stroke's own
 * travel — so the span rule, doing exactly what it is meant to, would hold the
 * old size and slide the piston instead. A field labeled Travel would then
 * quietly change the position and not the travel.
 *
 * The barrel mount is held and the rod mount moves, because the barrel mount is
 * the end a ram is anchored by; `angleRad` keeps the part on the axis the panel
 * shows rather than re-deriving it from mounts that are about to move.
 */
export function poseFromStrokeAndStart(
  barrelMount: { x: number; y: number },
  angleRad: number,
  stroke: number,
  start: number,
  r: number
): CylinderPose {
  const members = cylinderMembers(stroke, start, r);
  const ux = Math.cos(angleRad);
  const uy = Math.sin(angleRad);
  const at = (along: number) => ({
    x: barrelMount.x + along * ux,
    y: barrelMount.y + along * uy,
  });
  return {
    barrelFar: at(0),
    barrelNear: at(members.barrel),
    pin: at(members.pinAlong),
    rodFar: at(members.span),
  };
}

/** The size and position a built cylinder currently has, read back off its joints. */
export function cylinderSizeOf(
  cylinder: Cylinder,
  r: number = 0.15 * SettingsService.objectScale
): CylinderSize {
  return cylinderSizeAt(cylinder.mountA, cylinder.inner, cylinder.mountB, r);
}

export interface CylinderSize {
  stroke: number;
  start: number;
  span: number;
  barrelLength: number;
}

/**
 * The same reading, from the three points it is actually made of.
 *
 * Split out so the record's own `start` getter and the panel's `cylinderSizeOf`
 * cannot drift: a getter that re-derived the clamp and the travel interval for
 * itself would be a second answer to a question with one answer.
 */
function cylinderSizeAt(
  mountA: { x: number; y: number },
  inner: { x: number; y: number },
  mountB: { x: number; y: number },
  r: number = 0.15 * SettingsService.objectScale
): CylinderSize {
  const barrelLength = Math.hypot(inner.x - mountA.x, inner.y - mountA.y);
  const span = Math.hypot(mountB.x - mountA.x, mountB.y - mountA.y);
  // Through the travel interval, not the raw subtraction: a barrel can be long
  // enough to leave a sliver over the bore and still have no *usable* stroke,
  // and reporting that sliver put the panel at odds with the solver -- Travel
  // saying 0.05 cm beside a mechanism saying the ram has no travel at all.
  const travel = cylinderStrokeAlong(barrelLength, r);
  const stroke = travel.usable ? travel.max - travel.min : 0;
  const { retracted } = cylinderSpanRange(stroke, r);
  return {
    stroke,
    start: stroke > 0 ? Math.min(Math.max((span - retracted) / stroke, 0), 1) : 0,
    span,
    barrelLength,
  };
}
