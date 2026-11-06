import { HEAD_CLEARANCE_R, cylinderHeadHalf } from '../../app/model/cylinder';
import { R_PER_SCALE, barHalfWidth } from '../../app/model/joint-marks';
import { DEFAULT_OBJECT_SCALE } from '../../app/model/object-scale';
import { MODEL_SCALE } from '../../app/model/render-scale';
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

type Point = { x: number; y: number };

/**
 * Where a cylinder's buried end and seal go so that its travel runs exactly
 * from `shortest` to `longest`, mount to mount, starting where its mounts are.
 *
 * `cylinderBetween` gives a ram whose two members are equal, and so a stroke
 * fixed by how far apart its mounts start. That suits a part drawn for its own
 * sake. The two cylinders below stand in for something whose reach the machine
 * already has -- a hand that squeezes a pair of pliers just past center, a shock
 * absorber's stroke -- and a longer stroke would drive the drawing into poses
 * the real thing never reaches. So the barrel is cut to the travel and the rod
 * to what is left.
 *
 * The seal runs from just inside the barrel's mouth to its buried end
 * (`cylinderHeadTravel`), and both ends of that are measured in the drawing's
 * object scale, which is why it is an argument: in model units, as the gallery
 * states it.
 */
function cylinderSpanning(
  mount: Point,
  driven: Point,
  travel: { shortest: number; longest: number },
  objectScale: number
): { barrelEnd: Point; pin: Point } {
  const r = (R_PER_SCALE * objectScale) / MODEL_SCALE;
  const span = Math.hypot(driven.x - mount.x, driven.y - mount.y);
  const barrel = travel.longest - travel.shortest + HEAD_CLEARANCE_R * r;
  const rod = travel.shortest - HEAD_CLEARANCE_R * r - cylinderHeadHalf(barrel, r);
  const at = (distance: number) => ({
    x: mount.x + ((driven.x - mount.x) * distance) / span,
    y: mount.y + ((driven.y - mount.y) * distance) / span,
  });
  return { barrelEnd: at(barrel), pin: at(span - rod) };
}

/** Drawn at the size a fresh drawing uses: a ten-inch tool is single-digit. */
export const PLIERS_OBJECT_SCALE = DEFAULT_OBJECT_SCALE;

/** A ten-inch pair of locking pliers, in inches, with the jaws on the left. */
const PLIERS = {
  // On the frame: the upper jaw and handle, which hold still.
  jawPivot: { x: 1.5, y: -0.25 },
  screwTip: { x: 6.1, y: 0.3 },
  // The lower jaw: its tip, and the pin its handle hangs from.
  jawTip: { x: 0.15, y: -0.25 },
  handlePin: { x: 1.9, y: -0.85 },
  // The lower handle: the toggle link's pin, and the end of the grip.
  togglePin: { x: 3.36, y: -0.49 },
  grip: { x: 9.55, y: -0.8 },
  /**
   * Screw tip to grip at the two ends of the squeeze. Shortest is just past
   * center, where the real tool's handle meets its stop; longest is the jaws
   * twenty degrees open.
   */
  squeeze: { shortest: 3.5, longest: 5.13 },
} as const;

/**
 * Locking pliers: a four-bar whose toggle locks the jaws shut.
 *
 * The frame is the upper jaw and handle. The lower jaw pivots on it, the lower
 * handle hangs from the lower jaw, and a toggle link runs from the handle to
 * the tip of the adjusting screw. Squeeze the handles and the handle's front
 * stretch and the toggle link come into line with each other: there the jaw
 * stops moving however far the handle goes, which is the point of greatest
 * clamping force, and a little past it the pliers hold themselves shut.
 *
 * What moves pliers is a hand on the handle, and the handle pivots on nothing
 * fixed, so no pin of this linkage can be its input. Driven at the jaw's pivot,
 * the toggle is a dead end and the cycle swings on to the mirror-image toggle,
 * opening the handle and closing it again; driven at the screw, the handle
 * runs on through the frame. So a cylinder between the screw tip and the grip
 * plays the hand, and its stroke ends where a hand's would: the jaws twenty
 * degrees open, and just past center.
 *
 * The drawing starts just short of center, the toggle about two degrees from
 * straight, which is the pose the backdrop shows.
 */
