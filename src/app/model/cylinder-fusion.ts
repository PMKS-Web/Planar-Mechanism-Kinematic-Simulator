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

import { Cylinder, cylinderOfBarIn } from './cylinder';
import { CylinderRole, cylinderSkinFrame, memberIsWelded } from './cylinder-skin';
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

/** As much of a drawn cylinder as the layering question needs. */
export interface FusingSkin {
  /** The mark's own key, which is the seal's id. */
  id: string;
  cylinder: Cylinder;
}

/** As much of a Slide's weld plate as the same question needs. */
export interface FusingPlate {
  /** The sliding joint the plate belongs to. */
  id: string;
  /** The bodies it has fused with the block, and therefore stands in for. */
  links: readonly Link[];
}

/** One drawn body, and the members whose own region still selects the member. */
export interface FusedBody<M extends FusingSkin, P extends FusingPlate = FusingPlate> {
  body: Link;
  /**
   * The Slide whose plate draws that body and the black block as one outline,
   * when the body rides one. What is painted then is the plate, not the body:
   * the two are one shape and a plate is the bigger of them.
   */
  plate?: P;
  members: { mark: M; role: CylinderRole }[];
}

/**
 * Which pass of which skin paints each fused shape, keyed `${seal}:${role}`.
 *
 * The stack is barrel, head block, rod, and a shape holding a member has to be
 * painted in the place of that member or the layering stops meaning anything: a
 * rod drawn *under* the black head is hidden by it entirely, and the darker
 * band that says how much rod is still in the bore — the cue the whole drawing
 * rests on — simply goes.
 *
 * So when one shape holds both kinds, **the rod's place wins**. A barrel
 * painted over its head still leaves the head plainly visible through the
 * body's own 0.7 alpha, which is a cue dimmed; a rod painted under one is a cue
 * deleted. One shape can hold both by having both ends of one cylinder welded
 * into it, or by being the bracket two cylinders are welded to, so the claim is
 * made across the whole drawing rather than per part: a shape is painted
 * exactly once, whichever skins are standing on it.
 *
 * Two things can hold a member, and both are answered here for the same reason
 * (decision S18). A **weld** makes it part of a bracket; a **Slide** at its end
 * joint makes it part of that slider's weld plate — and a plate that holds a
 * rod has to be painted where the rod is, above the head, exactly as a bracket
 * does. A plate wins over the body inside it, because the plate is the bigger
 * shape and contains it.
 */
export function fusedBodiesOf<M extends FusingSkin, P extends FusingPlate>(
  marks: readonly M[],
  plates: readonly P[] = []
): Map<string, FusedBody<M, P>> {
  /** The one shape a member is drawn inside, or nothing when it draws itself. */
  const unitOf = (cylinder: Cylinder, role: CylinderRole) => {
    const body = rootOf(cylinder, role);
    const plate = plates.find((held) => held.links.some((link) => link.id === body.id));
    if (!plate && !memberIsWelded(cylinder, role)) return undefined;
    return { body, plate, key: plate ? `plate:${plate.id}` : `body:${body.id}` };
  };

  const members = new Map<string, { mark: M; role: CylinderRole }[]>();
  for (const mark of marks) {
    for (const role of ['barrel', 'rod'] as const) {
      const unit = unitOf(mark.cylinder, role);
      if (!unit) continue;
      members.set(unit.key, [...(members.get(unit.key) ?? []), { mark, role }]);
    }
  }

  const painted = new Map<string, FusedBody<M, P>>();
  const claimed = new Set<string>();
  for (const role of ['rod', 'barrel'] as const) {
    for (const mark of marks) {
      const unit = unitOf(mark.cylinder, role);
      if (!unit || claimed.has(unit.key)) continue;
      claimed.add(unit.key);
      painted.set(`${mark.id}:${role}`, {
        body: unit.body,
        plate: unit.plate,
        members: members.get(unit.key) ?? [],
      });
    }
  }
  return painted;
}

/**
 * Whether anything bigger stands in for this member, whichever pass paints it.
 *
 * The question the skin asks before painting a member on its own: a member
 * another pass is drawing inside a bracket or a plate must not also be painted
 * here, or the part comes out twice over itself at 0.7 alpha.
 */
export function memberIsFused<M extends FusingSkin, P extends FusingPlate>(
  bodies: Map<string, FusedBody<M, P>>,
  mark: M,
  role: CylinderRole
): boolean {
  if (memberIsWelded(mark.cylinder, role)) return true;
  for (const found of bodies.values()) {
    if (found.members.some((held) => held.mark.id === mark.id && held.role === role)) return true;
  }
  return false;
}

function rootOf(cylinder: Cylinder, role: CylinderRole): Link {
  return role === 'barrel' ? cylinder.barrelRoot : cylinder.rodRoot;
}
