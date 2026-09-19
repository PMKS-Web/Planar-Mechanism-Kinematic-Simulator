/**
 * What a cylinder's skin draws for itself, and in what ink.
 *
 * The canvas draws every other joint the same way — a marker, a hitbox and a
 * letter from one loop — and a cylinder is the exception: its own skin draws
 * the square that is joint S, and nothing at all draws the barrel's buried
 * inner end N. So two questions the canvas asks of every joint have cylinder
 * answers, and they are *different* questions (decision S11): what a reader can
 * see, and which layer is responsible for drawing it.
 *
 * Kept out of the canvas because neither depends on the canvas. Each is asked
 * of the drawn marks *and* of the structure behind them: the marks are built
 * from geometry and can lag a frame mid-edit — a weld landing, a drag in flight
 * — which was long enough for an interior label to blink into view.
 */

import { Cylinder, isCylinderInner, isInsideCylinder } from './cylinder';
import { Joint } from './joint';

/** As much of a drawn cylinder as these questions need. */
export interface SkinnedCylinder {
  /** N — the barrel's buried inner end, which nothing draws. */
  hiddenJointId: string;
  /** S — the seal, drawn as the square mid-skin. */
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

/**
 * Whether the cylinder's own skin is what draws this joint: N and S.
 *
 * The ordinary joint layer stays off both. A marker painted at S as well would
 * be a weld cross over the square — a seal is welded — with a second hitbox on
 * the same point.
 */
export function drawnByCylinder(
  marks: readonly SkinnedCylinder[],
  sealed: Cylinder | undefined,
  joint: Joint
): boolean {
  if (marks.some((mark) => mark.hiddenJointId === joint.id || mark.seal.id === joint.id)) {
    return true;
  }
  return !!sealed && isInsideCylinder(sealed, joint);
}

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
