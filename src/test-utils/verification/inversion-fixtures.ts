import { MechanismFixture } from './fixture';

/**
 * One chain, held by a different link each time.
 *
 * Inversion is the first surprising thing anybody is taught about mechanisms:
 * that a four-bar and a drag link are the same four bars, and that an engine
 * and a Whitworth quick-return are the same four parts of a slider-crank. It
 * is a claim about four drawings, so it takes four drawings to make — which is
 * what these two are.
 *
 * The link being held is drawn in both sets rather than left as bare ground
 * pins. It is what the drawing is *about*, and a picture that omits it asks
 * the reader to work out which bar is missing.
 */

/** A cycle in six seconds at 1x, the pace the rest of the library opens at. */
const LIBRARY_RPM = 10;
const radPerSecond = (rpm: number) => (rpm * Math.PI) / 30;

interface Point {
  x: number;
  y: number;
}

const along = (from: Point, direction: Point, distance: number): Point => ({
  x: from.x + direction.x * distance,
  y: from.y + direction.y * distance,
});

const unit = (from: Point, to: Point): Point => {
  const span = Math.hypot(to.x - from.x, to.y - from.y);
  return { x: (to.x - from.x) / span, y: (to.y - from.y) / span };
};

const turned = (radius: number, degrees: number): Point => ({
  x: radius * Math.cos((degrees * Math.PI) / 180),
  y: radius * Math.sin((degrees * Math.PI) / 180),
});

/**
 * Where two circles cross, which is where a four-bar's coupler pin lands.
 *
 * `branch` picks which of the two crossings — the same chain assembles two
 * ways, and taking the wrong one is a mechanism that runs through a mirror
 * image of the motion it was drawn for.
 */
function meet(a: Point, ra: number, b: Point, rb: number, branch: 1 | -1): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d > ra + rb || d < Math.abs(ra - rb)) {
    throw new Error(`meet: circles ${ra} and ${rb} do not reach across ${d.toFixed(3)}`);
  }
  const reach = (ra * ra - rb * rb + d * d) / (2 * d);
  const across = Math.sqrt(Math.max(0, ra * ra - reach * reach));
  return {
    x: a.x + (reach * dx - branch * across * dy) / d,
    y: a.y + (reach * dy + branch * across * dx) / d,
  };
}

/** Every machine in one drawing, as one fixture. */
function merge(parts: MechanismFixture[], inputAngVel: number): MechanismFixture {
  return {
    joints: parts.flatMap((part) => part.joints),
    links: parts.flatMap((part) => part.links),
    sliders: parts.flatMap((part) => part.sliders ?? []),
    welds: parts.flatMap((part) => part.welds ?? []),
    inputAngVel,
  };
}

/**
 * The four-bar chain, and the four mechanisms it is.
 *
 * The bars are 1, 2, 3 and 2.5 long in that cyclic order, which satisfies
 * Grashof (1 + 3 ≤ 2 + 2.5) — so what each inversion turns out to be is
 * decided by where the shortest bar sits relative to the one being held:
 *
 * | Held | The shortest is | What it becomes |
 * | --- | --- | --- |
 * | L4 | beside the frame | crank-rocker |
 * | L2 | beside the frame | crank-rocker, the other one |
 * | L1 (the shortest) | the frame | double crank — both grounded bars go over |
 * | L3 (opposite L1) | the coupler | double rocker — neither goes over |
 *
 * In that order, which is the order the textbooks number them in.
 *
 * The held bar is drawn, pinned to ground at both ends. It cannot move and the
 * app knows it — a bar anchored twice is counted as part of the frame rather
 * than as a body, so drawing it costs the mechanism no degree of freedom (see
 * anchored-bar-mobility.spec.ts). That is what lets all four bars appear in
 * every one of the four, with only the ground hatching moving.
 *
 * Colors and names carry a bar's identity between the four, which is the
 * point the drawing exists to make: L2 is the same bar whether it is a crank,
 * a coupler or the frame. They are pinned in template-colors.ts.
 */
