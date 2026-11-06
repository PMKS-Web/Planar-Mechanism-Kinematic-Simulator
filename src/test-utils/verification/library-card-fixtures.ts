import { MechanismFixture } from './fixture';
import { toggleClampFixture } from './force-fixtures';
import { pumpjackFixture } from './library-fixtures';

// Library cards drawn for a reader rather than for a spec. Some replaced a
// verification fixture that was right for the test it was written for and
// wrong for a student opening the card: a pumpjack whose crank only rocked, a
// four-bar whose coupler curve nobody could see, a yoke that looked like the
// saw beside it. The fixtures those specs assert on are unchanged. The rest
// are cards the library had no drawing for at all.

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

/** The parallelogram's two equal cranks, and the frame its coupler matches. */
const PARALLELOGRAM = {
  crank: { x: 1.2, y: 1.6 },
  frame: 4,
  /** How far above the coupler its traced point sits. */
  lift: 1,
} as const;

/**
 * A parallelogram: two equal cranks, and a coupler as long as the frame.
 *
 * Opposite sides stay equal, so the coupler never turns: it is carried round
 * level, the way a desk lamp's arm carries its head. The coupler is a triangle
 * so that its staying upright can be seen, and its top corner is traced: a
 * body that only translates moves every point on it round the same circle as
 * the crank pin.
 *
 * Twice a turn the cranks lie along the frame and every pin is on one line.
 * That is the change point every parallelogram has, where it could carry on
 * crossed instead. The solver stays on the parallelogram, and
 * `library-cards.spec.ts` checks the coupler's angle at every sample.
 */
export function parallelogramFixture(): MechanismFixture {
  const { crank, frame, lift } = PARALLELOGRAM;
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: crank.x, y: crank.y },
      { id: 'C', x: crank.x + frame, y: crank.y },
      { id: 'D', x: frame, y: 0, ground: true },
      { id: 'T', x: crank.x + frame / 2, y: crank.y + lift, trace: true },
    ],
    links: [{ joints: 'AB' }, { joints: 'BCT' }, { joints: 'CD' }],
    inputAngVel: INPUT_SPEED,
  };
}

/** Watt's proportions: two equal arms, twice the length of the link between them. */
const WATT = { arm: 3, coupler: 1.5 } as const;

/**
 * Watt's straight-line mechanism: two equal arms pointing at each other from
 * opposite sides, joined by a short link whose midpoint is traced.
 *
 * Drawn at the middle of its travel, arms level and the short link upright,
 * so the traced point starts on the straight stretch. Across about one and a
 * half times the short link's length it strays less than 1% of that length
 * from a vertical line; past that the arms run out of reach and the path
 * curls back into the two loops of a figure eight.
 *
 * Not Grashof, so neither arm turns right round: the input rocks, and the
 * cycle closes on a reversal.
 */
export function wattStraightLineFixture(): MechanismFixture {
  const half = WATT.coupler / 2;
  return {
    joints: [
      { id: 'A', x: -WATT.arm, y: half, ground: true, input: true },
      { id: 'B', x: 0, y: half },
      { id: 'C', x: 0, y: -half },
      { id: 'D', x: WATT.arm, y: -half, ground: true },
      // The point the mechanism is named for.
      { id: 'M', x: 0, y: 0, trace: true },
    ],
    links: [{ joints: 'AB' }, { joints: 'BCM' }, { joints: 'CD' }],
    inputAngVel: INPUT_SPEED,
  };
}

/** The clamp's parts in pounds, and the load on its pad in pounds-force. */
const CLAMP_IN_POUNDS = {
  mass: { HE: 0.3, EP: 0.2, NP: 0.4 } as Record<string, number>,
  load: 0.4,
};

/**
 * The toggle clamp, drawn in inches.
 *
 * The same pins as `toggleClampFixture`, read as inches rather than
 * centimeters, so the library has one card a reader in the United States can
 * measure. Its masses are stated in pounds and its load in pounds-force here,
 * rather than scaled from the centimeter fixture's grams and newtons: they are
 * that fixture's published numbers converted and rounded, so the weight and the
 * load keep the proportion that lets Static and In-motion differ.
 */
export function toggleClampInInchesFixture(): MechanismFixture {
  const clamp = toggleClampFixture();
  return {
    ...clamp,
    links: clamp.links.map((link) => ({ ...link, mass: CLAMP_IN_POUNDS.mass[link.joints] })),
    load: { ...clamp.load!, vector: [0, CLAMP_IN_POUNDS.load] },
  };
}

/**
 * A six-bar whose output stops for a third of every turn while the crank keeps
 * going: the usual reason to add two links to a four-bar.
 *
 * The four-bar ABCD is a crank-rocker whose coupler point P draws a curve with
 * one stretch that is very nearly an arc of a circle. Q is pinned at that
 * arc's center, and the link PQ is as long as its radius, so while P runs
 * along the arc it only swings PQ about Q, and Q, with the output link OQ,
 * stands still. Off the arc, P pulls Q away and the output swings through
 * about 60 degrees and back.
 *
 * The four-bar's proportions came from a search over coupler curves for a
 * long, nearly circular stretch, rounded to hundredths. Rounded, the output
 * stays within half a degree for about 105 degrees of crank. The drawing
 * starts in the pause.
 */
export function dwellSixBarFixture(): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: 1.2, y: 1.6 },
      { id: 'C', x: 5.62, y: 3.47 },
      { id: 'D', x: 5.2, y: 0, ground: true },
      // The coupler point, whose curve holds the arc.
      { id: 'P', x: 2.79, y: 0.92, trace: true },
      // The arc's center, where the output waits.
      { id: 'Q', x: 1.68, y: -1.46 },
      { id: 'O', x: 4.3, y: -2.3, ground: true },
    ],
    links: [
      { joints: 'AB' },
      { joints: 'BCP' },
      { joints: 'CD' },
      { joints: 'PQ' },
      { joints: 'OQ' },
    ],
    inputAngVel: INPUT_SPEED,
  };
}
