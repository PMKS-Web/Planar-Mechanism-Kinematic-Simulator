import { MechanismFixture } from './fixture';
import { pumpjackFixture } from './library-fixtures';

// Library cards drawn for a reader rather than for a spec. Each one replaced a
// verification fixture that was right for the test it was written for and
// wrong for a student opening the card: a pumpjack whose crank only rocked, a
// four-bar whose coupler curve nobody could see, a yoke that looked like the
// saw beside it. The fixtures those specs assert on are unchanged.

/** One rad/s, matching the rest of the verification suite. */
const INPUT_SPEED = 1;

/**
 * The library's first four-bar, pin for pin: the drawing a student has always
 * met first, so the two cards built on it look like the mechanism they know.
 */
export const FOUR_BAR_PINS = {
  A: { x: -3.129, y: -2.014 },
  B: { x: -2.622, y: 0.902 },
  C: { x: 3.009, y: 2.08 },
  D: { x: 3.341, y: -1.646 },
} as const;

/**
 * How far above the coupler's midpoint its traced point sits, as a fraction of
 * the coupler's length.
 *
 * A point on the bar itself draws a flattened oval that is easy to mistake for
 * the pin paths beside it. Lifted off the bar it draws the teardrop a coupler
 * curve is known by, which is the thing this card exists to show.
 */
const COUPLER_LIFT = 0.3;

/**
 * Where the traced point rides: off the coupler's midpoint, square to it, on
 * the side away from the ground pins.
 */
function couplerPoint(): { x: number; y: number } {
  const { B, C } = FOUR_BAR_PINS;
  const dx = C.x - B.x;
  const dy = C.y - B.y;
  return {
    x: (B.x + C.x) / 2 - dy * COUPLER_LIFT,
    y: (B.y + C.y) / 2 + dx * COUPLER_LIFT,
  };
}

/**
 * The Start Here four-bar: a crank-rocker whose coupler carries a traced point.
 *
 * The card says the coupler draws a curve, and the old drawing traced nothing,
 * so a reader had to find Trace on a joint they did not know to look for. The
 * coupler is a triangle here, the way a coupler point is drawn in every
 * textbook, and its third corner draws from the moment the card opens.
 */
export function fourBarCardFixture(): MechanismFixture {
  const { A, B, C, D } = FOUR_BAR_PINS;
  return {
    joints: [
      { id: 'A', ...A, ground: true, input: true },
      { id: 'B', ...B },
      { id: 'C', ...C },
      { id: 'D', ...D, ground: true },
      { id: 'T', ...couplerPoint(), trace: true },
    ],
    links: [{ joints: 'AB' }, { joints: 'BCT' }, { joints: 'CD' }],
    inputAngVel: INPUT_SPEED,
  };
}

/**
 * The same four bars, each holding a dimension: the crank its angle, the
 * coupler and the rocker their lengths.
 *
 * Drawn on the Four-Bar's own pins so a reader who has just opened that card
 * meets the same mechanism and can see that only the holds differ. Dragging a
 * joint then moves only what no hold pins down, which is the lesson.
 */
export function fixedLengthFourBarFixture(): MechanismFixture {
  const { A, B, C, D } = FOUR_BAR_PINS;
  return {
    joints: [
      { id: 'A', ...A, ground: true, input: true },
      { id: 'B', ...B },
      { id: 'C', ...C },
      { id: 'D', ...D, ground: true },
    ],
    links: [{ joints: 'AB' }, { joints: 'BC' }, { joints: 'CD' }],
    holds: [
      { link: 'AB', hold: 'angle' },
      { link: 'BC', hold: 'length' },
      { link: 'CD', hold: 'length' },
    ],
    inputAngVel: INPUT_SPEED,
  };
}

/**
 * The pumpjack driven the way a real one is: at the crank, from its gearbox.
 *
 * `pumpjackFixture` drives the pin where the pitman meets the beam, which is
 * the right fixture for what `pumpjack.spec.ts` asserts and the wrong picture
 * for a student, because its crank only rocks through 155 degrees. The crank
 * is the shortest bar of a Grashof chain next to the frame, so driven at its
 * ground pin it turns right round and the beam nods once per turn.
 */
export function crankDrivenPumpjackFixture(): MechanismFixture {
  const unit = pumpjackFixture();
  return {
    ...unit,
    joints: unit.joints.map(({ input: _input, ...joint }) =>
      joint.id === 'A' ? { ...joint, input: true } : joint
    ),
  };
}

/** The yoke drawing linked in the review of PR 45, in its own units. */
const YOKE = {
  crank: 1,
  /** The slot's ends, below and above the crank's center line. */
  slotFoot: -2,
  slotHead: 1.8,
  /** The rod's bearings, behind the crank and past the yoke. */
  rearBearing: -2.664,
  frontBearing: 3.344,
} as const;

/**
 * A Scotch yoke on a rod running through two bearings.
 *
 * The plain `scotchYokeFixture` hangs the yoke on one guide under its slot,
 * which is also how the Reciprocating Saw is drawn, so the two cards looked
 * alike. This is the machine as it is built: a disc crank, a pin in the
 * yoke's slot, and the yoke welded to a rod that slides through a bearing at
 * each end. Two guides on one body say the same thing twice, and the count is
 * rescued by the geometry, so the drawing still has one degree of freedom.
 */
export function scotchYokeOnRodFixture(): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: YOKE.crank, y: 0 },
      { id: 'C', x: YOKE.crank, y: YOKE.slotFoot },
      { id: 'D', x: YOKE.crank, y: YOKE.slotHead },
      // Where the rod meets the yoke, welded so the two move as one body.
      { id: 'E', x: YOKE.crank, y: 0 },
      { id: 'F', x: YOKE.rearBearing, y: 0 },
      { id: 'G', x: YOKE.frontBearing, y: 0, trace: true },
    ],
    links: [
      { joints: 'AB', circle: true },
      // The rod is two bars welded at E rather than one. A compound wears its
      // name at the middle of its longest piece, and a whole rod's middle
      // falls on the crank's own name, so the two printed over each other.
      { joints: 'CDEFG', subset: [{ joints: 'CDE' }, { joints: 'EF' }, { joints: 'EG' }] },
    ],
    sliders: [
      { at: 'B', on: { carrier: 'CDEFG', a: 'C', b: 'D' } },
      { at: 'F', angleRad: 0 },
      { at: 'G', angleRad: 0 },
    ],
    // The bearings are welded too: the rod slides through them without turning.
    welds: ['E', 'F', 'G'],
    inputAngVel: INPUT_SPEED,
  };
}
