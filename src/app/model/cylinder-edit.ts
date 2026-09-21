/**
 * What each edit of a cylinder asks for: a pose, or a reason it cannot have one.
 *
 * Every field in the cylinder's panel and every gesture on the part resolves to
 * the same four points on one axis, so the arithmetic for all of them lives
 * here and nothing touches a Joint. `GridUtilsService` turns an answer into a
 * transaction (`runEdit`) and says anything that needs saying; this file
 * decides what the answer is.
 *
 * **What gives is one ladder, written once** (decision S17). A cylinder has
 * more ways to satisfy a number than it has freedoms, so something has to give,
 * and the order is a statement about what the reader has said out loud:
 *
 * 1. a **locked** item never moves — a Lock mark on a joint, a bar elsewhere
 *    whose hold reaches it, a member fixed at its length;
 * 2. the **number they just typed or dragged** is honored, and is refused only
 *    when those locks leave no way to honor it;
 * 3. a **grounded** joint is where the frame happens to be pinned, so it yields
 *    before anything the reader sized;
 * 4. a **floating** joint is the cheapest thing in the drawing, so it goes
 *    first.
 *
 * Read as rungs, that is `whatGives`: a floating end joint, then the seal when
 * this edit left it free, then a grounded end joint, then the other member's
 * length, then nothing. The five `poseFor…` functions all climb it rather than
 * each restating an order of their own, which is why they cannot disagree about
 * a drawing.
 *
 * **A structural limit is repaired, not refused.** A rod shorter than the
 * travel would be swallowed on the way closed and a barrel too short no longer
 * reaches where the head stands — both are real, and both are somebody's
 * arithmetic rather than somebody's decision. So the *other*, unfixed member
 * takes the smallest change that makes the typed number legal, and the head
 * goes to the nearer stop. Those repairs are not rungs: no joint move can fix
 * either of them, so they happen before the ladder is climbed at all.
 *
 * **A number that cannot be fully honored is honored as far as it goes**
 * (decision S19). The value the part already has is always reachable — it is
 * the identity — and the values the ladder can honor form an interval
 * containing it, so `asCloseAs` searches the segment from here to the number
 * typed and lands on the furthest point that works. The answer is an ordinary
 * success carrying a `stoppedBy`, which says how far it got and what stopped
 * it; the caller says so out loud. A refusal, which changes nothing, is left
 * for the case where **none** of the request can be honored.
 *
 * **A refusal changes nothing.** Not "moves what it can": a half-applied edit
 * of a part whose whole point is that its four joints agree leaves a drawing
 * the reader has to repair by hand, and the number they typed is still in the
 * field to try again with.
 */

import { Joint } from './joint';
import { Link } from './link';
import {
  Cylinder,
  CylinderHolds,
  CylinderLengths,
  CylinderPose,
  HEAD_CLEARANCE_R,
  cylinderBarrelFloor,
  cylinderHeadTravel,
  cylinderLengthsOf,
  cylinderPoseAlong,
  cylinderRodFloor,
  cylinderStrokeAlong,
} from './cylinder';

export interface CylinderRefusal {
  code: string;
  short: string;
  /**
   * What blocked it, lowercase and unpunctuated, so it can sit in the middle
   * of another sentence — which is exactly where a `stoppedBy` notice puts it.
   * `long` is this plus what to do about it.
   */
  cause: string;
  long: string;
  /**
   * True when the caller should say nothing at all.
   *
   * A pointer-move asks this file a question sixty times a second, and a drag
   * that has run out of room is not news — a part held at its shortest has
   * always simply stopped following the cursor. Only a *typed* edit, which the
   * reader made once and deliberately, is worth a notification.
   */
  silent?: boolean;
}

/**
 * An edit that landed, but not on the number that was typed (decision S19).
 *
 * The part went as far toward it as the locks and the fixed lengths allow, and
 * this is what the caller needs to say so: the value reached, in the terms the
 * reader typed it in, and the blocker worded the way a refusal words it. The
 * *subject* and the units are the caller's — only it knows which field was
 * typed and what a length reads as on screen.
 */
export interface CylinderStop {
  code: string;
  short: string;
  cause: string;
  /** The value actually reached, in whatever the typed number was measured in. */
  reached: number;
}

export type CylinderEdit =
  | { ok: true; pose: CylinderPose; stoppedBy?: CylinderStop }
  | { ok: false; refusal: CylinderRefusal };

/**
 * What an end joint of a cylinder may do, in the ladder's own three words.
 *
 * `locked` covers both ways a joint can be pinned: a Lock mark on it, and a
 * bar elsewhere in the drawing holding a length or an angle that reaches it.
 * They are one state because the ladder asks one question of an end — *can
 * this move* — and folding them together is what lets the **other** end be
 * tried before anything is refused.
 */
