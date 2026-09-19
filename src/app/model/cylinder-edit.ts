/**
 * What each edit of a cylinder asks for: a pose, or a reason it cannot have one.
 *
 * Every field in the cylinder's panel and every gesture on the part resolves to
 * the same four points on one axis, so the arithmetic for all of them lives
 * here and nothing touches a Joint. `GridUtilsService` turns an answer into a
 * transaction (`runEdit`) and shows a refusal; this file decides which one it
 * is.
 *
 * **The tiebreak is one rule, written once** (decision D11). A cylinder has
 * more ways to satisfy a number than it has freedoms, so something has to give,
 * and what gives is decided by what is bolted down: with one joint grounded the
 * free end moves, with both grounded a member's length changes, and with both
 * lengths fixed as well there is nothing left and the edit is refused. *Starts
 * at*, Rod Length and a drag of the seal each read that same ladder rather than
 * restating it, which is why they cannot disagree about a drawing.
 *
 * **A refusal changes nothing.** Not "moves what it can": a half-applied edit
 * of a part whose whole point is that its four joints agree leaves a drawing
 * the reader has to repair by hand, and the number they typed is still in the
 * field to try again with.
 */

import { Joint } from './joint';
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
  cylinderStroke,
  cylinderStrokeAlong,
} from './cylinder';

export interface CylinderRefusal {
  code: string;
  short: string;
  long: string;
  /**
   * True when the caller should say nothing at all.
   *
   * A pointer-move asks this file a question sixty times a second, and a drag
   * that has run out of room is not news — a mount held at its shortest has
   * always simply stopped following the cursor. Only a *typed* edit, which the
   * reader made once and deliberately, is worth a notification.
   */
  silent?: boolean;
}

export type CylinderEdit =
  { ok: true; pose: CylinderPose } | { ok: false; refusal: CylinderRefusal };

/** What an edit needs to know about the drawing around the part. */
export interface CylinderEditContext {
  /** The joint radius every layout is measured in: 0.15 object scales. */
  r: number;
  /** Whether this joint is bolted to the frame. */
  isGrounded: (joint: Joint) => boolean;
  /** Which members are keeping their length (decision S5). */
  holds: CylinderHolds;
  /**
   * Why a held bar refuses to let these joints be displaced, already worded.
   *
   * Conservative on purpose: a bar holding its length or angle somewhere out
   * in the drawing would have to *deform* for the cylinder to reach the number
   * asked for, and there is no honest way to choose which of the two the reader
   * meant. Saying which hold is in the way costs one sentence and leaves them
   * the choice. The cylinder's own angle hold is not one of these — an edit
   * along the axis keeps the angle, and a typed angle becomes the held number.
   */
  heldBy?: (displaced: Joint[]) => string | undefined;
}

const ANGLE = 'cylinder.angle-refused';
const START = 'cylinder.start-refused';
const BARREL = 'cylinder.barrel-length-refused';
const ROD = 'cylinder.rod-length-refused';
const SEAL = 'cylinder.seal-refused';

function refuse(code: string, short: string, long: string, silent?: boolean): CylinderEdit {
  return { ok: false, refusal: { code, short, long, silent } };
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
    'This cylinder has no travel to read: its two joints are at the same point, or its barrel is too short to slide in. Drag a joint apart first.',
    silent
  );
}

/**
 * Turn the whole part to a bearing (decision D10).
 *
 * One angle for the barrel, the rod and the slide, because there is only one
 * direction a cylinder points in. It turns about the seal by default — the
 * middle of the part, so both ends swing the same amount — and about a grounded
 * joint when exactly one is grounded, because that one cannot move. With both
 * grounded the bearing is a fact about the frame rather than a number anyone
 * can type.
 */
export function poseForCylinderAngle(
  cylinder: Cylinder,
  angleRad: number,
  context: CylinderEditContext
): CylinderEdit {
  const frame = frameOf(cylinder, context.r);
  if (!frame) return unreadable(ANGLE);
  const groundedA = context.isGrounded(cylinder.mountA);
  const groundedB = context.isGrounded(cylinder.mountB);
  if (groundedA && groundedB) {
    return refuse(
      ANGLE,
      'both joints are grounded',
      'Both of this cylinder’s joints are grounded, so the direction it points in is settled by the frame. Unground one of them to turn it.'
    );
  }
  const pivot = groundedA ? cylinder.mountA : groundedB ? cylinder.mountB : cylinder.seal;
  const turn = angleRad - Math.atan2(frame.axis.y, frame.axis.x);
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const mountA = {
    x: pivot.x + (cylinder.mountA.x - pivot.x) * cos - (cylinder.mountA.y - pivot.y) * sin,
    y: pivot.y + (cylinder.mountA.x - pivot.x) * sin + (cylinder.mountA.y - pivot.y) * cos,
  };
  const turning = Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn))) > 1e-12;
  const displaced = turning
    ? [cylinder.mountA, cylinder.mountB].filter((joint) => joint.id !== pivot.id)
    : [];
  const held = context.heldBy?.(displaced);
  if (held) {
    return refuse(
      ANGLE,
      'a fixed value is in the way',
      `${held}, and turning this cylinder would have to move it. Release it first.`
    );
  }
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

