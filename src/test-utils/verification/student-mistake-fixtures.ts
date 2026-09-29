import { MechanismFixture } from './fixture';
import type { GalleryEntry } from './fixture-gallery';

/**
 * One drawing for each thing the setup drawer learned to say from following
 * its own advice on broken student drawings (`student-mistakes.spec.ts`).
 *
 * Each is a four-bar -- or once a Watt six-bar, once a Scotch yoke -- with one
 * mistake a student makes with a click: a pin welded, a joint dropped beside
 * another, a link hung off a pivot, a bar from the input's pivot, two inputs, a
 * stray link, a moving joint grounded, a link deleted, the input on a coupler
 * point, a weld left off a bent coupler, a yoke's guide left free to turn. Two
 * are not mistakes at all and must still run: the frame drawn as a bar, and a
 * second input the drawer only warns about. `student-mistake-messages.spec.ts`
 * holds the exact sentence each one earns.
 */

const A = { id: 'A', x: 0, y: 0, ground: true, input: true };
const B = { id: 'B', x: 0.5, y: 1 };
const C = { id: 'C', x: 3, y: 2 };
const D = { id: 'D', x: 4, y: 0, ground: true };

/** The four-bar every other drawing here starts from. */
function fourBar(): MechanismFixture {
  return {
    joints: [{ ...A }, { ...B }, { ...C }, { ...D }],
    links: [{ joints: 'AB' }, { joints: 'BC' }, { joints: 'CD' }],
    inputAngVel: 1,
  };
}

/** The coupler pin C set to Welded: coupler and rocker one body, and nothing moves. */
export function weldedCouplerPinFixture(): MechanismFixture {
  const fixture = fourBar();
  fixture.links = [
    { joints: 'AB' },
    { joints: 'BCD', subset: [{ joints: 'BC' }, { joints: 'CD' }] },
  ];
  fixture.welds = ['C'];
  return fixture;
}

/** The rocker's top end dropped a hair from the coupler pin, not on it: two machines. */
export function rockerBesideCouplerFixture(): MechanismFixture {
  const fixture = fourBar();
  fixture.joints.push({ id: 'E', x: 3.08, y: 1.94 });
  fixture.links = [{ joints: 'AB' }, { joints: 'BC' }, { joints: 'DE' }];
  return fixture;
}

/** A link hung off the rocker's pivot and nothing else, turning on its own. */
export function linkHangingFromPivotFixture(): MechanismFixture {
  const fixture = fourBar();
  fixture.joints.push({ id: 'E', x: 5, y: 1.2 });
  fixture.links.push({ joints: 'DE' });
  return fixture;
}

/** A bar drawn from the input's pivot to the coupler pin: three bodies on the input. */
export function braceAtInputFixture(): MechanismFixture {
  const fixture = fourBar();
  fixture.links.push({ joints: 'AC' });
  return fixture;
}

/**
 * A second crank drawn from the driven pivot, its coupler landing on the rocker
 * pin: the count is one, and the input has two links to turn.
 */
export function secondCrankOnTheInputFixture(): MechanismFixture {
  const fixture = fourBar();
  fixture.joints.push({ id: 'E', x: -0.8, y: 0.9 });
  fixture.links.push({ joints: 'AE' }, { joints: 'CE' });
  return fixture;
}

/** Both ground pivots set as the input. It runs, from one of them. */
export function twoInputsFixture(): MechanismFixture {
  const fixture = fourBar();
  fixture.joints[3].input = true;
  return fixture;
}

/** A link drawn off to the side, attached to nothing. The four-bar still runs. */
export function strayLinkFixture(): MechanismFixture {
  const fixture = fourBar();
  fixture.joints.push({ id: 'E', x: 6, y: 1 }, { id: 'F', x: 7, y: 2 });
  fixture.links.push({ joints: 'EF' });
  return fixture;
}

/**
 * A Watt six-bar with the rocker's third joint E grounded: the linkage splits
 * at E into two machines, each rigid, and only ungrounding E -- counted on both
 * halves together -- puts it back.
 */
export function groundedWattJointFixture(): MechanismFixture {
  return {
    joints: [
      { ...A },
      { ...B },
      { ...C },
      { ...D },
      { id: 'E', x: 3.6, y: 2.8, ground: true },
      { id: 'F', x: 5.5, y: 2.2 },
      { id: 'G', x: 6.5, y: 0, ground: true },
    ],
    links: [
      { joints: 'AB' },
      { joints: 'BC' },
      { joints: 'CDE' },
      { joints: 'EF' },
      { joints: 'FG' },
    ],
    inputAngVel: 1,
  };
}

/** The rocker deleted, its pivot D left behind with nothing on it. */
export function deletedRockerFixture(): MechanismFixture {
  const fixture = fourBar();
  fixture.links = [{ joints: 'AB' }, { joints: 'BC' }];
  return fixture;
}