export type CylinderEndState = 'floating' | 'grounded' | 'locked';

/** What an edit needs to know about the drawing around the part. */
export interface CylinderEditContext {
  /** The joint radius every layout is measured in: 0.15 object scales. */
  r: number;
  /** Whether this joint is bolted to the frame. */
  isGrounded: (joint: Joint) => boolean;
  /** Whether a Lock mark holds this joint exactly where it is. */
  isLocked: (joint: Joint) => boolean;
  /** Which members are keeping their length (decision S5). */
  holds: CylinderHolds;
  /**
   * Why a held bar refuses to let this joint be displaced, already worded.
   *
   * Conservative on purpose: a bar holding its length or angle somewhere out
   * in the drawing would have to *deform* for the cylinder to reach the number
   * asked for, and there is no honest way to choose which of the two the reader
   * meant. Saying which hold is in the way costs one sentence and leaves them
   * the choice. The cylinder's own angle hold is not one of these — an edit
   * along the axis keeps the angle, and a typed angle becomes the held number.
   */
  heldBy?: (displaced: Joint[]) => string | undefined;
  /**
   * Why these members' fixed lengths are in the way, already worded.
   *
   * The twin of `heldBy` for the two bars the part is made of. `holds` says
   * *that* a member is fixed, which is all the arithmetic needs; naming it
   * takes the member's visible name, and only the caller knows that — a
   * barrel's own id holds N, the joint the drawing never shows.
   */
  fixedBy?: (members: Link[]) => string | undefined;
}

/**
 * The four things a cylinder edit may change, and the seal it may slide.
 *
 * Not "the four joints": N and S are derived and go wherever the pose puts
 * them, and the whole part being locked is a mark on S that freezes all four,
 * so it arrives here as both ends being `locked`.
 */
export type CylinderGive = 'joint-b' | 'joint-a' | 'seal' | 'rod' | 'barrel';

/** What this edit has left to spend: what each end may do, and what may resize. */
export interface CylinderFreedom {
  /** A — the barrel's outer end. */
  a: CylinderEndState;
  /** B — the rod's outer end. */
  b: CylinderEndState;
  /** True when where the seal stands is still this edit's to choose. */
  seal: boolean;
  /** True when the barrel may be given a new length: not fixed, and not typed. */
  barrel: boolean;
  /** True when the rod may be given a new length: not fixed, and not typed. */
  rod: boolean;
}

/**
 * The ladder, in one place: what this edit may give, in the order to try it.
 *
 * The rod's end joint before the barrel's on both joint rungs, because the rod
 * is the end a cylinder pushes with and D11 has always moved it first.
 *
 * **A grounded joint yields before a length does.** D11 had it the other way,
 * and the maintainer reversed it on September 20, 2026 after driving it: a
 * length is a number the reader chose and typed, and ground is only where the
 * frame happens to be pinned. So a cylinder with both ends grounded *expands
 * and contracts* to satisfy a typed extension instead of quietly resizing a
 * member — and a member changes length only when there is no end joint left
 * that is allowed to move at all.
 */
export function whatGives(freedom: CylinderFreedom): CylinderGive[] {
  const when = (allowed: boolean, give: CylinderGive): CylinderGive[] => (allowed ? [give] : []);
  const ends = (state: CylinderEndState): CylinderGive[] => [
    ...when(freedom.b === state, 'joint-b'),
    ...when(freedom.a === state, 'joint-a'),
  ];
  return [
    ...ends('floating'),
    ...when(freedom.seal, 'seal'),
    ...ends('grounded'),
    ...when(freedom.rod, 'rod'),
    ...when(freedom.barrel, 'barrel'),
  ];
}

const ANGLE = 'cylinder.angle-refused';
const START = 'cylinder.start-refused';
const BARREL = 'cylinder.barrel-length-refused';
const ROD = 'cylinder.rod-length-refused';
const SEAL = 'cylinder.seal-refused';

/** The same three edits again, for the notice that says how far one did get. */
const START_SHORT = 'cylinder.start-stopped-short';
const BARREL_SHORT = 'cylinder.barrel-length-stopped-short';
const ROD_SHORT = 'cylinder.rod-length-stopped-short';

/**
 * How far two lengths may differ and still be one length.
 *
 * Every coordinate the app writes is rounded to six decimals, so this is three
 * orders below anything a drawing can express. It exists because a floor is a
 * *sum* and the length compared against it is a *difference*: a rod put exactly
 * on its floor lands an ulp under it, and a rung that read that as too short
 * would refuse the very number the repair above it had just chosen.
 */
const SLACK = 1e-9;

/** A sentence somebody else worded, folded into the middle of one of ours. */
function clause(said: string): string {
  return `${said.charAt(0).toLowerCase()}${said.slice(1)}`;
}

