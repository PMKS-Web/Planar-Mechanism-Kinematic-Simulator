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

/**
 * The two members' own lengths: |AN| and |SB| (decision S3).
 *
 * They used to be one number. "Equal by construction" was what made a cylinder
 * one size and one position, and it is what *creation* still draws — but a
 * typed Barrel Length moves N alone and a typed Rod Length moves B alone, so
 * the two parted company the moment either had a field of its own. Every
 * layout below therefore takes the pair; hand it two equal numbers and it
 * answers exactly what the single-number version answered.
 *
 * The travel is still the barrel's alone: a longer rod reaches further, it
 * does not slide further.
 */
export interface CylinderLengths {
  /** |AN| — the barrel, whose length alone is the stroke. */
  barrel: number;
  /** |SB| — the rod. */
  rod: number;
}

/**
 * Which members are keeping their length against this edit (decision S5).
 *
 * A member's `'length'` hold is never handed to the hold solver, because the
 * thing it constrains is a length the layout itself chooses. This is where it
 * is honored instead: a held member does not resize, and the other one takes
 * all of the change.
 */
export interface CylinderHolds {
  barrel?: boolean;
  rod?: boolean;
}

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
      return cylinderSizeAt(mountA, inner, seal, mountB).start;
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
 *
 * Membership is what every permanence guard and drag route asks, and the
 * lookup answers it from the seal alone, so protection cannot lapse while a
 * geometry is momentarily wrong. Asked against a precomputed list, because
 * every caller holds one: the service caches the records per
 * `cylinderRevision` and a per-candidate rebuild on every pointermove is
 * exactly the quadratic work the drag stutter came from.
 */
export function cylinderOfJointIn(
  cylinders: Cylinder[],
  joint: Joint | undefined
): Cylinder | undefined {
  if (!joint) return undefined;
  return cylinders.find((cylinder) =>
    cylinderJoints(cylinder).some((member) => member.id === joint.id)
  );
}

/**
 * The cylinders this joint is *inside* — placed by the layout rather than an
 * attachment point (decision S11).
 *
 * The question apart from membership, and one joint can answer both: a mount
 * of one cylinder is an ordinary joint to weld or slide, while being inside
 * any cylinder at all closes the same controls. Every caller that used to ask
 * "is this joint on a cylinder" was really asking one of the two, and
 * membership alone is the answer to neither.
 */