/** The frame drawn as a bar between the two pivots, the way a textbook draws it. It runs. */
export function frameBarFixture(): MechanismFixture {
  const fixture = fourBar();
  fixture.links.push({ joints: 'AD' });
  return fixture;
}

/** The input on the coupler point E, which is on one body only. */
export function inputOnCouplerPointFixture(): MechanismFixture {
  const fixture = fourBar();
  fixture.joints[0].input = false;
  fixture.joints.push({ id: 'E', x: 2, y: 2.4, input: true });
  fixture.links[1] = { joints: 'BCE' };
  return fixture;
}

/**
 * A four-bar whose coupler is bent at C, drawn as two links with the weld at
 * the knee left off: a five-bar, one freedom too many, and welding C is the fix.
 */
export function unweldedKneeFixture(): MechanismFixture {
  return {
    joints: [{ ...A }, { ...B }, { id: 'C', x: 1.6, y: 2.6 }, { ...D }, { id: 'E', x: 3.4, y: 2 }],
    links: [{ joints: 'AB' }, { joints: 'BC' }, { joints: 'CE' }, { joints: 'DE' }],
    inputAngVel: 1,
  };
}

/**
 * A Scotch yoke whose yoke rides its guide C as a Pin-in-slot, so the yoke can
 * turn as well as slide: one freedom too many, and making C Prismatic is the fix.
 */
export function yokeOnPinInSlotFixture(): MechanismFixture {
  return {
    joints: [
      { ...A },
      { id: 'B', x: 0.4, y: 0.8 },
      { id: 'C', x: 0.4, y: -1.6 },
      { id: 'D', x: 0.4, y: 2 },
    ],
    links: [{ joints: 'AB' }, { joints: 'CD' }],
    sliders: [
      { at: 'B', on: { carrier: 'CD', a: 'C', b: 'D' } },
      { at: 'C', angleRad: 0 },
    ],
    inputAngVel: 1,
  };
}

/**
 * Two things wrong at once, neither waiting on the other: a link hung off the
 * coupler pin, one freedom too many, and no input set.
 */
export function hangingLinkNoInputFixture(): MechanismFixture {
  const fixture = fourBar();
  fixture.joints[0].input = false;
  fixture.joints.push({ id: 'E', x: 2, y: 3 });
  fixture.links.push({ joints: 'CE' });
  return fixture;
}

/**
 * The input on a coupler point, and a link hung off the coupler pin: a joint
 * that cannot be the input, and one freedom too many, said together.
 */
export function couplerInputAndHangingLinkFixture(): MechanismFixture {
  const fixture = inputOnCouplerPointFixture();
  fixture.joints.push({ id: 'F', x: 4, y: 3 });
  fixture.links.push({ joints: 'CF' });
  return fixture;
}

/**
 * A crank plate turning about its input D, with a link hanging loose from each
 * of its other corners: three degrees of freedom, and no single edit leaves
 * one. Each loose link needs a fix of its own.
 */
export function plateWithTwoHangingLinksFixture(): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: -2, y: 1.5 },
      { id: 'B', x: -1, y: 0.5 },
      { id: 'D', x: 0, y: 0, ground: true, input: true },
      { id: 'F', x: 1.5, y: 0.8 },
      { id: 'G', x: 3, y: 0.4 },
    ],
    links: [{ joints: 'AB' }, { joints: 'BDF' }, { joints: 'FG' }],
    inputAngVel: 1,
  };
}

/**
 * The same plate with G grounded: FG holds the plate still against the ground,
 * so the input can't turn, and AB still hangs loose.
 */
export function plateHeldByAGroundedLinkFixture(): MechanismFixture {
  const fixture = plateWithTwoHangingLinksFixture();
  fixture.joints[4].ground = true;
  return fixture;
}

/**
 * A crank and a link both grounded, joined at a pin that rides a plate's slot:
 * the crank, the link and the ground are a rigid triangle, so the input cannot
 * turn from any start. The count still reads one, because the plate, hung from
 * a grounded link, swings about the pin. It was reported as a start at a limit
 * and sent the reader to drag a joint off it.
 */
export function crankLockedAtASlotPinFixture(): MechanismFixture {
  const B = { x: -3.095, y: 0.715 };
  const D = { x: 2.51, y: 0.74 };
  const along = (x: number) => B.y + ((D.y - B.y) * (x - B.x)) / (D.x - B.x);
  return {
    joints: [
      { id: 'B', ...B },
      { id: 'D', ...D },
      { id: 'E', x: -0.385, y: 2.84 },
      { id: 'F', x: -2.675, y: 3.365, ground: true },
      { id: 'H', x: -2.29, y: -2.105, ground: true, input: true },
      { id: 'I', x: -0.375, y: along(-0.375) },
      { id: 'J', x: 1.82, y: -2.105, ground: true },
    ],
    links: [{ joints: 'BDE' }, { joints: 'EF' }, { joints: 'HI' }, { joints: 'IJ' }],
    sliders: [{ at: 'I', on: { carrier: 'BDE', a: 'B', b: 'D' } }],
    inputAngVel: 1,
  };
}