/** "a, b and c" — the way `holdList` says a list, for causes rather than holds. */
function listOf(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * A refusal, from the blocker and what to do about it.
 *
 * The two are kept apart because a *stopped-short* notice wants the blocker
 * alone — "Barrel AC stopped at 3.29 cm: held by fixed length Rod CB…" — while
 * a refusal, which changed nothing, wants the way out as well.
 */
function refuse(
  code: string,
  short: string,
  cause: string,
  advice: string,
  silent?: boolean
): CylinderEdit {
  const said = `${cause.charAt(0).toUpperCase()}${cause.slice(1)}.`;
  return {
    ok: false,
    refusal: { code, short, cause, long: advice ? `${said} ${advice}` : said, silent },
  };
}

/** The part read in its own terms: one axis, two lengths, and a place along it. */
interface CylinderFrame {
  /** Unit A→B. */
  axis: { x: number; y: number };
  lengths: CylinderLengths;
  /** |AS| — where the seal stands along the barrel. */
  along: number;
  /** |AB|. */
  span: number;
  /** The two ends of the seal's travel, measured from A. */
  travel: { min: number; max: number };
}

function frameOf(cylinder: Cylinder, r: number): CylinderFrame | undefined {
  const { mountA, mountB, seal } = cylinder;
  const dx = mountB.x - mountA.x;
  const dy = mountB.y - mountA.y;
  const span = Math.hypot(dx, dy);
  if (!(span > 1e-9)) return undefined;
  const axis = { x: dx / span, y: dy / span };
  const lengths = cylinderLengthsOf(cylinder);
  const travel = cylinderStrokeAlong(lengths.barrel, r);
  if (!travel.usable) return undefined;
  return {
    axis,
    lengths,
    // Projected rather than measured, so a part a rounding error has left a
    // hair off its own axis still reads as standing somewhere on it.
    along: (seal.x - mountA.x) * axis.x + (seal.y - mountA.y) * axis.y,
    span,
    travel: { min: travel.min, max: travel.max },
  };
}

/** The part has no axis, or no travel — nothing below can say anything about it. */
function unreadable(code: string, silent?: boolean): CylinderEdit {
  return refuse(
    code,
    'the cylinder is not built',
    'this cylinder has no travel to read: its two joints are at the same point, or its barrel is too short to slide in',
    'Drag a joint apart first.',
    silent
  );
}

/** One end of the part, as the ladder reads it, with the reason when it is held. */
interface CylinderEnd {
  joint: Joint;
  state: CylinderEndState;
  /** The sentence, when a fixed bar elsewhere is what holds it. */
  held?: string;
}

interface CylinderEnds {
  a: CylinderEnd;
  b: CylinderEnd;
}

/**
 * Read both end joints: locked, grounded or floating, and why.
 *
 * A Lock is asked first because it is the cheap question and the plainer
 * answer; `heldBy` walks the drawing looking for a bar whose hold reaches this
 * joint, and there is no point paying for that about a joint already pinned.
 */
function endsOf(cylinder: Cylinder, context: CylinderEditContext): CylinderEnds {
  const read = (joint: Joint): CylinderEnd => {
    if (context.isLocked(joint)) return { joint, state: 'locked' };
    const held = context.heldBy?.([joint]);
    if (held) return { joint, state: 'locked', held };
    return { joint, state: context.isGrounded(joint) ? 'grounded' : 'floating' };
  };
  return { a: read(cylinder.mountA), b: read(cylinder.mountB) };
}

/** What this edit may spend, from the ends it read and the number it was given. */
function freedomOf(
  ends: CylinderEnds,
  context: CylinderEditContext,
  options: { seal?: boolean; typed?: 'barrel' | 'rod' }
): CylinderFreedom {
  return {
    a: ends.a.state,
    b: ends.b.state,
    seal: options.seal === true,
    // Typing into a field that is itself fixed makes the typed number the new
    // fixed number, the way every padlocked field in the app behaves. It is
    // the *other* constraint that can refuse, so the typed member is out of
    // the ladder rather than in it as something that may change again.
    barrel: !context.holds.barrel && options.typed !== 'barrel',
    rod: !context.holds.rod && options.typed !== 'rod',
  };
}

/** The members whose fixed length this edit could not spend, for a refusal to name. */
function fixedMembers(
  cylinder: Cylinder,
  context: CylinderEditContext,
  typed?: 'barrel' | 'rod'
): Link[] {
  return [
    context.holds.barrel && typed !== 'barrel' ? cylinder.barrel : undefined,
    context.holds.rod && typed !== 'rod' ? cylinder.rod : undefined,
  ].filter((member): member is Link => member !== undefined);
}

/** A member's fixed length, worded lowercase so it can sit mid-sentence. */
function fixedClause(members: Link[], context: CylinderEditContext, fallback: string): string {
  const said = context.fixedBy?.(members);
  return said ? clause(said) : fallback;
}

/**
 * The bottom of the ladder: nothing is left, and the refusal names what holds
 * it.
 *
 * Only reachable with **both** end joints held. Moving an end joint is the one
 * rung that never fails — the pose is simply measured from the other end — so
 * a drawing with a single floating or grounded joint in it always has an
 * answer, and this sentence is never the one a reader with an ordinary
 * cylinder sees.
 */
function refuseNothingLeft(
  code: string,
  ends: CylinderEnds,
  members: Link[],
  context: CylinderEditContext,
  advice: string,
  silent?: boolean
): CylinderEdit {
  const named = (joint: Joint) => joint.name || joint.id;
  const held: string[] = [];
  for (const end of [ends.a, ends.b]) {
    if (end.state !== 'locked') continue;
    held.push(end.held ? clause(end.held) : `joint ${named(end.joint)} is locked`);
  }
  const lengths =
    members.length > 0
      ? fixedClause(members, context, 'a member is fixed at its length')
      : undefined;
  const cause = `${listOf(held)}${lengths ? `, and ${lengths}` : ''}`;
  return refuse(code, 'nothing is free to move', cause, advice, silent);
}

const MOVE_ADVICE = 'Unlock a joint, or release a fixed length.';
const MOVE_TAIL = `There is nothing left for this edit to move — ${clause(MOVE_ADVICE)}`;

/** One way to satisfy the number: which lengths, where the seal stands, and what holds still. */
interface Landing {
  lengths: CylinderLengths;
  along: number;
  /** The end this pose is measured from, which is the end that does not move. */
  from: 'a' | 'b';
}

function poseOf(cylinder: Cylinder, frame: CylinderFrame, landing: Landing): CylinderPose {
  const { axis } = frame;
  const reach = landing.along + landing.lengths.rod;
  const from =
    landing.from === 'a'
      ? { x: cylinder.mountA.x, y: cylinder.mountA.y }
      : { x: cylinder.mountB.x - reach * axis.x, y: cylinder.mountB.y - reach * axis.y };
  return cylinderPoseAlong(from, axis, landing.lengths, landing.along);
}

/** Slide the seal alone: both end joints keep their place, both members their length. */
function sealSlid(frame: CylinderFrame, lengths: CylinderLengths, r: number): Landing | undefined {
  const along = frame.span - lengths.rod;
  const travel = cylinderHeadTravel(lengths.barrel, r);
  if (along < travel.min - SLACK || along > travel.max + SLACK) return undefined;
  return { lengths, along, from: 'a' };
}

/** Let the rod reach: both end joints keep their place and the seal stands where asked. */
function rodStretched(
  frame: CylinderFrame,
  lengths: CylinderLengths,
  along: number,
  r: number
): Landing | undefined {
  const rod = frame.span - along;
  if (!(rod > 0) || rod < cylinderRodFloor(lengths.barrel, r) - SLACK) return undefined;
  return { lengths: { barrel: lengths.barrel, rod }, along, from: 'a' };
}

/**
 * Climb the ladder and take the first rung that works.
 *
 * `barrelRung` is the one rung whose arithmetic differs per edit, because what
 * a new barrel has to satisfy depends on what was asked for: *Starts at* wants
 * the share of a travel the barrel itself sets, and Rod Length wants a travel
 * that simply contains a place already settled by the span.
 */
function climb(
  cylinder: Cylinder,
  frame: CylinderFrame,
  freedom: CylinderFreedom,
  lengths: CylinderLengths,
  along: number,
  r: number,
  barrelRung: (() => Landing | undefined) | undefined,
  refusal: () => CylinderEdit
): CylinderEdit {
  // Nothing has to give when the part already spans exactly that far: both end
  // joints and the seal stay, and only the buried end follows the new barrel.
  // Asked before the ladder because a rung is a thing that *moves*, and a
  // locked joint that does not move is not an obstacle to anything.
  if (Math.abs(along + lengths.rod - frame.span) < SLACK) {
    return { ok: true, pose: poseOf(cylinder, frame, { lengths, along, from: 'a' }) };
  }
  const landingFor = (give: CylinderGive): Landing | undefined => {
    switch (give) {
      case 'joint-b':
        return { lengths, along, from: 'a' };
      case 'joint-a':
        return { lengths, along, from: 'b' };
      case 'seal':
        return sealSlid(frame, lengths, r);
      case 'rod':
        return rodStretched(frame, lengths, along, r);
      case 'barrel':
        return barrelRung?.();
    }
  };
  for (const give of whatGives(freedom)) {
    const landing = landingFor(give);
    if (landing) return { ok: true, pose: poseOf(cylinder, frame, landing) };
  }
  return refusal();
}

// ------------------------------------------------ as close as it can get (S19)

/**
 * Go as far toward the typed number as the constraints allow, and say what
 * stopped it.
 *
 * One mechanism rather than a clamp per refusal. The value the part already has
 * is always reachable — asking for it is the identity — and the values the
 * ladder can honor form an interval containing it, so the furthest reachable
 * point on the segment from here to there is what the reader actually asked
 * for, minus whatever is in the way. Only when that furthest point is where we
 * started does the refusal stand, because then none of the request can be had.
 */
function asCloseAs(
  from: number,
  to: number,
  hints: number[],
  stoppedCode: string,
  at: (value: number) => CylinderEdit
): CylinderEdit {
  const full = at(to);
  if (full.ok) return full;
  const reached = furthestReachable(from, to, hints, at);
  if (!reached) return full;
  return {
    ok: true,
    pose: reached.pose,
    stoppedBy: {
      code: stoppedCode,
      short: full.refusal.short,
      cause: full.refusal.cause,
      reached: reached.value,
    },
  };
}

/**
 * The furthest value between the one the part has and the one that was typed
 * that the whole ladder still honors.
 *
 * `hints` are the closed-form boundaries this edit knows about — `rod +
 * clearance` for a barrel against a fixed rod, the barrel's floor, the rod's
 * own floor. They are tried before the bisection so the answer lands *on* a
 * boundary rather than within a rounding of it; each is only a lower bound for
 * the search, so a wrong guess costs one evaluation and nothing else.
 */
function furthestReachable(
  from: number,
  to: number,
  hints: number[],
  at: (value: number) => CylinderEdit
): { value: number; pose: CylinderPose } | undefined {
  const standing = at(from);
  if (!standing.ok) return undefined;
  let value = from;
  let pose = standing.pose;
  const low = Math.min(from, to);
  const high = Math.max(from, to);
  const ordered = hints
    .filter((hint) => hint > low && hint < high)
    .sort((one, other) => Math.abs(other - from) - Math.abs(one - from));
  let exact: { value: number; pose: CylinderPose } | undefined;
  for (const hint of ordered) {
    const tried = at(hint);
    if (tried.ok) {
      exact = { value: hint, pose: tried.pose };
      value = hint;
      pose = tried.pose;
      break;
    }
  }
  let under = value;
  let over = to;
  for (let step = 0; step < 60; step++) {
    const mid = (under + over) / 2;
    const tried = at(mid);
    if (tried.ok) {
      under = mid;
      value = mid;
      pose = tried.pose;
    } else {
      over = mid;
    }
  }
  // Every rung accepts a value within `SLACK` of its own floor, so the search
  // converges on that floor plus or minus exactly one of them — a last
  // rounding walked past a boundary the closed form had landed on. Where the
  // two agree the closed form is the answer: the tolerance is there to keep an
  // ulp from refusing a legal number, not to creep into the number the reader
  // is shown. Twice `SLACK`, because comparing the two costs a rounding of its
  // own.
  if (exact && Math.abs(value - exact.value) <= 2 * SLACK) return exact;
  return Math.abs(value - from) < SLACK ? undefined : { value, pose };
}

/**
 * Turn the whole part to a bearing (decision D10, on S17's ladder).
 *
 * One angle for the barrel, the rod and the slide, because there is only one
 * direction a cylinder points in. Which joint it turns about is the ladder read
 * for a rotation: with both ends floating it turns about the seal, so both
 * swing the same amount; with one end unable to move — grounded or held — that
 * end is the pivot and the other swings; with both grounded the *typed number*
 * outranks a grounded joint, so it turns about A and B goes where the bearing
 * puts it. Only two locked joints leave no bearing to be had.
 *
 * The one edit S19's "as far as it can get" does not apply to: every bearing
 * but the one the part already has displaces at least one end joint, so with
 * both of them locked the reachable set is the single angle it is standing at
 * and there is nothing between here and there to reach.
 */
export function poseForCylinderAngle(
  cylinder: Cylinder,
  angleRad: number,
  context: CylinderEditContext
): CylinderEdit {
  const frame = frameOf(cylinder, context.r);
  if (!frame) return unreadable(ANGLE);
  const turn = angleRad - Math.atan2(frame.axis.y, frame.axis.x);
  const turning = Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn))) > 1e-12;
  const ends = endsOf(cylinder, context);
  // A number that is the bearing the part already has moves nothing, so no
  // lock and no held bar has anything to say about it.
  const pivot = turning ? pivotFor(cylinder, ends) : cylinder.seal;
  if (!pivot) {
    return refuseNothingLeft(
      ANGLE,
      ends,
      [],
      context,
      'There is nothing left to turn this cylinder about — unlock one of its joints.'
    );
  }
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const mountA = {
    x: pivot.x + (cylinder.mountA.x - pivot.x) * cos - (cylinder.mountA.y - pivot.y) * sin,
    y: pivot.y + (cylinder.mountA.x - pivot.x) * sin + (cylinder.mountA.y - pivot.y) * cos,
  };
  return {
    ok: true,
    pose: cylinderPoseAlong(
      mountA,
      { x: Math.cos(angleRad), y: Math.sin(angleRad) },
      frame.lengths,
      frame.along
    ),
  };
}