/**
 * Put the seal at a share of its travel: *Starts at* (decision D11).
 *
 * The rod moves out by default, because that is the end a cylinder pushes with.
 * With that end grounded the barrel slides back instead. With both ends
 * grounded the span is a fact and one of the members has to change length to
 * satisfy the number — the rod first, since the barrel's length is also the
 * travel and changing it moves the very scale the number is a share of.
 */
export function poseForCylinderStart(
  cylinder: Cylinder,
  start: number,
  context: CylinderEditContext
): CylinderEdit {
  const frame = frameOf(cylinder, context.r);
  if (!frame) return unreadable(START);
  const at = Math.min(Math.max(start, 0), 1);
  const along = frame.travel.min + at * (frame.travel.max - frame.travel.min);
  const groundedA = context.isGrounded(cylinder.mountA);
  const groundedB = context.isGrounded(cylinder.mountB);
  if (groundedA && groundedB) return startWithBothGrounded(cylinder, at, frame, context);
  return alongTheAxis(cylinder, frame, frame.lengths, along, groundedB, START, context);
}

/**
 * The same number with nothing free to move: a member changes length instead.
 *
 * The rod goes first because it is the passive one — it reaches, and nothing
 * else is measured from it. Changing the *barrel* changes the travel, which is
 * the scale the share is a share of, so it is second and it has to be solved
 * for rather than subtracted.
 */
function startWithBothGrounded(
  cylinder: Cylinder,
  at: number,
  frame: CylinderFrame,
  context: CylinderEditContext
): CylinderEdit {
  const { r, holds } = context;
  const { lengths, span, axis } = frame;
  if (!holds.rod) {
    const along = frame.travel.min + at * (frame.travel.max - frame.travel.min);
    const rod = span - along;
    if (rod < cylinderRodFloor(lengths.barrel, r)) {
      return refuse(
        START,
        'the rod would be too short',
        'Starting there would leave the rod shorter than the travel, so its joint would be pulled inside the barrel. Fix the rod’s length so the barrel changes instead, or unground a joint.'
      );
    }
    return {
      ok: true,
      pose: cylinderPoseAlong(cylinder.mountA, axis, { barrel: lengths.barrel, rod }, along),
    };
  }
  if (holds.barrel) {
    return refuse(
      START,
      'too many fixed values',
      'Both joints are grounded and both members are fixed at their lengths, so nothing is left to move. Release one of the lengths, or unground a joint.'
    );
  }
  // The barrel is the only thing that can give. `min(Lb) + start * stroke(Lb)`
  // rises with the barrel throughout, so bisection finds the one that puts the
  // seal exactly where the span already needs it.
  const wanted = span - lengths.rod;
  // The raw interval, not the guarded one: the search starts at the barrel
  // floor, where the guard fires on a rounding error and hands back a
  // collapsed point that would make the low end of the bracket meaningless.
  const alongFor = (barrel: number) => {
    const travel = cylinderHeadTravel(barrel, r);
    return travel.min + at * (travel.max - travel.min);
  };
  const floor = cylinderBarrelFloor(r);
  const ceiling = lengths.rod + HEAD_CLEARANCE_R * r;
  if (ceiling < floor || alongFor(floor) > wanted || alongFor(ceiling) < wanted) {
    return refuse(
      START,
      'no barrel reaches it',
      'No barrel length starts the cylinder there with both joints grounded: it would be too short to slide in, or would have more travel than the rod is long. Release the rod’s length, or unground a joint.'
    );
  }
  let low = floor;
  let high = ceiling;
  for (let step = 0; step < 60; step++) {
    const mid = (low + high) / 2;
    if (alongFor(mid) > wanted) high = mid;
    else low = mid;
  }
  return {
    ok: true,
    pose: cylinderPoseAlong(cylinder.mountA, axis, { barrel: low, rod: lengths.rod }, wanted),
  };
}

/**
 * Give the barrel a length: N moves, and nothing else (decision S6).
 *
 * So the travel changes under a seal standing still, which is why *Starts at*
 * reads differently afterwards without the rod having gone anywhere. The three
 * refusals are the three ways that stops being drawable: the barrel is too
 * short to slide in at all, it no longer reaches the seal where the seal
 * stands, or it has grown more travel than the rod can stay outside of.
 */