export function lockingPliersFixture(): MechanismFixture {
  const { jawPivot, screwTip, jawTip, handlePin, togglePin, grip, squeeze } = PLIERS;
  const { barrelEnd, pin } = cylinderSpanning(screwTip, grip, squeeze, PLIERS_OBJECT_SCALE);
  return {
    joints: [
      { id: 'A', ...jawPivot, ground: true },
      { id: 'J', ...jawTip },
      { id: 'B', ...handlePin },
      { id: 'C', ...togglePin },
      { id: 'D', ...screwTip, ground: true },
      { id: 'N', ...barrelEnd },
      { id: 'S', ...pin },
      { id: 'G', ...grip },
    ],
    links: [
      { joints: 'ABJ', name: 'Lower jaw' },
      { joints: 'BCG', name: 'Lower handle' },
      { joints: 'CD', name: 'Toggle link' },
      { joints: 'DN', name: 'Hand' },
      { joints: 'GS', name: 'Hand rod' },
    ],
    sliders: [{ at: 'S', on: { carrier: 'DN', a: 'D', b: 'N' }, sealed: true, input: true }],
    welds: ['S'],
    inputAngVel: INPUT_SPEED,
  };
}

/**
 * Drawn at full size in centimeters, so its numbers run past seventy: seven
 * times the default, as the other full-size drawings are scaled up, or the
 * pins would be specks.
 */
export const SUSPENSION_OBJECT_SCALE = 7 * DEFAULT_OBJECT_SCALE;

/**
 * A car's front wheel and the two arms that carry it, seen from in front, in
 * centimeters. The road is y = 0 and the middle of the car is off to the left.
 */
const SUSPENSION = {
  // On the body: where each arm is pinned, and the shock's top mount.
  lowerInner: { x: 14, y: 20 },
  upperInner: { x: 24, y: 50 },
  shockTop: { x: 34, y: 64 },
  // The ball joints the upright turns on.
  lowerBall: { x: 52, y: 17 },
  upperBall: { x: 48, y: 49 },
  // The shock's foot, on a bracket above the lower arm.
  shockFoot: { x: 42, y: 20.5 },
  // The middle of the wheel, where the upright carries it.
  hub: { x: 60, y: 32 },
  /** The tire, seen from in front: 22 cm wide and 64 cm across, standing on the road. */
  tire: { inner: 49, outer: 71, road: 0, top: 64 },
  /** The shock's length at full bump and full droop: the wheel moves about 8 cm each way. */
  shock: { shortest: 38.5, longest: 50 },
} as const;

/**
 * The tire's four corners, inset by the half-width of the bar the app draws
 * around them, so the outline it draws is the tire in the picture. The two
 * bottom corners, U and V, are where it meets the road.
 */
function tireCorners({ inner, outer, road, top }: (typeof SUSPENSION)['tire']) {
  const inset = barHalfWidth(SUSPENSION_OBJECT_SCALE) / MODEL_SCALE;
  const [left, right, bottom, high] = [inner + inset, outer - inset, road + inset, top - inset];
  return [
    { id: 'U', x: left, y: bottom },
    { id: 'V', x: right, y: bottom },
    { id: 'W', x: right, y: high },
    { id: 'X', x: left, y: high },
  ];
}

/**
 * A double-wishbone front suspension: two arms of unequal length and the
 * upright between them, a four-bar with the car's body as its frame.
 *
 * The upper arm is shorter, so as the wheel rises its top is pulled inward:
 * the tire leans into a corner instead of away from it, and where it meets the
 * road hardly moves sideways. The wheel is the tire's outline welded to the
 * upright, so it moves as the wheel on a car does, and the hub and the tire's
 * corners trace. The shock absorber is the cylinder, running from the body to
 * the lower arm, and its stroke is what limits the wheel's travel, as it does
 * on a car.
 *
 * The upper arm lies across the shock's line, which is how the real thing is
 * built: the arm is a fork, and the shock passes between its two legs.
 */