/** The joint a turn happens about, which is the ladder asked about a rotation. */
function pivotFor(cylinder: Cylinder, ends: CylinderEnds): Joint | undefined {
  const floating = (end: CylinderEnd) => end.state === 'floating';
  if (floating(ends.a) && floating(ends.b)) return cylinder.seal;
  if (floating(ends.a)) return cylinder.mountB;
  if (floating(ends.b)) return cylinder.mountA;
  if (ends.a.state === 'locked' && ends.b.state === 'locked') return undefined;
  if (ends.a.state === 'locked') return cylinder.mountA;
  if (ends.b.state === 'locked') return cylinder.mountB;
  // Both grounded. The typed number outranks a grounded joint, and A is the end
  // the whole part is measured from, so B is the one that swings.
  return cylinder.mountA;
}

/**
 * Put the seal at a share of its travel: *Starts at* (decisions D11, S17).
 *
 * The rod's end joint moves out by default, because that is the end a cylinder
 * pushes with; with that end held the barrel's end moves instead; with both
 * ends grounded the part **expands or contracts** rather than resizing a member
 * the reader sized; and only with both ends locked does a length change.
 */
export function poseForCylinderStart(
  cylinder: Cylinder,
  start: number,
  context: CylinderEditContext
): CylinderEdit {
  const frame = frameOf(cylinder, context.r);
  if (!frame) return unreadable(START);
  const stroke = frame.travel.max - frame.travel.min;
  const standing = stroke > 0 ? (frame.along - frame.travel.min) / stroke : 0;
  const at = (share: number) => startAtShare(cylinder, frame, share, context, START);
  return asCloseAs(
    Math.min(Math.max(standing, 0), 1),
    Math.min(Math.max(start, 0), 1),
    // The share at which the rod sits exactly on its own floor, which is what
    // stops a part with both ends locked from opening any further.
    stroke > 0
      ? [
          (frame.span - cylinderRodFloor(frame.lengths.barrel, context.r) - frame.travel.min) /
            stroke,
        ]
      : [],
    START_SHORT,
    at
  );
}

