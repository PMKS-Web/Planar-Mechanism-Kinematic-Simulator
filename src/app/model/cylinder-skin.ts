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

import { SettingsService } from '../services/settings.service';
import { Cylinder, cylinderHeadHalf, isCylinderInner } from './cylinder';
import { Joint } from './joint';
import { RealLink } from './link';

/** What a member is painted with when its own record says nothing readable. */
const NO_FILL = '#000000';

/** Which half of the part a question is about. */
export type CylinderRole = 'barrel' | 'rod';

/** Whether a body other than the member itself has swallowed it (decision S16). */
export function memberIsWelded(cylinder: Cylinder, role: CylinderRole): boolean {
  return role === 'barrel'
    ? cylinder.barrelRoot.id !== cylinder.barrel.id
    : cylinder.rodRoot.id !== cylinder.rod.id;
}

/**
 * The ink the barrel is drawn in: its own, like any other bar — or its body's,
 * once a weld has made the two one body (decision S16).
 *
 * A welded member is part of the outline the body draws, and a body is one
 * color: `mergeLinks` hands a compound the fill it continues or its first
 * leaf's, and every leaf under it is drawn in that. So the barrel follows its
 * root exactly as an ordinary welded bar follows the body it was welded into,
 * rather than keeping a color of its own that would put a seam back where the
 * fillet just removed one.
 */
export function barrelFillOf(cylinder: Cylinder): string {
  const painted = memberIsWelded(cylinder, 'barrel') ? cylinder.barrelRoot : cylinder.barrel;
  return (painted as RealLink).fill ?? NO_FILL;
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
 *
 * A welded rod answers before any of that, for the reason the barrel does: it
 * is part of a body, and the body is one color. The choice only decides what
 * an *unwelded* rod does, and there the barrel's answer above may itself be a
 * compound's — a rod that has made no choice is drawn in whatever its barrel
 * is painted in, which is the bracket's fill once the barrel mount is welded.
 */
export function rodFillOf(cylinder: Cylinder): string {
  if (memberIsWelded(cylinder, 'rod')) return cylinder.rodRoot.fill ?? NO_FILL;
  return cylinder.rod.ownColor ? (cylinder.rod.fill ?? NO_FILL) : barrelFillOf(cylinder);
}

/**
 * The axis a cylinder's skin is drawn along, and the four lengths every piece
 * of it is measured from.
 *
 * The frame is centered on the seal with +x toward mount B — so the barrel is
 * the negative side and the geometry reads the same whichever way round the
 * slot was declared. `anchor` and `mouth` are *projected* onto that axis rather
 * than taken as distances, because the mouth is not always ahead of the seal:
 * fully extended the head has come clean out of the barrel, and an unsigned
 * distance draws the mouth on the wrong side.
 *
 * Answered once because it is asked twice. The skin draws the part from these
 * numbers, and a member welded into a bracket hands the same silhouette to that
 * bracket's outline (`model/cylinder-fusion.ts`); a silhouette measured a
 * second time is one that can disagree with the part it is supposed to be.
 */
export interface CylinderSkinFrame {
  /** Where the frame sits and how far it is turned, in the drawing's own terms. */
  x: number;
  y: number;
  angleRad: number;
  /** The barrel's two ends along the axis: behind the head, and ahead of it. */
  anchor: number;
  mouth: number;
  /** |SB| — how far the rod reaches past the seal. */
  reach: number;
  /** Half the piston head's length, at the size this barrel has room for. */
  headHalf: number;
}

export function cylinderSkinFrame(cylinder: Cylinder, r: number): CylinderSkinFrame {
  const { seal, mountA, mountB, inner } = cylinder;
  const reach = Math.hypot(mountB.x - seal.x, mountB.y - seal.y);
  const ux = reach > 1e-9 ? (mountB.x - seal.x) / reach : 1;
  const uy = reach > 1e-9 ? (mountB.y - seal.y) / reach : 0;
  const along = (point: { x: number; y: number }) =>
    (point.x - seal.x) * ux + (point.y - seal.y) * uy;
  const anchor = along(mountA);
  const mouth = along(inner);
  return {
    x: seal.x,
    y: seal.y,
    angleRad: Math.atan2(uy, ux),
    anchor,
    mouth,
    reach,
    // The head is full size on any cylinder with room for it and shrinks only
    // on one too short to hold it, so it is read off this barrel rather than
    // assumed.
    headHalf: cylinderHeadHalf(
      mouth - anchor,
      SettingsService.preservedCylinderScale ? 0.15 * SettingsService.cylinderObjectScale : r
    ),
  };
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
 *
 * A **welded** member is a third case, and the color lands on the body rather
 * than on the member (decision S16). The member is part of that body's one
 * outline; writing the color onto the leaf would store a number nothing draws
 * and leave the row doing nothing anyone can see, which is the opposite of
 * what fusing the two was for.
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
  paintedBody(link, cylinder).fill = color;
}

/** The body a recolor of this one writes to: its own, or the one holding it. */
function paintedBody(link: RealLink, cylinder: Cylinder | undefined): RealLink {
  if (!cylinder) return link;
  if (link.id === cylinder.barrel.id && memberIsWelded(cylinder, 'barrel')) {
    return cylinder.barrelRoot as RealLink;
  }
  if (link.id === cylinder.rod.id && memberIsWelded(cylinder, 'rod')) return cylinder.rodRoot;
  return link;
}

/**
 * The ink a picker should show as chosen for this body.
 *
 * What is on the canvas, not what is on file: a rod that has made no choice is
 * drawn in its barrel's color and a welded member in its body's, so reading
 * `fill` straight off the record ticked a swatch that is nowhere in the
 * drawing.
 */
export function fillShownOn(link: RealLink, cylinder: Cylinder | undefined): string {
  if (!cylinder) return link.fill ?? NO_FILL;
  if (link.id === cylinder.barrel.id) return barrelFillOf(cylinder);
  if (link.id === cylinder.rod.id) return rodFillOf(cylinder);
  return link.fill ?? NO_FILL;
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