export function poseForBarrelLength(
  cylinder: Cylinder,
  barrelLength: number,
  context: CylinderEditContext
): CylinderEdit {
  const frame = frameOf(cylinder, context.r);
  if (!frame) return unreadable(BARREL);
  const travel = cylinderStrokeAlong(barrelLength, context.r);
  if (barrelLength < cylinderBarrelFloor(context.r) || !travel.usable) {
    return refuse(
      BARREL,
      'no room to slide',
      'A barrel that short has no travel left in it. Make it longer, or delete the cylinder and draw a smaller one.'
    );
  }
  if (cylinderStroke(barrelLength, context.r) > frame.lengths.rod) {
    return refuse(
      BARREL,
      'longer than the rod',
      'That barrel would have more travel than the rod is long, so closing the cylinder would pull the rod’s joint inside it. Lengthen the rod first.'
    );
  }
  if (frame.along > travel.max) {
    return refuse(
      BARREL,
      'too short to reach',
      'That barrel is too short to reach where the rod is standing. Close the cylinder a little first, or choose a longer barrel.'
    );
  }
  if (frame.along < travel.min) {
    return refuse(
      BARREL,
      'too long for the pose',
      'That barrel is too long for where the rod is standing: it would swallow the joint. Open the cylinder a little first, or choose a shorter barrel.'
    );
  }
  return {
    ok: true,
    pose: cylinderPoseAlong(
      cylinder.mountA,
      frame.axis,
      { barrel: barrelLength, rod: frame.lengths.rod },
      frame.along
    ),
  };
}

/**
 * Give the rod a length: B moves, unless B is the end that cannot (decision S6).
 *
 * The same ladder *Starts at* climbs, for the same reason — a longer rod has to
 * come from somewhere, and which end gives is a question about what is bolted
 * down. Its own floor is the travel: a rod shorter than that would be swallowed
 * on the way closed, and no amount of grounding makes that drawable.
 */
export function poseForRodLength(
  cylinder: Cylinder,
  rodLength: number,
  context: CylinderEditContext
): CylinderEdit {
  const frame = frameOf(cylinder, context.r);
  if (!frame) return unreadable(ROD);
  if (!(rodLength > 0) || rodLength < cylinderRodFloor(frame.lengths.barrel, context.r)) {
    return refuse(
      ROD,
      'shorter than the travel',
      'A rod shorter than the travel would be pulled inside the barrel on the way closed. Give it at least the barrel’s travel, or shorten the barrel first.'
    );
  }
  const lengths = { barrel: frame.lengths.barrel, rod: rodLength };
  const groundedA = context.isGrounded(cylinder.mountA);
  const groundedB = context.isGrounded(cylinder.mountB);
  if (groundedA && groundedB) {
    const along = frame.span - rodLength;
    if (along < frame.travel.min || along > frame.travel.max) {
      return refuse(
        ROD,
        'it would not reach',
        'With both joints grounded, that rod would put the cylinder past the end of its travel. Choose a length between closed and open, or unground a joint.'
      );
    }
    return { ok: true, pose: cylinderPoseAlong(cylinder.mountA, frame.axis, lengths, along) };
  }
  return alongTheAxis(cylinder, frame, lengths, frame.along, groundedB, ROD, context);
}

/**
 * Follow the seal along the axis: *Starts at* by hand (decision S7).
 *
 * Nothing is resized on this road. A drag is a gesture, and a gesture that
 * silently changed a length the reader had typed would be the resize-by-
 * accident the whole pose-before-size ordering exists to prevent — so with both
 * joints grounded the seal simply does not move, and says nothing about it.
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
  if (Math.abs(along - frame.along) < 1e-9) {
    return refuse(
      SEAL,
      'already there',
      'The cylinder is already at that point of its travel.',
      true
    );
  }
  const groundedA = context.isGrounded(cylinder.mountA);
  const groundedB = context.isGrounded(cylinder.mountB);
  if (groundedA && groundedB) {
    return refuse(
      SEAL,
      'both joints are grounded',
      'Both joints are grounded, so the cylinder cannot slide without changing a length. Type a value into Starts at instead.',
      true
    );
  }
  return alongTheAxis(cylinder, frame, frame.lengths, along, groundedB, SEAL, context, true);
}

/**
 * Lay the part out on the axis it already has, and decide which end gives.
 *
 * The shared half of *Starts at*, Rod Length and a seal drag: the barrel end is
 * the anchor unless it is the free one, in which case the barrel slides back
 * and the grounded rod end stays exactly where the frame holds it.
 */
function alongTheAxis(
  cylinder: Cylinder,
  frame: CylinderFrame,
  lengths: CylinderLengths,
  along: number,
  groundedB: boolean,
  code: string,
  context: CylinderEditContext,
  silent?: boolean
): CylinderEdit {
  const { mountA, mountB } = cylinder;
  const { axis } = frame;
  const reach = along + lengths.rod;
  const from = groundedB
    ? { x: mountB.x - reach * axis.x, y: mountB.y - reach * axis.y }
    : { x: mountA.x, y: mountA.y };
  const displaced = groundedB ? [mountA] : [mountB];
  const held = context.heldBy?.(displaced);
  if (held) {
    return refuse(
      code,
      'a fixed value is in the way',
      `${held}, and this would have to move it. Release it first.`,
      silent
    );
  }
  return { ok: true, pose: cylinderPoseAlong(from, axis, lengths, along) };
}
