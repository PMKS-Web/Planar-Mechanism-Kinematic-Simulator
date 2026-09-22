/**
 * Where the two joints a cylinder owns belong, and what a change of Object Size
 * does about it (decision S29).
 *
 * N and S are derived rather than drawn (decision S2), so something has to work
 * out where they go and hand the answer to whoever writes joints. There are two
 * occasions. After **every rebuild** they are simply put back on the axis at the
 * lengths their own bars already have, which for a cylinder that is already
 * straight writes nothing. After a change of **Object Size** they may be
 * somewhere no barrel can reach, and that is the repair below.
 *
 * Both produce the same thing -- placements, and the bars whose own length
 * changed -- because both are the same promise: these two joints are the
 * cylinder's to place and nothing else's.
 *
 * **Object Size is how a drawing is drawn. It never moves a joint a reader can
 * see, and it never leaves a cylinder in two pieces.** Every other part of the
 * app holds that without being asked: a bar's outline is rebuilt at the new
 * width, a joint is drawn at the new radius, and nothing about the linkage
 * changes. A cylinder is the exception, because the *drawn* head and the
 * clearance behind it are measured in R while the joints and the member lengths
 * are not — so changing R moves the head's travel out from under a head that
 * stayed where it was, and the part comes apart at the mouth.
 *
 * Every *edit* of a cylinder already begins by putting the head back inside its
 * travel; a change of Object Size is not an edit, so nothing repaired it until
 * the reader next touched the part. This is the other door onto that same
 * repair — one function, asked from both — and it is deliberately the whole of
 * what a size change may do to the geometry: one placement per cylinder, for
 * the one joint the drawing never shows.
 *
 * The caller commits the placements and words the refusals, the way
 * `GridUtilsService` does for S19's "as far as it goes": only the caller knows
 * how a part is named on screen.
 */

import { Cylinder, derivedInterior } from './cylinder';
import { CylinderEditContext, rescaleCylinder } from './cylinder-edit';
import { Joint } from './joint';
import { Link } from './link';

/** Joints to write, and the bars whose own length writing them changes. */
export interface CylinderPlacements {
  /** Where each derived joint goes, by joint id. */
  placements: Map<string, { x: number; y: number }>;
  /**
   * The bars this reshaped.
   *
   * Each goes through the rebuild a reshaped bar gets from an edit -- outline,
   * length and angle, an automatic center of mass -- and only the one whose own
   * length changed, so straightening a barrel does not carry a hand-placed
   * center of mass on the rod through a frame that never moved.
   */
  reshaped: Link[];
}

/**
 * Put N and S where the cylinder says they are, whatever wrote them.
 *
 * On the axis between the mounts, each at the length its own bar already has.
 * The mounts are the reader's handles and are never touched, and a cylinder
 * that is already straight contributes nothing, which is the common case on
 * every rebuild.
 *
 * It used to be a *repair*, planned like any edit -- which meant it could be
 * refused, could carry a welded bracket round with it, and had to argue
 * silently with locks on a pass that runs on every keystroke that rebuilds.
 * Writing only the two joints nothing else may write needs none of that.
 */
export function planDerivedInteriors(cylinders: readonly Cylinder[]): CylinderPlacements {
  const plan: CylinderPlacements = { placements: new Map(), reshaped: [] };
  for (const sealed of cylinders) {
    const derived = derivedInterior(sealed);
    if (!derived) continue;
    if (!settled(sealed.inner, derived.inner)) {
      plan.placements.set(sealed.inner.id, derived.inner);
      plan.reshaped.push(sealed.barrel);
    }
    if (!settled(sealed.seal, derived.seal)) {
      plan.placements.set(sealed.seal.id, derived.seal);
      plan.reshaped.push(sealed.rod);
    }
  }
  return plan;
}

/** One part that could not be made whole, said. */
export interface CylinderRescaleRefusal {
  cylinder: Cylinder;
  code: string;
  text: string;
}