/** A Stephenson six-bar with a link hung off its rocker pivot, its free end a hair from F. */
export function sixBarLinkHungBesideAJointFixture(): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: -0.404, y: 0.604 },
      { id: 'C', x: 2.364, y: 1.476 },
      { id: 'D', x: 3.362, y: 0, ground: true },
      { id: 'E', x: 0.605, y: 2.229 },
      { id: 'F', x: 3.822, y: 1.322 },
      { id: 'G', x: 5.467, y: 0, ground: true },
      { id: 'H', x: 3.939, y: 1.09 },
    ],
    links: [
      { joints: 'AB' },
      { joints: 'BCE' },
      { joints: 'CD' },
      { joints: 'EF' },
      { joints: 'FG' },
      { joints: 'DH' },
    ],
    inputAngVel: 1,
  };
}

/** A slider-crank whose rod was dropped a little short of the crank pin, not on it. */
export function rodShortOfTheCrankPinFixture(): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: -0.301, y: 0.57 },
      { id: 'C', x: 2.978, y: -0.176 },
      { id: 'D', x: -0.366, y: 0.572 },
    ],
    links: [{ joints: 'AB' }, { joints: 'CD' }],
    sliders: [{ at: 'C', angleRad: 0 }],
    inputAngVel: 1,
  };
}

/** A four-bar whose coupler was never drawn: a crank and a rocker, each on its own pivot. */
export function missingCouplerFixture(): MechanismFixture {
  const fixture = fourBar();
  fixture.links = [{ joints: 'AB' }, { joints: 'CD' }];
  return fixture;
}

/** The rocker's top end dropped exactly on the coupler pin, and still a joint of its own. */
export function rockerOnTheCouplerPinFixture(): MechanismFixture {
  const fixture = rockerBesideCouplerFixture();
  const e = fixture.joints.find((joint) => joint.id === 'E')!;
  e.x = C.x;
  e.y = C.y;
  return fixture;
}

/** The rocker's top end dropped beside the coupler pin, and locked where it fell. */
export function lockedRockerBesideCouplerFixture(): MechanismFixture {
  const fixture = rockerBesideCouplerFixture();
  fixture.locks = { joints: ['E'] };
  return fixture;
}

/** A Scotch yoke with a bar drawn from the crank pin to the yoke, bracing it rigid. */
export function bracedScotchYokeFixture(): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: -0.862, y: 0.539 },
      { id: 'C', x: -0.862, y: -1.213 },
      { id: 'D', x: -0.862, y: 1.561 },
    ],
    links: [{ joints: 'AB' }, { joints: 'CD' }, { joints: 'BD' }],
    sliders: [
      { at: 'B', on: { carrier: 'CD', a: 'C', b: 'D' } },
      { at: 'C', angleRad: 0 },
    ],
    welds: ['C'],
    inputAngVel: 1,
  };
}

/** A bent coupler welded at its knee, with the input set on the knee instead of the crank. */
export function inputOnTheWeldedKneeFixture(): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true },
      { id: 'B', x: 0.679, y: 0.551 },
      { id: 'C', x: 1.007, y: 1.867, input: true },
      { id: 'D', x: 3.152, y: 0, ground: true },
      { id: 'E', x: 2.325, y: 1.544 },
    ],
    links: [
      { joints: 'AB' },
      { joints: 'BCE', subset: [{ joints: 'BC' }, { joints: 'CE' }] },
      { joints: 'DE' },
    ],
    welds: ['C'],
    inputAngVel: 1,
  };
}

/** A bent coupler with its knee grounded and its weld left off: two mistakes at one joint. */
export function groundedKneeLeftUnweldedFixture(): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: 0.494, y: 0.409 },
      { id: 'C', x: 0.921, y: 1.601, ground: true },
      { id: 'D', x: 2.93, y: 0, ground: true },
      { id: 'E', x: 2.174, y: 1.414 },
    ],
    links: [{ joints: 'AB' }, { joints: 'BC' }, { joints: 'CE' }, { joints: 'DE' }],
    inputAngVel: 1,
  };
}

const entry = (
  name: string,
  purpose: string,
  fixture: MechanismFixture,
  runs = false
): GalleryEntry & { runs: boolean } => ({
  name,
  purpose,
  spec: 'student-mistake-messages.spec.ts',
  floatingSlot: (fixture.sliders ?? []).some((slider) => slider.on !== undefined),
  fixture,
  runs,
});

