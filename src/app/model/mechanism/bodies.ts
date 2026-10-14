import { Joint, PrisJoint, RealJoint } from '../joint';
import { Link } from '../link';
import { groupRigidBodies } from '../rigid-bodies';
import { assemblyBodyIds, slideAssemblies } from '../slide-assembly';

/** The world: one body, however many anchored bars are drawn on top of it. */
export const WORLD = 'ground-body';

export interface BodyAssignment {
  /** The rigid body a link belongs to — WORLD for anything pinned down everywhere. */
  bodyOf(link: Link): string;
  /** Every distinct body meeting at a joint, the world among them. */
  bodiesAt(joint: RealJoint): Set<string>;
  /** Every body that can move: the drawing's bodies, less the world. */
  movingBodies: Set<string>;
}

/**
 * Which rigid body each link belongs to, and which bodies meet at each joint.
 *
 * Mobility counting and the split into separate mechanisms are two questions
 * asked of the same structure, and they have to agree: a mechanism whose
 * mobility was counted over one notion of "body" and whose extent was decided
 * by another would report a degree of freedom for a machine that is not the one
 * on the screen. So both read this, and there is one definition to be wrong.
 */
export function assignBodies(
  joints: Joint[],
  links: Link[],
  /**
   * Groups of link ids the caller knows to be one rigid body for a reason the
   * drawing does not state. A cylinder holding its length is the case
   * (decision S28): its barrel and its rod share one joint, and what stops
   * them sliding is that nothing drives the part -- not a second pin and not a
   * weld. Passed in rather than merged afterwards so there stays one answer to
   * "what is a rigid body", which is the whole point of this module.
   */
  extraRigid: readonly string[][] = []
): BodyAssignment {
  /**
   * Whether this joint holds its point still.
   *
   * `ground` reads two ways and only one of them means that. On a pin it does.
   * On a slider it says the *slot line* is fixed in the world while the joint
   * itself travels along it -- so a bar whose two ends are grounded sliders is
   * an elliptical trammel, which moves. Read as pinned, both its ends looked
   * fixed, the bar was folded into the world, and a one-freedom mechanism
   * counted as rigid. `frameBodies` in the force solver has always drawn this
   * line; this is the same line, in the one place that decides what a body is.
   */
  const pinnedDown = (joint: Joint): boolean =>
    joint instanceof RealJoint && joint.ground && !(joint instanceof PrisJoint);

  // A Slide's riders are held rigid by something no joint count can see, so the
  // caller names them. Links pinned to ground at every joint are merged for the
  // same reason: they cannot move, so they are one body — the world's, as
  // settled below where the world exists.
  const anchored = links
    .filter((link) => link.joints.length > 0 && link.joints.every(pinnedDown))
    .map((link) => link.id);
  const rigidBody = groupRigidBodies(links, [
    ...slideAssemblies(joints).map(assemblyBodyIds),
    ...extraRigid.map((group) => [...group]),
    anchored,
  ]);

  const groupOf = (link: Link) => rigidBody.get(link.id) ?? link.id;
  // A group every one of whose links is pinned down at every joint *is* the
  // world. Deciding it per group rather than per link keeps a rail that has
  // been merged with something movable out of the world by mistake.
  const anchoredGroups = new Set(
    [...new Set(links.map(groupOf))].filter((group) =>
      links
        .filter((link) => groupOf(link) === group)
        .every((link) => link.joints.length > 0 && link.joints.every(pinnedDown))
    )
  );
  const bodyOf = (link: Link) => (anchoredGroups.has(groupOf(link)) ? WORLD : groupOf(link));

  /**
   * One rule for both joint types, because it is one question. A pin joins the
   * bodies of its links, plus the world if it is grounded; a sliding joint
   * joins its block to whatever the slot is cut into — the world for a fixed
   * guide, the carrier for a floating one.
   */
  const bodiesAt = (joint: RealJoint): Set<string> => {
    const bodies = new Set(joint.links.map(bodyOf));
    if (joint.ground) {
      bodies.add(WORLD);
    }
    if (joint instanceof PrisJoint && !joint.ground) {
      // A slider with no carrier and no ground slides against nothing. It is an
      // invalid mechanism either way; naming the absent body keeps the reported
      // number the one this case has always reported.
      bodies.add(joint.carrier ? bodyOf(joint.carrier) : 'dangling-slot' + joint.id);
    }
    return bodies;
  };

  const movingBodies = new Set(links.map(bodyOf));
  movingBodies.delete(WORLD);

  return { bodyOf, bodiesAt, movingBodies };
}
