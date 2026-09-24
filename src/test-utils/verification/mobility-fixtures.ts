import { MechanismFixture } from './fixture';
import type { GalleryEntry } from './fixture-gallery';
import { cylinderBoomFixture } from './slot-fixtures';

/**
 * Drawings that do not run because they have the wrong number of degrees of
 * freedom, each built to have one answer to "which part, and what would fix it".
 *
 * They are the shapes the in-app feedback form kept receiving with the question
 * "why won't this animate?": a four-bar whose far pivot was never grounded, a
 * chain that hangs off its input with nothing on its end, a linkage with a
 * brace across it, a pin grounded once too often, an input on a link pinned
 * down at both ends, a braced linkage whose count reads right only because a
 * link dangles off it, and a slider that is not allowed to turn. `free-motion.ts` names the loose parts and counts the fixes;
 * `mobility-diagnosis.spec.ts` asserts on these. None of them solves, on
 * purpose but the crank-rocker, and `e2e/gallery-sweep.mjs` lists them as
 * expected not to.
 */

/**
 * A four-bar with D left ungrounded: three links on one ground pin, two degrees
 * of freedom. With the crank held, BC and CD still fold about B. Grounding D is
 * the one edit that finishes it.
 */
export function ungroundedPivotFourBarFixture(): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: 1, y: 2 },
      { id: 'C', x: 4, y: 3 },
      { id: 'D', x: 4, y: 0 },
    ],
    links: [{ joints: 'AB' }, { joints: 'BC' }, { joints: 'CD' }],
    inputAngVel: 1,
  };
}

/**
 * A crank with a second link hanging off it: two degrees of freedom, and no
 * single ground finishes it -- grounding C leaves the pair rigid. What finishes
 * it is a link from C to a new ground, which is how a four-bar is built.
 */
export function danglingLinkFixture(): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: 1, y: 1 },
      { id: 'C', x: 3, y: 1.5 },
    ],
    links: [{ joints: 'AB' }, { joints: 'BC' }],
    inputAngVel: 1,
  };
}

/**
 * A four-bar braced by a diagonal from B to the ground pivot D: a triangle that
 * cannot move. Deleting the brace is the only single edit that frees it without
 * taking the input's own link away.
 */
export function bracedFourBarFixture(): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: 1, y: 2 },
      { id: 'C', x: 4, y: 3 },
      { id: 'D', x: 4, y: 0, ground: true },
    ],
    links: [{ joints: 'AB' }, { joints: 'BC' }, { joints: 'CD' }, { joints: 'BD' }],
    inputAngVel: 1,
  };
}

/**
 * A four-bar with its coupler pin C grounded as well: the crank and coupler are
 * a triangle on two ground pins, and nothing can move. Ungrounding C is the fix.
 */
export function overGroundedFourBarFixture(): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: 1, y: 2 },
      { id: 'C', x: 4, y: 3, ground: true },
      { id: 'D', x: 4, y: 0, ground: true },
    ],
    links: [{ joints: 'AB' }, { joints: 'BC' }, { joints: 'CD' }],
    inputAngVel: 1,
  };
}

/**
 * A slider-crank whose slider is Prismatic: the rod may not turn against the
 * guide, while the crank pin it is attached to moves on a circle. Nothing can
 * move until the slider is a Pin-in-slot.
 */
export function lockedSliderCrankFixture(): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: 1, y: 1 },
      { id: 'C', x: 4, y: 0 },
    ],
    links: [{ joints: 'AB' }, { joints: 'BC' }],
    sliders: [{ at: 'C', angleRad: 0 }],
    welds: ['C'],
    inputAngVel: 1,
  };
}

/**
 * The cylinder-driven boom with a link left hanging off its tip: two degrees of
 * freedom, and the loose part is the dangling link. The cylinder is the input,
 * so holding it still is a slide held along its own axis, and neither joint the
 * cylinder places for itself -- the buried inner end and the square it slides
 * on -- may be named or offered as a fix.
 */
export function boomWithDanglingLinkFixture(): MechanismFixture {
  const boom = cylinderBoomFixture();
  return {
    ...boom,
    joints: [...boom.joints, { id: 'E', x: 1.5, y: 5 }],
    links: [...boom.links, { joints: 'CE' }],
  };
}

/**
 * A crank grounded at both ends, with the input on its pivot: the drawing that
 * was reported. The crank is frame, so no mechanism owns the input, and the
 * link hanging off it was told "No input is set" beside the input's own arrow.
 * The input cannot turn a link that is pinned down twice; ungrounding B lets it.
 */
export function inputOnTheFrameFixture(): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: 1, y: 1, ground: true },
      { id: 'C', x: 3, y: 1.5 },
    ],
    links: [{ joints: 'AB' }, { joints: 'BC' }],
    inputAngVel: 1,
  };
}