/** Everything a change of Object Size asks of the drawing, before any of it lands. */
export interface CylinderRescalePlan extends CylinderPlacements {
  /** One per part that could not be made whole, ready to say out loud. */
  refusals: CylinderRescaleRefusal[];
  /**
   * The parts whose repair had to outrun the rod's floor.
   *
   * Not a refusal and not said out loud: the picture is right and the reader
   * has nothing to do about it. Reported because a test wants to know which
   * branch ran, and because it is the one thing S29 gives up to keep the part
   * in one piece.
   */
  pastRodFloor: Cylinder[];
}

const NO_TRAVEL = 'cylinder.rescale-fixed-length';
const OUT_OF_REACH = 'cylinder.rescale-out-of-reach';

/** How far a joint may be from where it belongs and still be left alone. */
const SETTLED = 1e-6;

/**
 * Work out what the new Object Size leaves each cylinder needing.
 *
 * Nothing is written here. A part already drawable at this R contributes
 * nothing at all, which is the common case — most drawings hold no cylinder,
 * and most cylinders are nowhere near either end of their travel.
 */
export function planCylinderRescale(
  cylinders: readonly Cylinder[],
  contextFor: (cylinder: Cylinder) => CylinderEditContext,
  /** What the reader calls this part. Only the caller knows (decision S20). */
  nameOf: (cylinder: Cylinder) => string
): CylinderRescalePlan {
  const plan: CylinderRescalePlan = {
    placements: new Map(),
    reshaped: [],
    refusals: [],
    pastRodFloor: [],
  };
  for (const cylinder of cylinders) {
    const answer = rescaleCylinder(cylinder, contextFor(cylinder));
    if (answer.whole) continue;
    if ('blocked' in answer) {
      plan.refusals.push(refusalFor(cylinder, answer.blocked, nameOf(cylinder)));
      continue;
    }
    // The pose moves N and nothing else by construction — it is measured from
    // A along A→B, at the seal's own place and the rod's own length — so this
    // takes the one point it is allowed to take and leaves the rest of the
    // pose on the floor.
    if (!settled(cylinder.inner, answer.pose.inner)) {
      plan.placements.set(cylinder.inner.id, answer.pose.inner);
      plan.reshaped.push(cylinder.barrel);
    }
    if (answer.pastRodFloor) plan.pastRodFloor.push(cylinder);
  }
  return plan;
}

function settled(joint: Joint, at: { x: number; y: number }): boolean {
  return Math.abs(joint.x - at.x) < SETTLED && Math.abs(joint.y - at.y) < SETTLED;
}

/**
 * The two ways a part can be left standing, in the voice readiness already uses
 * for a cylinder with no travel — which names Object Size as the way out, and
 * has to agree with this.
 */
function refusalFor(
  cylinder: Cylinder,
  blocked: 'fixed-length' | 'no-barrel-reaches',
  name: string
): CylinderRescaleRefusal {
  // The reader's own nouns (`docs/ui-vocabulary.md`): the black block is a
  // joint and is called one, and an end is an end joint -- never a head, a seal
  // or a mount. Both joints here wear a letter, so the sentence can point.
  const lettered = (joint: Joint) => `joint ${joint.name || joint.id}`;
  const slide = lettered(cylinder.seal);
  const said =
    blocked === 'fixed-length'
      ? `its barrel is fixed at its length, so it cannot reach out to ${slide} at this size. Release the fixed length, or put Object Size back where it was.`
      : `at this size ${slide} stands too close to ${lettered(cylinder.mountA)} for any barrel to fit between them. Reduce Object Size, or drag the two apart.`;
  return {
    cylinder,
    code: blocked === 'fixed-length' ? NO_TRAVEL : OUT_OF_REACH,
    text: `Cylinder ${name} could not follow the new Object Size: ${said}`,
  };
}