/**
 * Follow the seal along the axis: *Starts at* by hand (decision S7, on S17's
 * ladder).
 *
 * The same ladder as the field, with the pointer projected onto the axis and
 * clamped to the stops, and every answer silent. S7 used to add that a drag
 * never changes a length, so a part with both ends bolted down simply did not
 * follow the cursor; the maintainer's rule supersedes that, and with both ends
 * grounded the part now expands and contracts under the pointer.
 *
 * What it does *not* do is S19's search: a drag already clamps at a stop and
 * says nothing about it, which is the same promise made continuously rather
 * than once. A typed number is a considered request worth partly honoring with
 * an explanation; sixty of them a second is a gesture that has stopped
 * following the cursor.
 */
export function poseForSealAt(
  cylinder: Cylinder,
  wanted: { x: number; y: number },
  context: CylinderEditContext
): CylinderEdit {
  const frame = frameOf(cylinder, context.r);
  if (!frame) return unreadable(SEAL, true);
  const projected =
    (wanted.x - cylinder.mountA.x) * frame.axis.x + (wanted.y - cylinder.mountA.y) * frame.axis.y;
  const along = Math.min(Math.max(projected, frame.travel.min), frame.travel.max);
  if (Math.abs(along - frame.along) < SLACK) {
    return refuse(
      SEAL,
      'already there',
      'the cylinder is already at that point of its travel',
      '',
      true
    );
  }
  const stroke = frame.travel.max - frame.travel.min;
  const at = stroke > 0 ? (along - frame.travel.min) / stroke : 0;
  return startAtShare(cylinder, frame, at, context, SEAL, true);
}