export function fourBarInversionsFixture(): MechanismFixture {
  const L1 = 1;
  const L2 = 2;
  const L3 = 3;
  const L4 = 2.5;

  const inversions: {
    letters: string;
    /** The held bar, spanning the two ground pins. */
    frame: number;
    /** Then round the loop from the left pin: crank, coupler, rocker. */
    crank: number;
    coupler: number;
    rocker: number;
    /** Which bar of the chain each of those four is. */
    names: [string, string, string, string];
    theta: number;
    branch: 1 | -1;
    at: Point;
  }[] = [
    // Held: L4. The shortest is beside it and cranks; the far bar rocks.
    {
      letters: 'ABCD',
      frame: L4,
      crank: L1,
      coupler: L2,
      rocker: L3,
      names: ['L1', 'L2', 'L3', 'L4'],
      theta: 60,
      branch: 1,
      at: { x: 0, y: 6 },
    },
    // Held: L2. The other bar beside the shortest, so the other crank-rocker.
    {
      letters: 'EFGH',
      frame: L2,
      crank: L1,
      coupler: L4,
      rocker: L3,
      names: ['L1', 'L4', 'L3', 'L2'],
      theta: 60,
      branch: 1,
      at: { x: 9, y: 6 },
    },
    // Held: L1, the shortest. Both bars pinned to the frame go right over.
    {
      letters: 'IJKL',
      frame: L1,
      crank: L2,
      coupler: L3,
      rocker: L4,
      names: ['L2', 'L3', 'L4', 'L1'],
      theta: 100,
      branch: 1,
      at: { x: 0, y: 0 },
    },
    // Held: L3, opposite the shortest, which is now the coupler. Nothing
    // pinned to the frame can get round at all.
    {
      letters: 'MNOP',
      frame: L3,
      crank: L2,
      coupler: L1,
      rocker: L4,
      names: ['L2', 'L1', 'L4', 'L3'],
      theta: 55,
      branch: 1,
      at: { x: 9, y: 0 },
    },
  ];

  const parts: MechanismFixture[] = inversions.map((one) => {
    const [first, second, third, fourth] = [...one.letters];
    const pivot = one.at;
    const far = { x: one.at.x + one.frame, y: one.at.y };
    const elbow = along(pivot, turned(1, one.theta), one.crank);
    const wrist = meet(elbow, one.coupler, far, one.rocker, one.branch);
    return {
      joints: [
        // The left pin drives. For every inversion but the double rocker that
        // is a bar which goes right over; the double rocker has no such bar
        // anywhere, and driven here it swings between its two toggle points,
        // which is what the machine actually does.
        { id: first, ...pivot, ground: true, input: true, driveSpeed: LIBRARY_RPM },
        { id: second, ...elbow },
        { id: third, ...wrist },
        { id: fourth, ...far, ground: true },
      ],
      links: [
        { joints: first + second, name: one.names[0], mass: 0, moi: 0 },
        { joints: second + third, name: one.names[1], mass: 0, moi: 0 },
        { joints: third + fourth, name: one.names[2], mass: 0, moi: 0 },
        // The held bar, across the two ground pins.
        { joints: first + fourth, name: one.names[3], mass: 0, moi: 0 },
      ],
      inputAngVel: radPerSecond(LIBRARY_RPM),
    };
  });

  return merge(parts, radPerSecond(LIBRARY_RPM));
}

/**
 * The single-slider-crank chain, and the four mechanisms it is.
 *
 * Four links again, but one of the four pairs slides rather than turns, and
 * that is what makes this set worth drawing beside the four-bar: the same
 * operation on a chain with a slider in it produces an engine, a quick-return,
 * an oscillating-cylinder engine and a pump.
 *
 * | Held | What it becomes | Where you have seen it |
 * | --- | --- | --- |
 * | L1, the frame | slider-crank | engine, compressor, reciprocating pump |
 * | L2, the crank | the frame swings round the crank | Whitworth quick-return, rotary engine |
 * | L3, the conrod | the cylinder rocks on its trunnion | oscillating cylinder engine |
 * | L4, the block | the frame reciprocates through it | pendulum pump, hand pump |
 *
 * One chain throughout: L2 is 1.2 long and L3 is 2.6 in all four, and the
 * sliding pair is between L1 and L4 in all four. What changes is which link is
 * held, and so which pair of joints is pinned to the world.
 *
 * The middle two hold a bar, and it is drawn across its two ground pins the
 * way the four-bar set draws its held bar. They are the same arrangement as
 * each other with the parts swapped round — a bar turning about one ground
 * pin, driving a block that runs in a slot cut in a bar pivoted on the other —
 * and what separates them is only which of the two is longer. Held by the
 * crank, the slotted bar's pivot falls inside the circle the block describes
 * and the bar goes right over: a quick-return. Held by the conrod, the pivot
 * falls outside it and the bar rocks: a cylinder on a trunnion.
 *
 * The outer two hold the frame or the block, neither of which is a bar. This
 * app draws the frame fixed and the block running along it, which is the first
 * inversion exactly; the fourth is the same relative motion seen from the
 * block, so it arrives here as its own relative motion, with the long bar
 * grounded and the short one reaching the slide. That is a limit of what the
 * canvas can hold still, not of the chain.
 */