export function doubleWishboneFixture(): MechanismFixture {
  const { lowerInner, upperInner, shockTop, lowerBall, upperBall, shockFoot, hub, tire, shock } =
    SUSPENSION;
  const { barrelEnd, pin } = cylinderSpanning(shockTop, shockFoot, shock, SUSPENSION_OBJECT_SCALE);
  const corners = tireCorners(tire).map((at) => ({ ...at, trace: true }));
  return {
    joints: [
      { id: 'A', ...lowerInner, ground: true },
      { id: 'M', ...shockFoot },
      { id: 'B', ...lowerBall },
      { id: 'C', ...upperBall },
      { id: 'D', ...upperInner, ground: true },
      { id: 'T', ...hub, trace: true },
      { id: 'K', ...shockTop, ground: true },
      { id: 'N', ...barrelEnd },
      { id: 'S', ...pin },
      ...corners,
    ],
    links: [
      { joints: 'ABM', name: 'Lower wishbone' },
      { joints: 'CD', name: 'Upper wishbone' },
      { joints: 'KN', name: 'Shock absorber' },
      { joints: 'MS', name: 'Shock rod' },
      {
        joints: 'BCTUVWX',
        name: 'Wheel',
        subset: [
          { joints: 'BCT', name: 'Upright' },
          { joints: 'TUVWX', name: 'Tire' },
        ],
      },
    ],
    sliders: [{ at: 'S', on: { carrier: 'KN', a: 'K', b: 'N' }, sealed: true, input: true }],
    welds: ['S', 'T'],
    inputAngVel: INPUT_SPEED,
  };
}

/**
 * Drawn in meters, a little under the default size: a locomotive's rods are
 * deep, but default bars on wheels this size would be deeper still.
 */
export const LOCOMOTIVE_OBJECT_SCALE = 0.7 * DEFAULT_OBJECT_SCALE;

/** Ten turns a minute, the library's pace, and clockwise: the engine runs to the right. */
const LOCOMOTIVE_RPM = -10;

/**
 * A small tank engine's running gear, seen from the side, in meters. The rail
 * is y = 0, the cab is on the left and the engine runs to the right.
 */
const LOCOMOTIVE = {
  /** Three coupled axles, each with wheels 1.4 m across standing on the rail. */
  axles: [0, 2, 4],
  wheel: 0.7,
  /** How far each crank pin sits from its axle: half the piston's 0.6 m stroke. */
  crank: 0.3,
  /** Where the crank pins start, in degrees from straight ahead. */
  startDeg: 45,
  /** From the driving wheel's crank pin to the crosshead. */
  mainRod: 3,
  /** Along the piston rod from the crosshead pin: the crosshead's slide, then the piston. */
  slideAhead: 0.25,
  pistonAhead: 1.3,
} as const;

/**
 * The valve gear, Walschaerts's, laid out at mid-gear: the expansion link and
 * the combination lever both upright. The start pose is solved from here, so
 * these are the gear's proportions rather than where it opens.
 *
 * The valve is a piston valve, fed between its two heads, so it has to move
 * the same way as the crosshead near each end of the stroke and a quarter turn
 * ahead of it in between. The lever supplies the first part and the return
 * crank, through the expansion link, the second.
 */
const VALVE_GEAR = {
  /** The return crank on the driving wheel: its throw, and how far it leads the crank pin. */
  returnCrank: 0.15,
  returnLeadDeg: 90,
  /**
   * The expansion link turns on a trunnion on the frame. The eccentric rod
   * works its tail, below, and the radius rod's die sits above.
   */
  trunnion: { x: 3, y: 1.06 },
  tail: 0.34,
  die: 0.21,
  /** The combination lever: the radius rod at its top, the valve spindle below it, the union link at its foot. */
  lever: { x: 5.62, top: 1.28, spindle: 0.18, foot: 0.95 },
  /** The union link's pin on the crosshead's drop arm, from the crosshead pin. */
  dropArm: { x: 0.12, y: -0.36 },
  /** Ahead of the spindle pin: the spindle's guide behind the steam chest, then the valve. */
  guideAhead: 0.3,
  valveAhead: 0.78,
} as const;