/** *Starts at* and a drag of the seal, which are one ladder with two doors. */
function startAtShare(
  cylinder: Cylinder,
  frame: CylinderFrame,
  at: number,
  context: CylinderEditContext,
  code: string,
  silent?: boolean
): CylinderEdit {
  const { r } = context;
  const lengths = frame.lengths;
  const along = frame.travel.min + at * (frame.travel.max - frame.travel.min);
  const ends = endsOf(cylinder, context);
  // The seal is what was asked for here, so it is not among the things that
  // may give — every rung below puts it exactly where the share says.
  const freedom = freedomOf(ends, context, {});
  return climb(
    cylinder,
    frame,
    freedom,
    lengths,
    along,
    r,
    () => barrelForShare(frame, at, r),
    () => refuseNothingLeft(code, ends, fixedMembers(cylinder, context), context, MOVE_TAIL, silent)
  );
}

/**
 * The barrel that puts the seal at this share of its own travel with both end
 * joints kept.
 *
 * Solved rather than subtracted, because changing the barrel changes the very
 * scale the share is a share of. `min(Lb) + at × stroke(Lb)` rises with the
 * barrel throughout, so bisection finds the one barrel that lands the seal
 * where the span already needs it.
 */
function barrelForShare(frame: CylinderFrame, at: number, r: number): Landing | undefined {
  const wanted = frame.span - frame.lengths.rod;
  // The raw interval, not the guarded one: the search starts at the barrel
  // floor, where the guard fires on a rounding error and hands back a
  // collapsed point that would make the low end of the bracket meaningless.
  const alongFor = (barrel: number) => {
    const travel = cylinderHeadTravel(barrel, r);
    return travel.min + at * (travel.max - travel.min);
  };
  const floor = cylinderBarrelFloor(r);
  const ceiling = frame.lengths.rod + HEAD_CLEARANCE_R * r;
  if (ceiling < floor || alongFor(floor) > wanted || alongFor(ceiling) < wanted) return undefined;
  let low = floor;
  let high = ceiling;
  for (let step = 0; step < 60; step++) {
    const mid = (low + high) / 2;
    if (alongFor(mid) > wanted) high = mid;
    else low = mid;
  }
  return { lengths: { barrel: low, rod: frame.lengths.rod }, along: wanted, from: 'a' };
}