/**
 * A four-bar A-C-E-B with a bar DHI across it, and a link HK hanging off that
 * bar: the drawing that was reported as "a dead position". The four-bar and the
 * bar across it are rigid, which counts zero; HK swings freely, which counts
 * one; so the total reads one and the input cannot turn at all. No drag frees
 * it. Deleting CE does, and is the only single deletion that leaves HK attached.
 */
export function stuckInputFixture(): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: 7, y: 0.2, ground: true },
      { id: 'C', x: -0.2, y: 2 },
      { id: 'D', x: 0.85, y: 2 },
      { id: 'E', x: 3.3, y: 3.7 },
      { id: 'H', x: 3.1, y: 2.5 },
      { id: 'I', x: 4.8, y: 3.1 },
      { id: 'K', x: 3.7, y: 1.4 },
    ],
    links: [
      { joints: 'ACD' },
      { joints: 'CE' },
      { joints: 'DHI' },
      { joints: 'BEI' },
      { joints: 'HK' },
    ],
    inputAngVel: 1,
  };
}

/**
 * A crank-rocker driven from its rocker, drawn at the end of the rocker's swing
 * with crank and coupler in one line. It runs -- the solver turns back at the
 * limit -- and it is here for what the diagnosis must not say about it: the
 * rocker is still for an instant, and on its own it turns, so it is not stuck.
 */
export function rockerAtItsLimitFixture(): MechanismFixture {
  // Ground 3, crank 1, coupler 3, rocker 2: C is 4 from A and 2 from D.
  const y = Math.sqrt(3.75);
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true },
      { id: 'B', x: 0.875, y: y / 4 },
      { id: 'C', x: 3.5, y },
      { id: 'D', x: 3, y: 0, ground: true, input: true },
    ],
    links: [{ joints: 'AB' }, { joints: 'BC' }, { joints: 'CD' }],
    inputAngVel: 1,
  };
}

/**
 * These drawings as the fixture gallery publishes them, so a reviewer can open
 * each one and read the readiness row it earns. Kept here rather than in
 * `fixture-gallery.ts`, which is a table long enough already.
 */
export const MOBILITY_GALLERY: GalleryEntry[] = [
  {
    name: 'Four-bar with an ungrounded pivot',
    purpose: 'Does not run on purpose: D was never grounded, and grounding it is the fix',
    spec: 'mobility-diagnosis.spec.ts',
    floatingSlot: false,
    fixture: ungroundedPivotFourBarFixture(),
  },
  {
    name: 'Crank with a dangling link',
    purpose: 'Does not run on purpose: no single ground fixes it, a link from C to ground does',
    spec: 'mobility-diagnosis.spec.ts',
    floatingSlot: false,
    fixture: danglingLinkFixture(),
  },
  {
    name: 'Cylinder boom with a dangling link',
    purpose:
      "Does not run on purpose: the loose link is named, the cylinder's own joints never are",
    spec: 'mobility-diagnosis.spec.ts',
    floatingSlot: true,
    slide: true,
    fixture: boomWithDanglingLinkFixture(),
  },
  {
    name: 'Braced four-bar',
    purpose:
      'Does not run on purpose: a diagonal brace locks it, and deleting the brace is the fix',
    spec: 'mobility-diagnosis.spec.ts',
    floatingSlot: false,
    fixture: bracedFourBarFixture(),
  },
  {
    name: 'Four-bar with a grounded coupler pin',
    purpose: 'Does not run on purpose: C is grounded once too often, and ungrounding it is the fix',
    spec: 'mobility-diagnosis.spec.ts',
    floatingSlot: false,
    fixture: overGroundedFourBarFixture(),
  },
  {
    name: 'Crank grounded at both ends',
    purpose:
      'Does not run on purpose: the input is on a link that is frame, and ungrounding B frees it',
    spec: 'mobility-diagnosis.spec.ts',
    floatingSlot: false,
    fixture: inputOnTheFrameFixture(),
  },
  {
    name: 'Braced four-bar with a dangling link',
    purpose:
      'Does not run on purpose: counts one freedom, but it is the dangling link; the input cannot turn',
    spec: 'mobility-diagnosis.spec.ts',
    floatingSlot: false,
    fixture: stuckInputFixture(),
  },
  {
    name: 'Crank-rocker driven from the rocker at its limit',
    purpose: 'Runs, turning back at the limit; the rocker is still there for an instant, not stuck',
    spec: 'mobility-diagnosis.spec.ts',
    floatingSlot: false,
    fixture: rockerAtItsLimitFixture(),
  },
  {
    name: 'Slider-crank with a Prismatic slider',
    purpose: 'Does not run on purpose: the rod may not turn, and a Pin-in-slot is the fix',
    spec: 'mobility-diagnosis.spec.ts',
    floatingSlot: false,
    slide: true,
    fixture: lockedSliderCrankFixture(),
  },
];