/**
 * Where the valve gear stands when the driving wheel's crank pin is `turn`
 * radians from straight ahead and the crosshead is at `crosshead`.
 */
function valveGearAt(axle: Point, turn: number, crosshead: Point) {
  const { returnCrank, returnLeadDeg, trunnion, tail, die, lever, dropArm } = VALVE_GEAR;
  const { guideAhead, valveAhead } = VALVE_GEAR;
  const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
  // Each rod's length is what it spans at mid-gear.
  const tailAtMid = { x: trunnion.x, y: trunnion.y - tail };
  const eccentricRod = distance(axle, tailAtMid);
  const radiusRod = distance({ x: trunnion.x, y: trunnion.y + die }, { x: lever.x, y: lever.top });
  const footAtMid = { x: lever.x, y: lever.top - lever.foot };
  const dropPinAtMid = { x: axle.x + LOCOMOTIVE.mainRod + dropArm.x, y: crosshead.y + dropArm.y };
  const unionLink = distance(dropPinAtMid, footAtMid);

  const lead = turn - (returnLeadDeg * Math.PI) / 180;
  const returnPin = {
    x: axle.x + returnCrank * Math.cos(lead),
    y: axle.y + returnCrank * Math.sin(lead),
  };
  // The tail is where the eccentric rod's reach meets the link's, below the trunnion.
  const apart = distance(returnPin, trunnion);
  const along = (eccentricRod ** 2 - tail ** 2 + apart ** 2) / (2 * apart);
  const across = Math.sqrt(eccentricRod ** 2 - along ** 2);
  const [ux, uy] = [(trunnion.x - returnPin.x) / apart, (trunnion.y - returnPin.y) / apart];
  const tailPin = {
    x: returnPin.x + along * ux + across * uy,
    y: returnPin.y + along * uy - across * ux,
  };
  const diePin = {
    x: trunnion.x + (die * (trunnion.x - tailPin.x)) / tail,
    y: trunnion.y + (die * (trunnion.y - tailPin.y)) / tail,
  };
  const dropPin = { x: crosshead.x + dropArm.x, y: crosshead.y + dropArm.y };

  // The lever's tilt is the one unknown left: its foot hangs from the union
  // link, its spindle pin rides the valve's line, and its top must meet the
  // radius rod. Newton's method from upright finds it.
  const spindleY = lever.top - lever.spindle;
  const below = lever.foot - lever.spindle;
  const leverAt = (tilt: number) => {
    const foot = { x: 0, y: spindleY - below * Math.cos(tilt) };
    foot.x = dropPin.x + Math.sqrt(unionLink ** 2 - (foot.y - dropPin.y) ** 2);
    const spindle = { x: foot.x + below * Math.sin(tilt), y: spindleY };
    const top = {
      x: spindle.x + lever.spindle * Math.sin(tilt),
      y: spindle.y + lever.spindle * Math.cos(tilt),
    };
    return { foot, spindle, top };
  };
  const miss = (tilt: number) => distance(leverAt(tilt).top, diePin) - radiusRod;
  let tilt = 0;
  for (let step = 0; step < 30; step++) {
    const slope = (miss(tilt + 1e-7) - miss(tilt)) / 1e-7;
    tilt -= miss(tilt) / slope;
  }
  const { foot, spindle, top } = leverAt(tilt);
  return {
    returnPin,
    trunnion,
    tailPin,
    diePin,
    leverTop: top,
    spindle,
    leverFoot: foot,
    dropPin,
    guide: { x: spindle.x + guideAhead, y: spindleY },
    valve: { x: spindle.x + valveAhead, y: spindleY },
  };
}

