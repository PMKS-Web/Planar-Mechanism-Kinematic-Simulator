/**
 * What the start-pose ghost paints for one body: the shape, and the ink.
 *
 * The ghost is the real linkage carried back to where its machine starts —
 * "the same shapes in the same colors, at 22%" — so both answers have to be
 * the ones the canvas is using on the live drawing, and neither of them can be
 * read off the record. A cylinder is where the difference shows. Its members
 * carry a `fill` each, and the rod's has never been drawn: a rod that has
 * chosen no color of its own is painted in its barrel's (decision S15), so
 * every cylinder in circulation stores a rod color nobody picked. Its members'
 * `d` is the thin bar their two joints describe, while what stands there is the
 * skin's silhouette. Asked of the record, the ghost drew a mint-green rod and a
 * lavender barrel behind a part that is navy from end to end.
 *
 * So the two questions are put to the two rules the skin itself quotes —
 * `fillShownOn` for the ink, the member silhouette for the shape — and the
 * ghost carries the answers back to the start pose with the move it already
 * holds.
 *
 * Kept out of the canvas because it does not depend on the canvas, and out of
 * the ghost builder because the builder runs once per solve while a color is
 * chosen between solves.
 */

import { Cylinder, cylinderOfBarIn } from './cylinder';
import { memberSilhouette } from './cylinder-fusion';
import { fillShownOn } from './cylinder-skin';
import { transformRigidPath } from './compound-link-path';
import { Link, RealLink } from './link';
import { GhostBody } from './mechanism/anchor';

/**
 * The outline to draw at the start pose, with the holes the body carries cut
 * back into it.
 *
 * `channels` is that body's slots in the drawing's own coordinates, or '' for a
 * body with none: a slot is not part of a link's outline — the canvas subtracts
 * it when it draws the real link — so a ghost drawn from the outline alone came
 * out solid, and the moment playback carried the real bar away the slot looked
 * as though it had been filled in behind it. The channel is rigid with its
 * carrier, so the move that carries the outline carries it to the same place.
 */
export function ghostPathOf(
  body: GhostBody,
  link: Link | undefined,
  cylinders: readonly Cylinder[],
  r: number,
  channels: string
): string {
  const outline = ghostOutlineOf(body, link, cylinders, r);
  if (channels === '') return outline;
  const { from, to, there, thereEnd } = body.move;
  return `${outline} ${transformRigidPath(channels, from, to, there, thereEnd)}`;
}

/**
 * The shape that stands where this body is, carried back to the start pose.
 *
 * `body.d` for everything but a cylinder member, because that is what the
 * builder already carried there. A member answers with the skin's own
 * silhouette instead: its `d` is a two-joint capsule that is drawn nowhere, so
 * a ghost built from it showed a ram as two plain bars beside the part it is
 * supposed to be a picture of.
 *
 * Asked without `CYLINDER.cutEase`, which is the one way `memberSilhouette`
 * differs from what the skin itself draws: the eased corners are there to stop
 * a *union* filleting the barrel's mouth and the rod's back into curves, and
 * the ghost draws the silhouette on its own with no union to protect it from.
 */
function ghostOutlineOf(
  body: GhostBody,
  link: Link | undefined,
  cylinders: readonly Cylinder[],
  r: number
): string {
  const cylinder = cylinderOfBarIn(cylinders, link);
  if (!cylinder || !link) return body.d;
  const { from, to, there, thereEnd } = body.move;
  const role = cylinder.barrel.id === link.id ? 'barrel' : 'rod';
  return transformRigidPath(memberSilhouette(cylinder, role, r, 0), from, to, there, thereEnd);
}

/**
 * The ink this body is painted in right now.
 *
 * One rule for every painter (`cylinder-skin.ts`): a rod that has chosen no
 * color is its barrel's, a welded member is its body's, and everything else is
 * its own. `body.fill` is the fallback for a body that has left the drawing —
 * a held ghost outlives the link it was built from — and there is nothing left
 * to ask about that one.
 */
export function ghostInkOf(
  body: GhostBody,
  link: Link | undefined,
  cylinders: readonly Cylinder[]
): string {
  return link instanceof RealLink ? fillShownOn(link, cylinderOfBarIn(cylinders, link)) : body.fill;
}