/** These drawings as the fixture gallery publishes them. */
export const STUDENT_MISTAKE_GALLERY = [
  entry(
    'Four-bar with a welded coupler pin',
    'Does not run on purpose: unwelding C is the fix',
    weldedCouplerPinFixture()
  ),
  entry(
    'Rocker dropped beside the coupler pin',
    'Does not run on purpose: E was meant to land on C',
    rockerBesideCouplerFixture()
  ),
  entry(
    'Link hanging from a pivot',
    'Does not run on purpose: link DE turns on the rocker pivot with nothing to drive it',
    linkHangingFromPivotFixture()
  ),
  entry(
    'Four-bar braced from its input pivot',
    'Does not run on purpose: the bar AC leaves the input three bodies',
    braceAtInputFixture()
  ),
  entry(
    'Four-bar with a second crank on its input',
    'Does not run on purpose: one freedom, but the input joins three bodies and names no pair',
    secondCrankOnTheInputFixture()
  ),
  entry(
    'Four-bar with two inputs',
    'Runs from A, with a warning that the input on D is ignored',
    twoInputsFixture(),
    true
  ),
  entry(
    'Four-bar with a stray link',
    'Runs; link EF is attached to nothing',
    strayLinkFixture(),
    true
  ),
  entry(
    'Watt six-bar with a grounded rocker joint',
    'Does not run on purpose: grounding E split it in two',
    groundedWattJointFixture()
  ),
  entry(
    'Four-bar with its rocker deleted',
    'Does not run on purpose: C and the pivot D left behind want a link',
    deletedRockerFixture()
  ),
  entry(
    'Four-bar with its frame drawn as a bar',
    'Runs: a bar between two pivots is the ground',
    frameBarFixture(),
    true
  ),
  entry(
    'Four-bar driven from its coupler point',
    'Does not run on purpose: E is on one body, and A can take the input',
    inputOnCouplerPointFixture()
  ),
  entry(
    'Four-bar with the weld at its knee left off',
    'Does not run on purpose: welding C makes the bent coupler one link',
    unweldedKneeFixture()
  ),
  entry(
    'Four-bar with a hanging link and no input',
    'Does not run on purpose: one freedom too many and no input, both said at once',
    hangingLinkNoInputFixture()
  ),
  entry(
    'Four-bar driven from its coupler point, with a hanging link',
    'Does not run on purpose: the input is on a coupler point and CF hangs loose, both said at once',
    couplerInputAndHangingLinkFixture()
  ),
  entry(
    'Crank plate with two links hanging loose',
    'Does not run on purpose: AB and FG each need a fix, and no single edit is enough',
    plateWithTwoHangingLinksFixture()
  ),
  entry(
    'Crank plate held by a grounded link',
    'Does not run on purpose: FG pins the plate to the ground, and AB hangs loose',
    plateHeldByAGroundedLinkFixture()
  ),
  entry(
    'Crank locked by a grounded link at a slot pin',
    'Does not run on purpose: the crank and link are a rigid triangle with the ground',
    crankLockedAtASlotPinFixture()
  ),
  entry(
    'Scotch yoke on a Pin-in-slot guide',
    'Does not run on purpose: the yoke turns on C; making C Prismatic is the fix',
    yokeOnPinInSlotFixture()
  ),
  entry(
    'Stephenson six-bar with a link hung beside a joint',
    'Does not run on purpose: DH hangs off the rocker pivot; merging H onto F would lock it',
    sixBarLinkHungBesideAJointFixture()
  ),
  entry(
    'Slider-crank with its rod short of the crank pin',
    'Does not run on purpose: D was meant to land on B',
    rodShortOfTheCrankPinFixture()
  ),
  entry(
    'Four-bar with its coupler missing',
    'Does not run on purpose: a link from C to B is the four-bar',
    missingCouplerFixture()
  ),
  entry(
    'Rocker dropped on the coupler pin',
    'Does not run on purpose: E sits exactly on C and is still a joint of its own',
    rockerOnTheCouplerPinFixture()
  ),
  entry(
    'Rocker dropped beside the coupler pin, locked',
    'Does not run on purpose: E is locked, so C is the one to drag',
    lockedRockerBesideCouplerFixture()
  ),
  entry(
    'Scotch yoke braced across its slot',
    'Does not run on purpose: deleting the brace BD is the fix',
    bracedScotchYokeFixture()
  ),
  entry(
    'Bent four-bar driven from its welded knee',
    'Does not run on purpose: A takes the input; unwelding C would free the knee',
    inputOnTheWeldedKneeFixture()
  ),
  entry(
    'Bent four-bar with its knee grounded and unwelded',
    'Does not run on purpose: two edits at C, ungrounding it and welding it',
    groundedKneeLeftUnweldedFixture()
  ),
];
