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
 * Two answers make it one body, and they are the two halves of this file:
 *
 * - **What the body's outline has to contain**, so the Boolean union that
 *   fillets an ordinary weld has the member's real silhouette to work with
 *   rather than the thin bar its two joints describe.
 * - **Where that body is painted**, because the skin is a stack — barrel under
 *   the head block, rod over it — and a body holding a member has to stand in
 *   that member's place in it rather than in the ordinary links layer.
 */

import { Cylinder } from './cylinder';
import { CylinderRole, cylinderSkinFrame, memberIsWelded } from './cylinder-skin';
import { transformRigidPath } from './compound-link-path';
import { barrelPath, CYLINDER, rodBodyPath } from './joint-marks';
import { Link } from './link';

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

/** As much of a drawn cylinder as the layering question needs. */
export interface FusingSkin {
  /** The mark's own key, which is the seal's id. */
  id: string;
  cylinder: Cylinder;
}

/** One welded body, and the members whose own region still selects the member. */
export interface FusedBody<M extends FusingSkin> {
  body: Link;
  members: { mark: M; role: CylinderRole }[];
}

/**
 * Which pass of which skin paints each welded body, keyed `${seal}:${role}`.
 *
 * The stack is barrel, head block, rod, and a body has to be painted in the
 * place of the member it holds or the layering stops meaning anything: a rod
 * drawn *under* the black head is hidden by it entirely, and the darker band
 * that says how much rod is still in the bore — the cue the whole drawing rests
 * on — simply goes.
 *
 * So when one body holds both kinds, **the rod's place wins**. A barrel painted
 * over its head still leaves the head plainly visible through the body's own
 * 0.7 alpha, which is a cue dimmed; a rod painted under one is a cue deleted.
 * One body can hold both by having both ends of one cylinder welded into it, or
 * by being the bracket two cylinders are welded to, so the claim is made across
 * the whole drawing rather than per part: a body is painted exactly once,
 * whichever skins are standing on it.
 */
export function fusedBodiesOf<M extends FusingSkin>(
  marks: readonly M[]
): Map<string, FusedBody<M>> {
  const members = new Map<string, { mark: M; role: CylinderRole }[]>();
  for (const mark of marks) {
    for (const role of ['barrel', 'rod'] as const) {
      if (!memberIsWelded(mark.cylinder, role)) continue;
      const root = rootOf(mark.cylinder, role);
      members.set(root.id, [...(members.get(root.id) ?? []), { mark, role }]);
    }
  }

  const painted = new Map<string, FusedBody<M>>();
  const claimed = new Set<string>();
  for (const role of ['rod', 'barrel'] as const) {
    for (const mark of marks) {
      if (!memberIsWelded(mark.cylinder, role)) continue;
      const root = rootOf(mark.cylinder, role);
      if (claimed.has(root.id)) continue;
      claimed.add(root.id);
      painted.set(`${mark.id}:${role}`, { body: root, members: members.get(root.id) ?? [] });
    }
  }
  return painted;
}

function rootOf(cylinder: Cylinder, role: CylinderRole): Link {
  return role === 'barrel' ? cylinder.barrelRoot : cylinder.rodRoot;
}
