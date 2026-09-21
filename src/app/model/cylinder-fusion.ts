/**
 * A welded cylinder end is one body with the bracket on it (decision S16).
 *
 * Weld a bar to a mount and the two are rigid: the same thing a weld between
 * two ordinary links means, and it should draw the same way — one fill, one
 * continuous stroke, a fillet in the elbow. It did not. The bracket was its own
 * shape in its own color with its own outline, the skin was painted over it
 * with a seam and no fillet, and at a barrel mount the bracket's round end
 * showed as a circle sitting inside the barrel.
 *
 * Two answers make it one body, and this file is the first of them: **what the
 * body's outline has to contain**, so the Boolean union that fillets an
 * ordinary weld has the member's real silhouette to work with rather than the
 * thin bar its two joints describe. The second — **where that body is painted**
 * in a stack that is barrel, head block, rod — is `model/cylinder-paint-order.ts`.
 */

import { Cylinder, cylinderOfBarIn } from './cylinder';
import { CylinderRole, cylinderSkinFrame } from './cylinder-skin';
import { transformRigidPath } from './compound-link-path';
import { barrelPath, CYLINDER, rodBodyPath } from './joint-marks';
import { Link, RealLink } from './link';

/**
 * The silhouette a member gives the body that has swallowed it, in the
 * drawing's own coordinates at the pose it is drawn in.
 *
 * The skin's own path builders, placed — not a shape derived a second time. The
 * barrel is its real profile, wide and round on the mount it pivots about and
 * cut square at the mouth; the rod runs from the back of the piston head out to
 * its own end joint. Handed to `buildCompoundPath` beside the bracket, the
 * union fillets the join and returns one ring, exactly as it does for two
 * ordinary welded bars.
 *
 * Built at the design pose and nowhere else: a compound's union is
 * pose-independent and every solved frame is a rigid move of it, so a
 * silhouette recomputed per frame would be the same shape at the cost of a
 * Boolean union sixty times a second.
 *
 * The one difference from what the skin itself draws is `CYLINDER.cutEase`,
 * which keeps the union from filleting the barrel's mouth and the rod's back
 * into curves — corners that belong to the part rather than to the weld.
 */
export function memberSilhouette(
  cylinder: Cylinder,
  role: CylinderRole,
  r: number,
  ease = CYLINDER.cutEase * r
): string {
  const frame = cylinderSkinFrame(cylinder, r);
  const local =
    role === 'barrel'
      ? barrelPath(r, frame.anchor, frame.mouth, ease)
      : rodBodyPath(r, frame.reach, frame.headHalf, ease);
  return transformRigidPath(local, { x: 0, y: 0 }, { x: 1, y: 0 }, frame, {
    x: frame.x + Math.cos(frame.angleRad),
    y: frame.y + Math.sin(frame.angleRad),
  });
}

/**
 * The outline a body contributes to a union that is standing in for it: what
 * is actually drawn where it is, rather than the bar its two joints describe.
 *
 * A cylinder member answers with the skin's own profile — `memberSilhouette`
 * above, the one builder a welded body's union is handed too, so a plate and a
 * bracket cannot disagree about the shape of the same part. Everything else
 * answers with its own path, which for a body that has already swallowed a
 * member is that union.
 *
 * Measured at the pose it is asked about rather than read off the design-pose
 * copy a leaf carries (`RealLink.skinSilhouette`). A compound's union is built
 * once and rigidly re-placed each frame; a plate is rebuilt each frame from
 * where its rider is now, so a silhouette frozen at the design pose would slide
 * out from under the part over one cycle.
 */
export function drawnOutlineOf(
  cylinders: readonly Cylinder[],
  link: RealLink,
  r: number
): string | undefined {
  const member = cylinderOfBarIn(cylinders, link);
  if (!member) return link.d;
  return memberSilhouette(member, member.barrel.id === link.id ? 'barrel' : 'rod', r);
}

/**
 * Whether a cylinder's skin is what paints this body — the member itself, or
 * the body a weld has made of it (decision S16).
 *
 * The two roots are the whole answer: `barrelRoot` and `rodRoot` are the member
 * until something swallows it, and the body afterwards.
 */
export function paintedByACylinder(cylinders: readonly Cylinder[], link: Link): boolean {
  return cylinders.some(
    (cylinder) => cylinder.barrelRoot.id === link.id || cylinder.rodRoot.id === link.id
  );
}

// Which shape paints a member, and in what order the drawing paints them all,
// moved to `model/cylinder-paint-order.ts` (decision S24). The order is a
// property of the whole drawing rather than of one part -- two cylinders can
// share a body, and a body painted in one of their stacks is painted outside
// the other's -- so it is worked out once, for every cylinder at once, and this
// file is left with the one question it can answer per part: what shape a
// member contributes to the body that has swallowed it.