export function sliderCrankInversionsFixture(): MechanismFixture {
  /** The crank, L2, and the connecting rod, L3. Both, in all four. */
  const CRANK = 1.2;
  const ROD = 2.6;

  // ---- Held: L1, the frame. The ordinary slider-crank. -------------------
  const engineAt = { x: 0, y: 6.5 };
  const engineElbow = along(engineAt, turned(1, 60), CRANK);
  const engine: MechanismFixture = {
    joints: [
      { id: 'A', ...engineAt, ground: true, input: true, driveSpeed: LIBRARY_RPM },
      { id: 'B', ...engineElbow },
      {
        id: 'C',
        // In line with the crank center, so the chain has no offset in any of
        // the four. The block runs on the frame's own axis.
        x: engineElbow.x + Math.sqrt(ROD * ROD - (engineElbow.y - engineAt.y) ** 2),
        y: engineAt.y,
      },
    ],
    links: [
      { joints: 'AB', name: 'L2', mass: 0, moi: 0 },
      { joints: 'BC', name: 'L3', mass: 0, moi: 0 },
    ],
    sliders: [{ at: 'C', prisId: 'D', angleRad: 0 }],
    inputAngVel: radPerSecond(LIBRARY_RPM),
  };

  // ---- Held: L2, the crank. Whitworth quick-return. ----------------------
  // The held bar is the short one, so the slotted bar's pivot sits inside the
  // circle the block runs on and the bar goes right over.
  const whitworthAt = { x: 9.6, y: 6.5 };
  const whitworthPivot = whitworthAt;
  const whitworthCenter = { x: whitworthAt.x + CRANK, y: whitworthAt.y };
  const whitworthBlock = along(whitworthCenter, turned(1, 60), ROD);
  const whitworth: MechanismFixture = {
    joints: [
      { id: 'E', ...whitworthPivot, ground: true },
      { id: 'F', ...whitworthCenter, ground: true, input: true, driveSpeed: LIBRARY_RPM },
      { id: 'G', ...whitworthBlock },
      {
        id: 'H',
        // Far enough out that the block never runs off the end: it travels
        // between ROD - CRANK and ROD + CRANK from the pivot.
        ...along(whitworthPivot, unit(whitworthPivot, whitworthBlock), ROD + CRANK + 0.8),
      },
    ],
    links: [
      { joints: 'FG', name: 'L3', mass: 0, moi: 0 },
      { joints: 'EH', name: 'L1', mass: 0, moi: 0 },
      { joints: 'EF', name: 'L2', mass: 0, moi: 0 },
    ],
    sliders: [{ at: 'G', prisId: 'I', on: { carrier: 'EH', a: 'E', b: 'H' } }],
    inputAngVel: radPerSecond(LIBRARY_RPM),
  };

  // ---- Held: L3, the conrod. Oscillating cylinder. -----------------------
  // The same arrangement, with the long bar held instead of the short one. Now
  // the pivot is outside the block's circle, so the slotted bar — the cylinder
  // — rocks on its trunnion rather than going over.
  const cylinderAt = { x: 0, y: 0 };
  const cylinderCenter = cylinderAt;
  const trunnion = { x: cylinderAt.x + ROD, y: cylinderAt.y };
  const cylinderBlock = along(cylinderCenter, turned(1, 140), CRANK);
  const oscillating: MechanismFixture = {
    joints: [
      { id: 'J', ...cylinderCenter, ground: true, input: true, driveSpeed: LIBRARY_RPM },
      { id: 'K', ...cylinderBlock },
      { id: 'M', ...trunnion, ground: true },
      { id: 'N', ...along(trunnion, unit(trunnion, cylinderBlock), ROD + CRANK + 0.6) },
    ],
    links: [
      { joints: 'JK', name: 'L2', mass: 0, moi: 0 },
      { joints: 'MN', name: 'L1', mass: 0, moi: 0 },
      { joints: 'JM', name: 'L3', mass: 0, moi: 0 },
    ],
    sliders: [{ at: 'K', prisId: 'L', on: { carrier: 'MN', a: 'M', b: 'N' } }],
    inputAngVel: radPerSecond(LIBRARY_RPM),
  };

  // ---- Held: L4, the block. Pendulum pump. -------------------------------
  // The beam turns about the pin the held block carries, and the frame
  // reciprocates along the block's own axis — drawn here, as everywhere in
  // this app, with the axis still and the block running along it.
  const pumpAt = { x: 9.6, y: 0 };
  const pumpBeamEnd = along(pumpAt, turned(1, 20), ROD);
  const pump: MechanismFixture = {
    joints: [
      { id: 'P', ...pumpAt, ground: true, input: true, driveSpeed: LIBRARY_RPM },
      { id: 'Q', ...pumpBeamEnd },
      {
        id: 'R',
        x: pumpBeamEnd.x + Math.sqrt(CRANK * CRANK - (pumpBeamEnd.y - pumpAt.y) ** 2),
        y: pumpAt.y,
      },
    ],
    links: [
      { joints: 'PQ', name: 'L3', mass: 0, moi: 0 },
      { joints: 'QR', name: 'L2', mass: 0, moi: 0 },
    ],
    sliders: [{ at: 'R', prisId: 'S', angleRad: 0 }],
    inputAngVel: radPerSecond(LIBRARY_RPM),
  };

  return merge([engine, whitworth, oscillating, pump], radPerSecond(LIBRARY_RPM));
}
