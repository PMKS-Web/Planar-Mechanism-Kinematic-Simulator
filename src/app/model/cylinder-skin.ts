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
import { RealLink } from './link';

/** What a member is painted with when its own record says nothing readable. */
const NO_FILL = '#000000';

/** The ink the barrel is drawn in: its own, like any other bar. */
export function barrelFillOf(cylinder: Cylinder): string {
  return (cylinder.barrel as RealLink).fill ?? NO_FILL;
}

/**
 * The ink the rod is drawn in: the barrel's, until somebody gave the rod one
 * of its own (decision S15).
 *
 * The rod has always carried a fill — creation hands every new link the next
 * palette color — and the skin has always ignored it, painting both members
 * from the barrel. So every cylinder in circulation stores a rod color that
 * has never been drawn, and reading it now would repaint every shared link and
 * every library card. `ownColor` is the difference between a number on file
 * and a choice somebody made, and this is the one place the two are told
 * apart: everything that paints, previews or exports a rod asks here.
 */
export function rodFillOf(cylinder: Cylinder): string {
  return cylinder.rod.ownColor ? (cylinder.rod.fill ?? NO_FILL) : barrelFillOf(cylinder);
}

/**
 * Paint one body, and leave the other member of its cylinder alone.
 *
 * The one rule, so the Edit panel, a multi-selection and anything else that
 * recolors cannot disagree about it. Two halves:
 *
 * - **The rod** takes the color and keeps it: from here on it is drawn from
 *   its own record whatever the barrel does.
 * - **The barrel**, on a cylinder whose rod has made no choice, first hands the
 *   rod the color it is standing in — the barrel's, *before* this change — and
 *   only then takes the new one. The rod is left looking exactly as it did,
 *   which is what "changing one never drags the other along" means when one of
 *   them is being drawn in the other's ink.
 *
 * `cylinder` is whichever cylinder this body is a bar of, or nothing for an
 * ordinary link — which is every link but two, and for which this is a plain
 * assignment.
 */
export function paintCylinderMember(
  link: RealLink,
  color: string,
  cylinder: Cylinder | undefined
): void {
  // By id, which is how every other consumer names a member
  // (`cylinderOfBarIn`): a compound's leaf and a solved sample are copies of
  // the editable bar, so the record a caller holds need not be that object.
  if (cylinder) {
    if (link.id === cylinder.rod.id) {
      cylinder.rod.ownColor = true;
    } else if (link.id === cylinder.barrel.id && !cylinder.rod.ownColor) {
      cylinder.rod.fill = barrelFillOf(cylinder);
      cylinder.rod.ownColor = true;
    }
  }
  link.fill = color;
}

/** As much of a drawn cylinder as this question needs. */
export interface SkinnedCylinder {
  /** The record the skin was built from, which is what knows where N is. */
  cylinder: Cylinder;
}

/**
 * Whether the reader is shown this joint at all: false for N, and for nothing
 * else. No hitbox, no letter, nothing counted.
 *
 * `isCylinderInner` is the whole of the rule and is asked twice — of the drawn
 * marks and of the record behind them — rather than being spelled out a second
 * time here. The marks used to carry their own copy of N's id, which is one
 * more thing that can be wrong about the same joint.
 */
export function hiddenByCylinder(
  marks: readonly SkinnedCylinder[],
  sealed: Cylinder | undefined,
  joint: Joint
): boolean {
  if (marks.some((mark) => isCylinderInner(mark.cylinder, joint))) return true;
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
