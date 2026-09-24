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
    'The four-bar runs; link DE turns on its own with nothing to drive it',
    linkHangingFromPivotFixture(),
    true
  ),
  entry(
    'Four-bar braced from its input pivot',
    'Does not run on purpose: the bar AC leaves the input three bodies',
    braceAtInputFixture()
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
    'Scotch yoke on a Pin-in-slot guide',
    'Does not run on purpose: the yoke turns on C; making C Prismatic is the fix',
    yokeOnPinInSlotFixture()
  ),
];