export function cylindersEnclosing(cylinders: Cylinder[], joint: Joint | undefined): Cylinder[] {
  if (!joint) return [];
  return cylinders.filter((cylinder) => isInsideCylinder(cylinder, joint));
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
const CYLINDER_CREATION_START = 0.5;

interface CylinderCreation extends CylinderPose {
  angleRad: number;
  /** Mount-to-mount distance actually used, after the minimum is applied. */
  span: number;
  barrelLength: number;
  sealFromMount: number;
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
 *
 * A new cylinder still has barrel = rod (decision S3). The two lengths can
 * differ now, but nothing has asked them to yet, and drawing them equal is what
 * keeps every number an existing drawing produces the number it produced
 * before.
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
  return {
    angleRad,
    span: flex.span,
    barrelLength: flex.barrel,
    sealFromMount: flex.sealAlong,
    rodLength: flex.rod,
    ...cylinderPoseAlong(
      start,
      { x: Math.cos(angleRad), y: Math.sin(angleRad) },
      { barrel: flex.barrel, rod: flex.rod },
      flex.sealAlong
    ),
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
  const { min, max } = cylinderHeadTravel(barrelLength, r);
  if (!(max - min >= MIN_STROKE_R * r)) {
    const collapsed = barrelLength / 2 + cylinderHeadHalf(barrelLength, r);
    return { min: collapsed, max: collapsed, usable: false };
  }
  return { min, max, usable: true };
}

/**
 * The same two bounds, as the geometry states them and with no verdict.
 *
 * `cylinderStrokeAlong` collapses an unusable interval to a point so that every
 * caller that clamps or samples against it is handed something it can clamp
 * against. A *layout* has already put the barrel above its floor and wants the
 * arithmetic rather than the guard — and asking the guarded version there would
 * make the answer turn on whether `Lb - c` lands a hair above or below the
 * floor it was just set to. It does land under it: `cylinderBarrelFloor` is a
 * product of a sum and the stroke is a difference, so the barrel at the floor
 * measures a stroke an ulp short of the floor stroke, the guard fires, and a
 * search that started there was handed a collapsed point for its lower bound.
 */
export function cylinderHeadTravel(barrelLength: number, r: number): { min: number; max: number } {
  const head = cylinderHeadHalf(barrelLength, r);
  return { min: HEAD_CLEARANCE_R * r + head, max: barrelLength + head };
}

/** The stroke a barrel of this length has, floored at nothing rather than going negative. */
export function cylinderStroke(
  barrelLength: number,
  r: number = 0.15 * SettingsService.objectScale
): number {
  return Math.max(0, barrelLength - HEAD_CLEARANCE_R * r);
}

/**
 * The shortest barrel worth drawing: the one whose stroke is exactly the floor.
 *
 * `MIN_STROKE_R` says the same thing about the stroke; this says it about the
 * number the layouts actually hold, so nothing has to add the clearance back on
 * at four call sites and disagree at one of them.
 */
export function cylinderBarrelFloor(r: number): number {
  return (MIN_STROKE_R + HEAD_CLEARANCE_R) * r;
}

/**
 * The shortest rod a barrel of this length allows: the barrel's own stroke
 * (decision S3).
 *
 * The rod has to span from the mouth back to mount B at full extension, so a
 * rod shorter than the stroke would pull B *into* the barrel on the way closed.
 * A cylinder drawn with the two members equal clears this by the clearance,
 * which is why it never came up while they had to be equal.
 */
export function cylinderRodFloor(barrelLength: number, r: number): number {
  return cylinderStroke(barrelLength, r);
}

/** Both members put on their floors, which is the smallest part they describe. */
function flooredLengths(lengths: CylinderLengths, r: number): CylinderLengths {
  const barrel = Math.max(lengths.barrel, cylinderBarrelFloor(r));
  return { barrel, rod: Math.max(lengths.rod, cylinderRodFloor(barrel, r)) };
}

/** The shortest mount-to-mount span a ram can have: fully retracted, at the floor. */
export function cylinderMinimumSpan(r: number): number {
  return MIN_STROKE_R * r + cylinderLock(MIN_STROKE_R * r, r);
}

/**
 * Mount-to-mount span at each end of the travel, for these two members.
 *
 * The seal's travel is the barrel's (`cylinderStrokeAlong`) and the rod rides
 * out beyond it, so each end of the span is one end of that travel plus the
 * rod. Handed two equal members this is the old `stroke + lock` and
 * `2 × stroke + lock` to the last decimal — `lock` was never a third constant,
 * only `c + head + rod` written out under the assumption that the rod was the
 * barrel.
 */
export function cylinderSpanRange(
  lengths: CylinderLengths,
  r: number
): { retracted: number; extended: number } {
  const travel = cylinderHeadTravel(lengths.barrel, r);
  return { retracted: travel.min + lengths.rod, extended: travel.max + lengths.rod };
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
  lengths: CylinderLengths,
  r: number,
  holds: CylinderHolds = {}
): CylinderPose | undefined {
  const dx = rodMount.x - barrelMount.x;
  const dy = rodMount.y - barrelMount.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1e-9 || !(lengths.barrel > 1e-9)) return undefined;
  const axis = { x: dx / distance, y: dy / distance };
  const fit = cylinderSpanLayout(distance, lengths, r, holds);
  return {
    // Both mounts are held: they belong to whatever carried them, and a span
    // the fit had to clamp is a part that cannot reach rather than a mount
    // this pass is entitled to move.
    ...cylinderPoseAlong(barrelMount, axis, fit.lengths, fit.along, fit.atMinimum),
    mountB: { x: rodMount.x, y: rodMount.y },
  };
}

/** Where each joint of a re-posed cylinder lands: A, N, S, B, in the record's names. */
export interface CylinderPose {
  /** True when the layout had to hold the ram at its shortest. */
  atMinimum?: boolean;
  /** A — the barrel's outer end. */
  mountA: { x: number; y: number };
  /** N — the barrel's inner end, buried under the rod. */
  inner: { x: number; y: number };
  /** S — the sliding seal the rod hangs on. */
  seal: { x: number; y: number };
  /** B — the rod's outer end. */
  mountB: { x: number; y: number };
}

/**
 * The one place a pose is built: A, the axis, both lengths, and where the seal
 * stands along the barrel.
 *
 * Every other function here answers some question in those five terms and then
 * hands them over, so no caller works out where N goes. It used to, in six
 * places, each adding the head's half-length back on for itself — which is how
 * a re-lay came to put the head as far outside the barrel as the stretch.
 *
 * `axis` is a unit vector. Every caller either has one or has an angle to take
 * the cosine and sine of, and normalizing here would hide the one case that
 * genuinely has no axis (coincident mounts) behind a silent guess.
 */
export function cylinderPoseAlong(
  mountA: { x: number; y: number },
  axis: { x: number; y: number },
  lengths: CylinderLengths,
  along: number,
  atMinimum?: boolean
): CylinderPose {
  const at = (distance: number) => ({
    x: mountA.x + distance * axis.x,
    y: mountA.y + distance * axis.y,
  });
  return {
    mountA: { x: mountA.x, y: mountA.y },
    inner: at(lengths.barrel),
    seal: at(along),
    mountB: at(along + lengths.rod),
    atMinimum,
  };
}

/**
 * Barrel, rod and seal for one size number and one position number.
 *
 * The *equal-member* constructor, and deliberately still one: it is what a
 * creation gesture draws and what the old Travel field means by a size. The
 * general question — two lengths that may differ — is `cylinderSpanLayout`.
 */
export function cylinderMembers(stroke: number, start: number, r: number): CylinderMembers {
  const held = Math.max(stroke, MIN_STROKE_R * r);
  const at = Math.min(Math.max(start, 0), 1);
  const barrel = held + HEAD_CLEARANCE_R * r;
  const sealAlong = HEAD_CLEARANCE_R * r + cylinderHeadHalf(barrel, r) + held * at;
  return {
    span: sealAlong + barrel,
    barrel,
    sealAlong,
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
  sealAlong: number;
  rod: number;
  stroke: number;
  start: number;
  atMinimum: boolean;
}

/** What a span asked of a cylinder leaves it: its members, and where the seal stands. */
export interface CylinderSpanFit {
  lengths: CylinderLengths;
  /** |AS| — the seal's place along the barrel. */
  along: number;
  /** The span actually reached: the one asked for, or the nearest the part allows. */
  span: number;
  /** Where in its own travel that leaves the seal, 0 shut to 1 open. */
  start: number;
  /** True when the part had to be held at its shortest, so a gesture can say why. */
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
 *
 * Past a stop, who gives is decided by the holds (decision S4). With neither
 * member holding its length both resize by the same amount, which is the old
 * rule written out for two numbers instead of one. With one held the other
 * takes all of it, down to its own floor. With both held there is nothing to
 * spend and the mount stops at the stop — the returned span is the clamped one,
 * exactly as it already is at the shortest cylinder there is.
 */
export function cylinderSpanLayout(
  span: number,
  lengths: CylinderLengths,
  r: number,
  holds: CylinderHolds = {}
): CylinderSpanFit {
  const floored = flooredLengths(lengths, r);
  const { retracted, extended } = cylinderSpanRange(floored, r);
  const fit =
    span >= retracted && span <= extended
      ? fitOf(floored, span - floored.rod, r)
      : span > extended
        ? openedPast(span, floored, r, holds)
        : closedPast(span, floored, r, holds);
  // The mount has stopped following the cursor exactly when the span it landed
  // at is not the span it was asked for: because a member is holding its
  // length, or because the part is already as short as one goes.
  return { ...fit, atMinimum: Math.abs(fit.span - span) > 1e-9 };
}

/** A fit, with the span and the start it implies. One place, so they cannot disagree. */
function fitOf(lengths: CylinderLengths, along: number, r: number): CylinderSpanFit {
  const { min, max } = cylinderHeadTravel(lengths.barrel, r);
  return {
    lengths,
    along,
    span: along + lengths.rod,
    start: max > min ? Math.min(Math.max((along - min) / (max - min), 0), 1) : 0,
    atMinimum: false,
  };
}

/**
 * Pulled past fully open: the part grows to reach, or stops.
 *
 * Both members grow by the same amount when neither holds its length, so the
 * mount travels twice as fast as the stroke — the ceiling that equality always
 * bought. A held barrel means the rod alone reaches, which it can always do. A
 * held rod means the barrel alone grows, and it may only grow until its stroke
 * equals the rod: past that mount B would retract inside the barrel's mouth on
 * the way closed, so the mount stops there instead.
 */
function openedPast(
  span: number,
  lengths: CylinderLengths,
  r: number,
  holds: CylinderHolds
): CylinderSpanFit {
  const openAt = (grown: CylinderLengths) => cylinderSpanRange(grown, r).extended;
  const openTo = (grown: CylinderLengths) =>
    fitOf(grown, cylinderHeadTravel(grown.barrel, r).max, r);
  if (holds.barrel && holds.rod) return openTo(lengths);
  if (holds.barrel) {
    // Only the rod can reach, and reaching further is always something a rod
    // can do: its floor is a lower bound, and this is growth.
    return openTo({
      barrel: lengths.barrel,
      rod: span - cylinderHeadTravel(lengths.barrel, r).max,
    });
  }
  if (holds.rod) {
    // Only the barrel can grow, and it may grow only until its stroke equals
    // the rod. Past that, closing would pull mount B inside the mouth.
    const ceiling = lengths.rod + HEAD_CLEARANCE_R * r;
    const barrel = solveFor(span, lengths.barrel, ceiling, (candidate) =>
      openAt({ barrel: candidate, rod: lengths.rod })
    );
    return openTo({ barrel, rod: lengths.rod });
  }
  // Both grow by the same amount, which is what the equal members did when
  // they were one number: the mount travels twice as fast as the stroke.
  const by = solveFor(span, 0, span, (delta) =>
    openAt({ barrel: lengths.barrel + delta, rod: lengths.rod + delta })
  );
  return openTo({ barrel: lengths.barrel + by, rod: lengths.rod + by });
}

/**
 * Pushed past fully closed: the part shrinks to fit, or stops.
 *
 * The mirror of the one above, with two differences the geometry forces. Only
 * the barrel has a floor worth naming — shrinking both by the same amount keeps
 * the rod clear of its own floor by however much it started clear — and a held
 * rod cannot help at all, because closing further asks the rod to be *shorter*
 * and it is holding its length. So a held rod stops the mount at the stop, with
 * or without the barrel holding too.
 */
function closedPast(
  span: number,
  lengths: CylinderLengths,
  r: number,
  holds: CylinderHolds
): CylinderSpanFit {
  const closedAt = (shrunk: CylinderLengths) => cylinderSpanRange(shrunk, r).retracted;
  const closedTo = (shrunk: CylinderLengths) =>
    fitOf(shrunk, cylinderHeadTravel(shrunk.barrel, r).min, r);
  // A held rod cannot help whether the barrel holds or not: closing further
  // asks the rod to be shorter, which is the one thing it is refusing to be.
  if (holds.rod) return closedTo(lengths);
  if (holds.barrel) {
    const min = cylinderHeadTravel(lengths.barrel, r).min;
    return closedTo({
      barrel: lengths.barrel,
      rod: Math.max(span - min, cylinderRodFloor(lengths.barrel, r)),
    });
  }
  // Both shrink by the same amount, so only the barrel's floor binds: a rod
  // that started clear of its own floor stays clear of it by the same margin.
  const barrel = solveFor(span, cylinderBarrelFloor(r), lengths.barrel, (candidate) =>
    closedAt({ barrel: candidate, rod: lengths.rod - (lengths.barrel - candidate) })
  );
  return closedTo({ barrel, rod: lengths.rod - (lengths.barrel - barrel) });
}

/**
 * The input in `[low, high]` whose `spanAt` is the one asked for, by bisection.
 *
 * Rearranged, every one of these needs a case per head regime and a test for
 * which one lands — the head is a constant only until the barrel is short
 * enough to follow it down, which is three chances to be subtly wrong at the
 * seams on a path a drag runs every pointermove. Each `spanAt` here is
 * strictly increasing in its input throughout, which is all bisection needs,
 * and sixty halvings land well under the six decimals every coordinate is
 * rounded to. Out of reach at either end, the bound is the answer, and the
 * caller sees it as a span it did not ask for.
 */
function solveFor(span: number, low: number, high: number, spanAt: (at: number) => number): number {
  if (!(high > low)) return low;
  if (spanAt(high) < span) return high;
  let under = low;
  let over = high;
  for (let step = 0; step < 60; step++) {
    const mid = (under + over) / 2;
    if (spanAt(mid) > span) over = mid;
    else under = mid;
  }
  return under;
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
 * only the seal moves, and past either end of it the part resizes as far as the
 * holds allow. The `anchor` mount stays exactly where it is in every case, and
 * collinearity holds by construction: every returned point is on the axis.
 * `lengths` are read — they are what the current travel is measured from, and
 * the whole point of the rule is that a span inside the travel does *not*
 * change them.
 */
export function layoutCylinder(
  barrelMount: { x: number; y: number },
  rodMount: { x: number; y: number },
  /** The members as they stand, which is what the current travel is read from. */
  lengths: CylinderLengths,
  r: number,
  anchor: 'barrel' | 'rod',
  /**
   * The axis direction before this move. A drag that crosses the anchor
   * would otherwise flip the part 180° the instant the direction reverses;
   * with the hint, the crossing clamps at the minimum span on the side the
   * part was already on.
   */
  axisHint?: { x: number; y: number },
  holds: CylinderHolds = {}
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

  const fit = cylinderSpanLayout(distance, lengths, r, holds);
  const from =
    anchor === 'barrel'
      ? { x: barrelMount.x, y: barrelMount.y }
      : { x: rodMount.x - fit.span * ux, y: rodMount.y - fit.span * uy };
  const pose = cylinderPoseAlong(from, { x: ux, y: uy }, fit.lengths, fit.along, fit.atMinimum);
  // The anchor is written back rather than derived. It is the one point this
  // layout promises not to move, and a promise kept to within a rounding error
  // is a mount that creeps a little further every pointermove.
  return anchor === 'rod' ? { ...pose, mountB: { x: rodMount.x, y: rodMount.y } } : pose;
}

/** The size and position a built cylinder currently has, read back off its joints. */
export function cylinderSizeOf(
  cylinder: Cylinder,
  r: number = 0.15 * SettingsService.objectScale
): CylinderSize {
  return cylinderSizeAt(cylinder.mountA, cylinder.inner, cylinder.seal, cylinder.mountB, r);
}

/** The two members a built cylinder currently has, read back off its joints. */
export function cylinderLengthsOf(cylinder: Cylinder): CylinderLengths {
  const { mountA, inner, seal, mountB } = cylinder;
  return {
    barrel: Math.hypot(inner.x - mountA.x, inner.y - mountA.y),
    rod: Math.hypot(mountB.x - seal.x, mountB.y - seal.y),
  };
}

export interface CylinderSize {
  stroke: number;
  start: number;
  span: number;
  barrelLength: number;
  rodLength: number;
}

/**
 * The same reading, from the four points it is actually made of.
 *
 * Split out so the record's own `start` getter and the panel's `cylinderSizeOf`
 * cannot drift: a getter that re-derived the clamp and the travel interval for
 * itself would be a second answer to a question with one answer.
 *
 * *Starts at* is read from the seal's place along the barrel, not from the span
 * (decision S3). The two are the same number while the rod is the barrel, and
 * the span reading is the one that stops being true the moment they differ: it
 * subtracts the *barrel* where it means to subtract the rod, so lengthening the
 * rod would have moved the reported position of a seal that had not moved.
 */
function cylinderSizeAt(
  mountA: { x: number; y: number },
  inner: { x: number; y: number },
  seal: { x: number; y: number },
  mountB: { x: number; y: number },
  r: number = 0.15 * SettingsService.objectScale
): CylinderSize {
  const barrelLength = Math.hypot(inner.x - mountA.x, inner.y - mountA.y);
  const rodLength = Math.hypot(mountB.x - seal.x, mountB.y - seal.y);
  const along = Math.hypot(seal.x - mountA.x, seal.y - mountA.y);
  const span = Math.hypot(mountB.x - mountA.x, mountB.y - mountA.y);
  // Through the travel interval, not the raw subtraction: a barrel can be long
  // enough to leave a sliver over the bore and still have no *usable* stroke,
  // and reporting that sliver put the panel at odds with the solver -- Travel
  // saying 0.05 cm beside a mechanism saying the ram has no travel at all.
  const travel = cylinderStrokeAlong(barrelLength, r);
  const stroke = travel.usable ? travel.max - travel.min : 0;
  return {
    stroke,
    start: stroke > 0 ? Math.min(Math.max((along - travel.min) / stroke, 0), 1) : 0,
    span,
    barrelLength,
    rodLength,
  };
}
