/**
 * What a cylinder's skin draws for itself, and in what ink.
 *
 * The canvas draws every joint the same way — a marker, a hitbox and a letter
 * from one loop — and a cylinder is the one exception: nothing at all draws the
 * barrel's buried inner end N. That is the question here, and it is asked of
 * the drawn marks *and* of the structure behind them: the marks are built from
 * geometry and can lag a frame mid-edit — a weld landing, a drag in flight —
 * which was long enough for an interior label to blink into view.
 *
 * Kept out of the canvas because it does not depend on the canvas.
 */

import { Cylinder, isCylinderInner } from './cylinder';
import { Joint } from './joint';

/** As much of a drawn cylinder as this question needs. */
export interface SkinnedCylinder {
  /** N — the barrel's buried inner end, which nothing draws. */
  hiddenJointId: string;
  /** S — the seal, whose mark rides the head the skin draws. */
  seal: { id: string };
}

/**
 * Whether the reader is shown this joint at all: false for N, and for nothing
 * else. No hitbox, no letter, nothing counted.
 */
export function hiddenByCylinder(
  marks: readonly SkinnedCylinder[],
  sealed: Cylinder | undefined,
  joint: Joint
): boolean {
  if (marks.some((mark) => mark.hiddenJointId === joint.id)) return true;
  return !!sealed && isCylinderInner(sealed, joint);
}

// The skin used to draw joint S as well, and this module answered a second
// question for the canvas: which layer draws a joint. The ordinary joint layer
// stayed off S because it would have painted a weld cross over the square.
// Sliders wear a bar along the slot now instead of that cross, so S is drawn
// from the joint loop like any other Prismatic slider — above the skin, on the
// head the skin draws — and only N is still hidden. One question left.

/**
 * The accent stroke a state class asks for, or nothing for a state that wears
 * none.
 *
 * Joints and links name the same three states with different prefixes, and the
 * skin outlines both kinds of thing: its two members are links, its seal is a
 * joint, and all three are outlined by stroking a path. One mapping, so a
 * picked member and a picked seal are drawn in the same ink.
 */
export function accentOutlineClass(state: string): string | undefined {
  if (state.includes('-inert')) return undefined;
  if (state.includes('-selected') || state.includes('-dragging')) return 'link-selected';
  if (state.includes('-pointed')) return 'link-pointed';
  if (state.includes('-hovered') || state.includes('-highlight')) return 'link-hovered';
  return undefined;
}