/**
 * A steam locomotive's running gear: three coupled wheels, drawn as discs, and
 * the rods between them.
 *
 * The main rod joins the crosshead to a crank pin on the middle, driving wheel,
 * and two coupling rods carry the turn to the wheels in front and behind. The
 * crank pins are all in step, so each wheel and the coupling rod beside it make
 * a parallelogram, and the rods stay level. The crosshead, the piston rod and
 * the piston at its far end are one body, held level by the crosshead's slide
 * between its slide bars.
 *
 * It is driven at the driving wheel's axle. One cylinder can only push and
 * pull, and twice a turn the main rod lies straight along the stroke, where a
 * push turns nothing; a real engine has a second cylinder on its other side, a
 * quarter turn out of step, which a drawing of one side cannot show.
 *
 * A disc is drawn out to its farthest pin, so each wheel carries a pin at its
 * rim, opposite its crank pin where a real wheel's counterweight sits.
 */
export function steamLocomotiveFixture(): MechanismFixture {
  const { axles, wheel, crank, startDeg, mainRod, slideAhead, pistonAhead } = LOCOMOTIVE;
  const level = wheel;
  const turn = (startDeg * Math.PI) / 180;
  const rim = wheel - barHalfWidth(LOCOMOTIVE_OBJECT_SCALE) / MODEL_SCALE;
  const [rear, driving, front] = axles.map((x) => ({
    axle: { x, y: level },
    pin: { x: x + crank * Math.cos(turn), y: level + crank * Math.sin(turn) },
    rim: { x: x - rim * Math.cos(turn), y: level - rim * Math.sin(turn) },
  }));
  const crosshead = driving.pin.x + Math.sqrt(mainRod ** 2 - (driving.pin.y - level) ** 2);
  const gear = valveGearAt(driving.axle, turn, { x: crosshead, y: level });
  return {
    joints: [
      { id: 'A', ...rear.axle, ground: true },
      { id: 'B', ...rear.pin },
      { id: 'C', ...rear.rim },
      { id: 'D', ...driving.axle, ground: true, input: true, driveSpeed: LOCOMOTIVE_RPM },
      { id: 'E', ...driving.pin },
      { id: 'F', ...driving.rim },
      { id: 'G', ...front.axle, ground: true },
      { id: 'H', ...front.pin },
      { id: 'I', ...front.rim },
      { id: 'J', x: crosshead, y: level },
      { id: 'K', x: crosshead + slideAhead, y: level },
      { id: 'L', x: crosshead + pistonAhead, y: level },
      { id: 'M', ...gear.returnPin },
      { id: 'N', ...gear.trunnion, ground: true },
      { id: 'O', ...gear.tailPin },
      { id: 'P', ...gear.diePin },
      { id: 'Q', ...gear.leverTop },
      { id: 'R', ...gear.spindle },
      { id: 'S', ...gear.leverFoot },
      { id: 'T', ...gear.dropPin },
      { id: 'U', ...gear.guide },
      { id: 'V', ...gear.valve },
    ],
    links: [
      { joints: 'ABC', name: 'Rear wheel', circle: true },
      { joints: 'DEFM', name: 'Driving wheel', circle: true },
      { joints: 'GHI', name: 'Front wheel', circle: true },
      { joints: 'BE', name: 'Rear coupling rod' },
      { joints: 'EH', name: 'Front coupling rod' },
      { joints: 'EJ', name: 'Main rod' },
      {
        joints: 'JKLT',
        name: 'Piston and crosshead',
        subset: [
          { joints: 'JKT', name: 'Crosshead' },
          { joints: 'KL', name: 'Piston rod' },
        ],
      },
      { joints: 'MO', name: 'Eccentric rod' },
      { joints: 'NOP', name: 'Expansion link' },
      { joints: 'PQ', name: 'Radius rod' },
      { joints: 'QRS', name: 'Combination lever' },
      { joints: 'ST', name: 'Union link' },
      { joints: 'RUV', name: 'Piston valve' },
    ],
    sliders: [
      { at: 'K', angleRad: 0 },
      { at: 'U', angleRad: 0 },
    ],
    welds: ['K', 'U'],
    inputAngVel: INPUT_SPEED,
  };
}
