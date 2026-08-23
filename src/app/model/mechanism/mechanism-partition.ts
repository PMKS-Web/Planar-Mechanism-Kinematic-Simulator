import { Joint, PrisJoint, RealJoint } from '../joint';
import { Link } from '../link';
import { Force } from '../force';
import { assignBodies, WORLD } from './bodies';

/** One independently solvable machine within the drawing. */
export interface MechanismPartition {
  /**
   * Derived, never stored: M1, M2… in a stable order. See `partitionMechanisms`.
   *
   * A label, not an identity — it is the ordinal, and a rebuild renumbers it.
   * Anything pairing held state across a rebuild wants `partitionKey`.
   */
  id: string;
  /** Everything the solver has to be handed, frame pieces included. */
  joints: Joint[];
  /**
   * The joints this mechanism is actually made of.
   *
   * A subset of `joints`: a machine has to be solved against frame it shares
   * with others — a fixed bar between two frames, a rail a slider runs along —
   * and the far ends of those pieces belong to whatever else is bolted to them.
   * Ask this, not `joints`, whenever the question is "which of these is *mine*"
   * — which input drives me, which joint do I own.
   */
  ownJoints: Joint[];
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
  /** Bars pinned down at every joint: part of the frame, and part of no machine. */
  fixedLinks: Link[];
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
 * Which machine this *is*, as opposed to where it currently sits in the list.
 *
 * `id` is the ordinal the panels show, and an ordinal is exactly what a rebuild
 * renumbers: delete the first machine and the second becomes M1, inheriting
 * whatever clock and drive compensation was being held under that name. So
 * anything pairing held per-machine state across a rebuild keys on this
 * instead, and gets to discard the entries whose machine has gone.
 *
 * The lowest id among the joints the machine owns and the world does not.
 * Grounded joints are shared with every machine bolted to the same point, so
 * they cannot tell two cranks on one pivot apart; a moving joint belongs to
 * exactly one component by construction, because a joint between two moving
 * bodies is precisely what unions them.
 */
export function partitionKey(partition: MechanismPartition): string {
  const moving = partition.ownJoints
    .filter((joint) => !(joint instanceof RealJoint && joint.ground))
    .map((joint) => joint.id)
    .sort(byJointId);
  return moving[0] ?? partition.id;
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

  // `joints` is everything the solver has to be handed; `owned` is the subset
  // this component is actually made of. They differ because a mechanism needs
  // frame pieces -- an anchored bar its slider runs along, a fixed link between
  // two frames -- whose far ends belong to some other machine entirely. Without
  // the distinction those far ends look like this component's own joints, and a
  // second linkage's driven joint gets picked up as this one's input.
  const members = new Map<string, { joints: Set<Joint>; owned: Set<Joint>; links: Set<Link> }>();
  const memberOf = (component: string) => {
    let entry = members.get(component);
    if (!entry) {
      entry = { joints: new Set(), owned: new Set(), links: new Set() };
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
    link.joints.forEach((joint) => {
      entry.joints.add(joint);
      entry.owned.add(joint);
    });
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
          memberOf(find(body)).owned.add(joint);
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
      ownJoints: [...entry.owned],
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
  // Loose means *no link*, which is a different situation from a bar fixed at
  // both ends: that has links, cannot move, and belongs to no machine because
  // there is no machine to belong to. Calling those joints loose told the
  // reader to attach a link to something that already had one.
  const looseJoints = joints.filter(
    (joint) => !placed.has(joint) && (!(joint instanceof RealJoint) || joint.links.length === 0)
  );
  const fixedLinks = links.filter((link) => !placed.has(link.joints[0]) && link.joints.length > 0);

  return { mechanisms, unassigned: { floatingChains, looseJoints, fixedLinks } };
}