/**
 * Give the barrel a length: the buried end moves, and the travel with it
 * (decision S6, on S17's ladder).
 *
 * Two structural limits are repaired rather than refused. A barrel with more
 * travel than the rod is long would pull the rod's joint inside the mouth on
 * the way closed, so the rod grows to exactly that travel — the smallest
 * change that makes the typed number legal. And a barrel that no longer
 * reaches where the head stands puts the head on its nearer stop, after which
 * the ladder decides who follows it. Whatever the typed number still cannot
 * have, S19's search takes as much of as it can.
 */
export function poseForBarrelLength(
  cylinder: Cylinder,
  barrelLength: number,
  context: CylinderEditContext
): CylinderEdit {
  const frame = frameOf(cylinder, context.r);
  if (!frame) return unreadable(BARREL);
  const { r } = context;
  return asCloseAs(
    frame.lengths.barrel,
    barrelLength,
    [
      // The shortest barrel with room to slide in, and the longest one a rod
      // keeping its length allows.
      cylinderBarrelFloor(r),
      frame.lengths.rod + HEAD_CLEARANCE_R * r,
    ],
    BARREL_SHORT,
    (length) => barrelAt(cylinder, frame, length, context)
  );
}

function barrelAt(
  cylinder: Cylinder,
  frame: CylinderFrame,
  barrelLength: number,
  context: CylinderEditContext
): CylinderEdit {
  const { r } = context;
  const travel = cylinderStrokeAlong(barrelLength, r);
  if (barrelLength < cylinderBarrelFloor(r) || !travel.usable) {
    return refuse(
      BARREL,
      'no room to slide',
      'a barrel that short has no travel left in it',
      'Make it longer, or delete the cylinder and draw a smaller one.'
    );
  }
  let rod = frame.lengths.rod;
  const floor = cylinderRodFloor(barrelLength, r);
  if (rod < floor - SLACK) {
    if (context.holds.rod) {
      return refuse(
        BARREL,
        'the rod is fixed at its length',
        `${fixedClause([cylinder.rod], context, 'the rod is fixed at its length')}, and a longer barrel would have more travel than the rod is long`,
        'Release it, or choose a shorter barrel.'
      );
    }
    rod = floor;
  }
  const along = Math.min(Math.max(frame.along, travel.min), travel.max);
  const ends = endsOf(cylinder, context);
  const freedom = freedomOf(ends, context, { typed: 'barrel' });
  return climb(cylinder, frame, freedom, { barrel: barrelLength, rod }, along, r, undefined, () =>
    refuseNothingLeft(BARREL, ends, fixedMembers(cylinder, context, 'barrel'), context, MOVE_TAIL)
  );
}

/**
 * Give the rod a length: the rod's end joint moves, unless something holds it
 * (decision S6, on S17's ladder).
 *
 * The rod's own floor is the travel — a rod shorter than that would be
 * swallowed on the way closed — and it is repaired rather than refused: the
 * barrel shortens to the longest one this rod allows, which is `rod +
 * clearance` and therefore a change of exactly the deficit. Only two things
 * can still stop that: the barrel keeping its length, and a rod so short that
 * no barrel is left with room to slide in — and S19 takes the typed number as
 * far toward either wall as it goes.
 */
