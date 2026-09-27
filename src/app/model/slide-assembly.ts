import { Joint, PrisJoint } from './joint';
import { Link, RealLink } from './link';

/**
 * A Slide: a slider whose riders cannot turn against its slot, so the whole
 * assembly keeps the slot's angle (docs/joint-types-plan.md §2.1, §2.10).
 *
 * It used to be three objects arranged a certain way — a prismatic joint, a
 * coincident pin, and a zero-length block joining them — with `isWelded` on the
 * pin as the only record that the Slide existed. Stage 1 of
 * `docs/joint-type-and-cylinder-plan.md` made a slider one joint, so the record
 * is `rotates` on that joint and the structure is whatever rides it.
 *
 * Still resolved in one place rather than asked for locally, for the reason it
 * always was: the weld dispatcher, the reconcile rules, the mobility count, the
 * position solver, the kinematic solver's three registration paths and the panel
 * guard all have to agree about which bodies are held rigid, and each answering
 * for itself is how they drift.
 */
export interface SlideAssembly {
  /** The joint that slides, and the one that records the Slide. */
  slider: PrisJoint;
  /**
   * Every RealLink the slot holds rigid. Exactly one once the mechanism has
   * settled — a weld fuses the bars at a joint into one compound — but more
   * while an edit is mid-flight, which the reconcile pass repairs rather than
   * refuses.
   */
  riders: RealLink[];
  /** The slot is fixed in the world, so the assembly cannot rotate. */
  grounded: boolean;
}

/**
 * Whether making this joint a Slide would hold anything rigid.
 *
 * The weld path needs it before the flag is set: it has to choose which kind of
 * weld it is making, and a slider with nothing riding it has no rider to hold.
 */
export function isSlideCandidate(joint: Joint): boolean {
  return joint instanceof PrisJoint && ridersOf(joint).length > 0;
}

function ridersOf(slider: PrisJoint): RealLink[] {
  return slider.links.filter((link): link is RealLink => link instanceof RealLink);
}

/**
 * Resolve the Slide at a joint, or `undefined` if there is not one.
 *
 * `riders` may hold more than one link, deliberately: the flag can outrun the
 * compound mid-edit, because `mergeJoints` takes a weld apart and rebuilds it
 * around the survivor, and a deletion that collapses a compound leaves the flag
 * behind. Refusing here would make the reconcile pass read "not a Slide" and
 * destroy a weld the reader made.
 */
export function slideAssemblyAt(joint: Joint): SlideAssembly | undefined {
  if (!(joint instanceof PrisJoint) || joint.rotates) {
    return undefined;
  }
  const riders = ridersOf(joint);
  if (riders.length === 0) {
    return undefined;
  }
  return { slider: joint, riders, grounded: joint.ground };
}

/** Every Slide in a mechanism. */
export function slideAssemblies(joints: Joint[]): SlideAssembly[] {
  return joints
    .map((joint) => slideAssemblyAt(joint))
    .filter((assembly): assembly is SlideAssembly => assembly !== undefined);
}

/**
 * Every body the Slide holds rigid.
 *
 * The riders, and only them. The slider is a joint rather than a body now, so
 * there is no longer a block to name here — which is the one thing that changed
 * about this answer when the three objects became one.
 */
export function assemblyBodyIds(assembly: SlideAssembly): string[] {
  return assembly.riders.map((rider) => rider.id);
}

/**
 * How far a point sits off the slot line — the constraint a Slide's pose has to
 * satisfy, as a pure function of geometry (§2.7a item 3).
 *
 * The position step divides this by the guide-slot cross product to get how far
 * to slide; a test asserts it vanishes at the answer. Both reading it from here
 * is what stops the check from re-deriving the arithmetic it is checking.
 */
export function slotOffset(
  point: { x: number; y: number },
  reference: { x: number; y: number },
  slot: [number, number]
): number {
  return (point.x - reference.x) * slot[1] - (point.y - reference.y) * slot[0];
}

/**
 * Whether a link's orientation is held fixed by a Slide on a grounded guide.
 *
 * The kinematic solver has three separate places that hand a body an angular
 * unknown, and every one of them has to ask this. Gating only the one the
 * Scotch yoke happens to use would pass Gate 3 while leaving a welded rider
 * reached through an ordinary link edge with a spurious column — which the
 * matrix then solves and writes over the seeded zero, producing a wrong number
 * rather than a singular system.
 */
export function hasFixedOrientation(link: Link, assemblies: SlideAssembly[]): boolean {
  return assemblies.some(
    (assembly) => assembly.grounded && assembly.riders.some((rider) => rider.id === link.id)
  );
}
