import { Joint, PrisJoint, RealJoint } from '../joint';
import { Link } from '../link';
import { Force } from '../force';
import { assignBodies, WORLD } from './bodies';

/** One independently solvable machine within the drawing. */
export interface MechanismPartition {
  /** Derived, never stored: M1, M2… in a stable order. See `partitionMechanisms`. */
  id: string;
  joints: Joint[];
  links: Link[];
  forces: Force[];
}

/**
 * Geometry that belongs to no mechanism, and why.
 *
 * Split by cause rather than lumped together, because the two have different
 * ways out: a floating chain needs grounding, a loose joint needs connecting.
 */
export interface UnassignedGeometry {
  /** Chains of real bodies that never reach ground, so they have no solvable position. */
  floatingChains: { joints: Joint[]; links: Link[] }[];
  /** Joints with no link at all. */
  looseJoints: Joint[];
}

export interface Partitioning {
  mechanisms: MechanismPartition[];
  unassigned: UnassignedGeometry;
}

/** Sort ids the way the alphabet does, with longer ids after the letters they extend. */
function byJointId(a: string, b: string): number {
  return a.length === b.length ? a.localeCompare(b) : a.length - b.length;
}

/**
 * Split a drawing into the machines it actually contains.
 *
 * Two bodies belong to the same mechanism when a joint holds them to each
 * other. Ground is not such a joint: it anchors what meets it without joining
 * those things to one another, so two cranks pinned to the same fixed point
 * turn independently and are two mechanisms, not one. Were ground allowed to
 * connect, every grounded chain in the drawing would collapse into a single
 * component and the whole distinction would be lost.
 *
 * A component that reaches ground is a mechanism — even one whose mobility is
 * wrong, because "your mechanism is 2-DoF" is a far more useful thing to say
 * than "you have no mechanism". A component that never reaches ground has no
 * solvable position at all, so it is not a mechanism yet and is reported as
 * unassigned instead.
 */
export function partitionMechanisms(
  joints: Joint[],
  links: Link[],
  forces: Force[] = []
): Partitioning {
  const { bodyOf, bodiesAt, movingBodies } = assignBodies(joints, links);

  const parent = new Map<string, string>();
  movingBodies.forEach((body) => parent.set(body, body));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) {
      root = parent.get(root)!;
    }
    return root;
  };
  const union = (left: string, right: string) => parent.set(find(left), find(right));

  const realJoints = joints.filter((joint): joint is RealJoint => joint instanceof RealJoint);

  // A grounded joint anchors; it does not connect. Everything else joins the
  // moving bodies that meet at it into one machine.
  realJoints
    .filter((joint) => !joint.ground)
    .forEach((joint) => {
      const moving = [...bodiesAt(joint)].filter((body) => parent.has(body));
      moving.slice(1).forEach((body) => union(moving[0], body));
    });

  const groundedComponents = new Set<string>();
  realJoints.forEach((joint) => {
    const bodies = bodiesAt(joint);
    if (!bodies.has(WORLD)) {
      return;
    }
    bodies.forEach((body) => {
      if (parent.has(body)) {
        groundedComponents.add(find(body));
      }
    });
  });

  const members = new Map<string, { joints: Set<Joint>; links: Set<Link> }>();
  const memberOf = (component: string) => {
    let entry = members.get(component);
    if (!entry) {
      entry = { joints: new Set(), links: new Set() };
      members.set(component, entry);
    }
    return entry;
  };

  const worldLinks: Link[] = [];
  links.forEach((link) => {
    const body = bodyOf(link);
    if (body === WORLD) {
      worldLinks.push(link);
      return;
    }
    const entry = memberOf(find(body));
    entry.links.add(link);
    link.joints.forEach((joint) => entry.joints.add(joint));
  });

  // An anchored bar is part of the world, which every machine shares. It is
  // handed to each component it touches rather than to one of them, so a
  // mechanism is never solved against a frame that is missing a piece.
  worldLinks.forEach((link) => {
    members.forEach((entry) => {
      if (link.joints.some((joint) => entry.joints.has(joint))) {
        entry.links.add(link);
        link.joints.forEach((joint) => entry.joints.add(joint));
      }
    });
  });

  // A slot's carrier and the two joints that draw its line live outside
  // `links` and `connectedJoints` (§2.3 Option A), so nothing above reaches
  // them. When the carrier is a *moving* link the slider's own body edge has
  // already pulled it in, but a slot cut into an anchored bar is part of the
  // world and has no edge -- and a mechanism handed its sliders without the
  // rails they run on does not fail loudly. It solves something else: the
  // gripper's arms wandered off and never closed their cycle.
  //
  // Repeated to a fixed point because a carrier can itself carry a slider.
  for (let settled = false; !settled;) {
    settled = true;
    members.forEach((entry) => {
      [...entry.joints].forEach((joint) => {
        if (!(joint instanceof PrisJoint)) {
          return;
        }
        const rails: (Link | Joint | undefined)[] = [
          joint.carrier,
          joint.slotJointA,
          joint.slotJointB,
        ];
        rails.forEach((part) => {
          if (!part) return;
          if (part instanceof Joint) {
            if (!entry.joints.has(part)) {
              entry.joints.add(part);
              settled = false;
            }
            return;
          }
          if (!entry.links.has(part)) {
            entry.links.add(part);
            settled = false;
          }
          part.joints.forEach((railJoint) => {
            if (!entry.joints.has(railJoint)) {
              entry.joints.add(railJoint);
              settled = false;
            }
          });
        });
      });
    });
  }

  // A grounded joint sits on the frame, so it belongs to every machine bolted
  // to it — added by body above, and by name here for a joint whose links all
  // turned out to be world.
  realJoints
    .filter((joint) => joint.ground)
    .forEach((joint) => {
      joint.links.forEach((link) => {
        const body = bodyOf(link);
        if (body !== WORLD && members.has(find(body))) {
          memberOf(find(body)).joints.add(joint);
        }
      });
    });

  const componentIds = [...members.keys()];
  const lowestJointId = (component: string) =>
    [...memberOf(component).joints].map((joint) => joint.id).sort(byJointId)[0] ?? '';

  const grounded = componentIds
    .filter((component) => groundedComponents.has(component))
    .sort((a, b) => byJointId(lowestJointId(a), lowestJointId(b)));

  const mechanisms: MechanismPartition[] = grounded.map((component, index) => {
    const entry = memberOf(component);
    const partitionLinks = [...entry.links];
    return {
      id: `M${index + 1}`,
      joints: [...entry.joints],
      links: partitionLinks,
      forces: forces.filter((force) => partitionLinks.some((link) => link.id === force.link?.id)),
    };
  });

  const floatingChains = componentIds
    .filter((component) => !groundedComponents.has(component))
    .sort((a, b) => byJointId(lowestJointId(a), lowestJointId(b)))
    .map((component) => {
      const entry = memberOf(component);
      return { joints: [...entry.joints], links: [...entry.links] };
    });

  const placed = new Set<Joint>();
  members.forEach((entry) => entry.joints.forEach((joint) => placed.add(joint)));
  const looseJoints = joints.filter((joint) => !placed.has(joint));

  return { mechanisms, unassigned: { floatingChains, looseJoints } };
}