export function poseForRodLength(
  cylinder: Cylinder,
  rodLength: number,
  context: CylinderEditContext
): CylinderEdit {
  const frame = frameOf(cylinder, context.r);
  if (!frame) return unreadable(ROD);
  const { r } = context;
  return asCloseAs(
    frame.lengths.rod,
    rodLength,
    [
      // The shortest rod a barrel keeping its length allows, and the shortest
      // one that leaves any barrel at all with room to slide in.
      cylinderRodFloor(frame.lengths.barrel, r),
      cylinderBarrelFloor(r) - HEAD_CLEARANCE_R * r,
    ],
    ROD_SHORT,
    (length) => rodAt(cylinder, frame, length, context)
  );
}

function rodAt(
  cylinder: Cylinder,
  frame: CylinderFrame,
  rodLength: number,
  context: CylinderEditContext
): CylinderEdit {
  const { r } = context;
  let barrel = frame.lengths.barrel;
  if (rodLength < cylinderRodFloor(barrel, r) - SLACK) {
    if (context.holds.barrel) {
      return refuse(
        ROD,
        'the barrel is fixed at its length',
        `${fixedClause([cylinder.barrel], context, 'the barrel is fixed at its length')}, and a shorter rod would be pulled inside the barrel on the way closed`,
        'Release it, or give the rod at least the barrel’s travel.'
      );
    }
    const shortened = rodLength + HEAD_CLEARANCE_R * r;
    if (shortened < cylinderBarrelFloor(r) || !cylinderStrokeAlong(shortened, r).usable) {
      return refuse(
        ROD,
        'too short for any cylinder',
        'a rod that short leaves no barrel with room to slide in',
        'Give it a longer length.'
      );
    }
    barrel = shortened;
  }
  const lengths = { barrel, rod: rodLength };
  // A barrel the repair shortened has less travel than it had, so the head may
  // now stand outside it. It goes to the nearer stop, and the ladder below
  // decides what follows it.
  const travel = cylinderHeadTravel(barrel, r);
  const along = Math.min(Math.max(frame.along, travel.min), travel.max);
  const ends = endsOf(cylinder, context);
  // The seal is free here, and sliding it costs nothing at all — neither end
  // joint moves and neither length changes — so it is tried before any joint
  // is asked to move. This is what the both-grounded branch has always done.
  const freedom = freedomOf(ends, context, { seal: true, typed: 'rod' });
  return climb(
    cylinder,
    frame,
    freedom,
    lengths,
    along,
    r,
    () => barrelHolding(frame, rodLength, r),
    () => refuseNothingLeft(ROD, ends, fixedMembers(cylinder, context, 'rod'), context, MOVE_TAIL)
  );
}

/**
 * The barrel closest to the one the part has whose travel holds the seal where
 * the span puts it, with both end joints kept.
 *
 * Both bounds of the travel rise with the barrel, so the barrels that reach are
 * an interval and the nearest end of it is the smallest change that works. The
 * window is the barrel's own floor up to `rod + clearance`, which is the rod
 * floor read the other way round.
 */
function barrelHolding(frame: CylinderFrame, rod: number, r: number): Landing | undefined {
  const along = frame.span - rod;
  const low = cylinderBarrelFloor(r);
  const high = rod + HEAD_CLEARANCE_R * r;
  if (!(high >= low)) return undefined;
  const least = shortestReaching(along, low, high, r);
  const most = longestClearing(along, low, high, r);
  if (least === undefined || most === undefined || least > most) return undefined;
  const barrel = Math.min(Math.max(frame.lengths.barrel, least), most);
  return { lengths: { barrel, rod }, along, from: 'a' };
}

/** The shortest barrel in the window whose mouth still reaches `along`. */
function shortestReaching(along: number, low: number, high: number, r: number): number | undefined {
  const reach = (barrel: number) => cylinderHeadTravel(barrel, r).max;
  if (reach(high) < along) return undefined;
  if (reach(low) >= along) return low;
  let under = low;
  let over = high;
  for (let step = 0; step < 60; step++) {
    const mid = (under + over) / 2;
    if (reach(mid) >= along) over = mid;
    else under = mid;
  }
  return over;
}

/** The longest barrel in the window that has not already swallowed `along`. */
function longestClearing(along: number, low: number, high: number, r: number): number | undefined {
  const shut = (barrel: number) => cylinderHeadTravel(barrel, r).min;
  if (shut(low) > along) return undefined;
  if (shut(high) <= along) return high;
  let under = low;
  let over = high;
  for (let step = 0; step < 60; step++) {
    const mid = (under + over) / 2;
    if (shut(mid) <= along) under = mid;
    else over = mid;
  }
  return under;
}
