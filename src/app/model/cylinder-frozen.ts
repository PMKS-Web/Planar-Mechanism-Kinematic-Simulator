/**
 * A cylinder that cannot extend, because both of its ends are in one body
 * (decision S25).
 *
 * A sliding joint is a joint between **two** bodies. Weld a cylinder's two end
 * joints into the same body -- or pin the two bodies to each other at two
 * points, which says the same thing -- and the seal has one body on either side
 * of it. There is no relative freedom left for it to allow, so the part is not
 * a sliding pair at all: it is a fixed shape inside that body, carried by the
 * body's own motion like any other point of it.
 *
 * That reading is what makes the maintainer's drawing run. Everything else
 * about the part is unchanged -- it is still a cylinder, still drawn with a
 * barrel, a head and a rod, still selectable member by member -- and the only
 * thing it may not do is stroke.
 *
 * **One body, asked once.** `mechanism/bodies.ts` is where the app decides what
 * a rigid body is, and mobility and the partition both read it so they cannot
 * disagree; this asks the same question of the seal's two sides. Handed a
 * `bodyOf` it gets that answer in full, transitive merges and all. Handed
 * nothing it falls back to the two roots alone, which is the same rule
 * (`groupRigidBodies`: one body, or two sharing two joints) minus the
 * transitivity -- enough for every door that is given a joint and no drawing,
 * and never a false positive.
 *
 * The two sentences a reader may see about one live here as well, beside the
 * rule they quote, so the Add Input refusal and the readiness warning cannot
 * end up describing different parts.
 */

import { Cylinder, cylinderAtSeal } from './cylinder';
import { Joint } from './joint';
import { Link } from './link';
import { labelForBody } from './body-label';
import { sharedJointCount } from './rigid-bodies';

/** The half of `BodyAssignment` this question needs. */
export type BodyOfLink = (link: Link) => string;

/**
 * Whether these two bodies are one, from the bodies themselves.
 *
 * The local reading: the same link, or two links pinned to each other at two
 * joints, which is exactly what `groupRigidBodies` merges and for the same
 * reason -- the second pin constrains nothing the first did not.
 */
function oneBodyLocally(a: Link, b: Link): boolean {
  return a.id === b.id || sharedJointCount(a, b) >= 2;
}

/**
 * Whether this cylinder is a fixed part of one body rather than a sliding pair.
 *
 * `bodyOf` is `assignBodies`' own answer where the caller has a drawing to ask
 * it of. Without one the two roots are compared directly; see the file comment
 * for what that gives up.
 */
export function isFrozenCylinder(cylinder: Cylinder, bodyOf?: BodyOfLink): boolean {
  return bodyOf
    ? bodyOf(cylinder.barrelRoot) === bodyOf(cylinder.rodRoot)
    : oneBodyLocally(cylinder.barrelRoot, cylinder.rodRoot);
}

/**
 * The frozen cylinder this joint is the seal of, or nothing.
 *
 * Asked of the seal rather than of any of the four joints: what is frozen is
 * the *slide*, and the seal is where the slide is. An end joint of a frozen
 * cylinder is an ordinary pin of the body and has nothing to answer for.
 */
export function frozenCylinderAtSeal(joint: Joint, bodyOf?: BodyOfLink): Cylinder | undefined {
  const cylinder = cylinderAtSeal(joint);
  return cylinder && isFrozenCylinder(cylinder, bodyOf) ? cylinder : undefined;
}

/** What a reader calls this cylinder: its two end joints, as the panels title it. */
export function frozenCylinderName(cylinder: Cylinder): string {
  const named = (joint: { name: string; id: string }) => joint.name || joint.id;
  return `${named(cylinder.mountA)}${named(cylinder.mountB)}`;
}

/**
 * Where both end joints have ended up, as a phrase a sentence can carry.
 *
 * Welded into one body, that body has a name to point at and a weld to undo.
 * Held by two bodies pinned to each other at two joints there is neither, so
 * the phrase says what is true of both shapes and leaves the reader to pick.
 */
function frozenInto(cylinder: Cylinder): string {
  return cylinder.barrelRoot.id === cylinder.rodRoot.id
    ? `are welded into ${labelForBody(cylinder.barrelRoot, undefined, [cylinder])}`
    : 'are on one rigid body';
}

/** The ends a reader would free to let the part stroke again. */
function frozenEnds(cylinder: Cylinder): string {
  const named = (joint: { name: string; id: string }) => joint.name || joint.id;
  return `joint ${named(cylinder.mountA)} or joint ${named(cylinder.mountB)}`;
}

/** Why a drive may not be put on a frozen cylinder's seal, for `describeActuator`. */
export function describeFrozenCylinderDrive(cylinder: Cylinder): string {
  const free = cylinder.barrelRoot.id === cylinder.rodRoot.id ? 'Unweld' : 'Free';
  return (
    `Both of this cylinder's end joints ${frozenInto(cylinder)}, so it cannot extend. ` +
    `${free} ${frozenEnds(cylinder)}, or drive a different joint.`
  );
}

/**
 * What readiness says about a cylinder that will not stroke because it cannot.
 *
 * A warning rather than a blocker: the mechanism runs perfectly well, and the
 * only thing worth knowing is that the part a reader drew as a cylinder is
 * behaving as a shape. It replaces the "can only use 0% of its stroke" warning,
 * which blamed the linkage for binding and offered a shorter travel -- neither
 * of which is true of a part held still by its own body.
 */
export function describeFrozenCylinderStroke(cylinder: Cylinder): string {
  const free = cylinder.barrelRoot.id === cylinder.rodRoot.id ? 'Unweld' : 'Free';
  return (
    `Cylinder ${frozenCylinderName(cylinder)} is a fixed part of the body it is in: both of its ` +
    `end joints ${frozenInto(cylinder)}, so it is carried round rather than stroking. ` +
    `${free} ${frozenEnds(cylinder)} to give it travel again.`
  );
}
