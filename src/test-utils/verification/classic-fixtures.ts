import { MechanismFixture } from './fixture';

// Three linkages from the textbooks the library does not yet hold: the exact
// straight-line linkage, the copying linkage, and the eight-bar that no chain
// of dyads can solve. All three are kinematics demonstrations rather than
// machines carrying load, so every link is massless and has no moment of
// inertia — `buildMechanism` defaults both to 1, so they are stated.

/**
 * Ten revolutions per minute, in the rad/s the fixtures are stated in.
 *
 * One revolution is 60/rpm seconds, so this is six seconds a turn: slow enough
 * to follow a coupler point round, fast enough that nobody waits for it. The
 * two linkages here that rock rather than turn cover a little more than a
 * revolution of input travel per cycle and so take a little longer.
 */
const TEN_RPM = (10 * Math.PI) / 30;

/** No mass and no rotary inertia: these are shape demonstrations, not machines. */
const MASSLESS = { mass: 0, moi: 0 } as const;

/**
 * Where two bar lengths meet, given the two points they hang from.
 *
 * The circles cross twice, mirrored across the line `from`-`to`; `side` is +1
 * for the root left of that line. Which root a fixture wants is its assembly
 * mode, so it is named at the call rather than guessed here.
 */
function meet(
  from: { x: number; y: number },
  fromLength: number,
  to: { x: number; y: number },
  toLength: number,
  side: 1 | -1
): { x: number; y: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const span = Math.hypot(dx, dy);
  const along = (fromLength ** 2 - toLength ** 2 + span ** 2) / (2 * span);
  const across = Math.sqrt(fromLength ** 2 - along ** 2);
  return {
    x: from.x + (along * dx - side * across * dy) / span,
    y: from.y + (along * dy + side * across * dx) / span,
  };
}

/**
 * The three lengths a Peaucellier-Lipkin cell is built from.
 *
 * They are not free of each other. Two inequalities decide whether the cell is
 * a straight-line linkage or a curiosity that jams, and both are checked in the
 * spec rather than trusted:
 *
 * - `long² - side² > (2 · crank)²` keeps the crank pin P and the pen Q apart.
 *   They meet where |OP| = sqrt(long² - side²), and |OP| never exceeds twice
 *   the crank; drawn the other way round the rhombus folds flat once a stroke.
 * - `long - side < 2 · crank` is what lets the cell assemble at all: the pen
 *   arms have to reach across the gap the crank opens.
 */
export const PEAUCELLIER = {
  /** Half the distance the driving pin travels, and also the ground offset. */
  crank: 2,
  /** The two long arms from the fixed center O to opposite rhombus corners. */
  long: 5,
  /** Every side of the rhombus. */
  side: 2.5,
  /** Crank angle the cell is drawn at, measured from the far side of its circle. */
  drawnRad: Math.PI / 3,
} as const;

/**
 * The Peaucellier-Lipkin cell: the first linkage proved to draw an exact
 * straight line.
 *
 * Watt, Chebyshev and Roberts all produce a line that is only nearly straight,
 * and the library's Chebyshev entry is one of them — its coupler point runs
 * flat and then curls away. This one is exact, and it is exact for a reason
 * that can be read off the drawing: the rhombus and the two long arms make an
 * *inverter*. Whatever the pose, |OP| · |OQ| = long² - side², so Q is the
 * inverse of P in a circle about O. The crank is then chosen the length of the
 * ground offset, which is what forces P onto a circle *through* O — and the
 * inverse of a circle through the center of inversion is a straight line.
 *
 * Eight bars counting the frame: the crank, the two long arms, and the four
 * sides of the rhombus. Every one of the six joints is reachable from two
 * already-known ones, so it solves in closed form; what is worth opening it for
 * is the trace on Q, which is a ruled line and not an approximation to one.
 *
 * The crank rocks rather than turns, through 102.6 degrees either side of the
 * far point of its circle. It stops where the rhombus flattens — |OP| =
 * long - side, with the two long arms in line — and that pose is a genuine
 * limit of the cell rather than an artifact of the solver, so the drive
 * reverses there and the pen retraces its line. Every physical model of this
 * linkage has the same two stops, and between them the pen rules 11.7 units of
 * line at x = 4.6875.
 */
export function peaucellierFixture(): MechanismFixture {
  const { crank, long, side, drawnRad } = PEAUCELLIER;
  const center = { x: 0, y: 0 };
  const pivot = { x: crank, y: 0 };
  // The crank pin, on a circle of radius `crank` about a pivot `crank` from O.
  const pin = {
    x: pivot.x + crank * Math.cos(drawnRad),
    y: pivot.y + crank * Math.sin(drawnRad),
  };
  // The inversion itself: Q on the ray OP at the reciprocal distance. Written
  // out rather than found by intersecting circles, because this identity is the
  // mechanism and the bar lengths are what follow from it.
  const power = long ** 2 - side ** 2;
  const reach = Math.hypot(pin.x, pin.y);
  const scale = power / reach ** 2;
  const pen = { x: pin.x * scale, y: pin.y * scale };
  // The two free rhombus corners: symmetric about PQ, `side` from each end.
  const half = (reach * scale - reach) / 2;
  const across = Math.sqrt(side ** 2 - half ** 2);
  const mid = { x: (pin.x + pen.x) / 2, y: (pin.y + pen.y) / 2 };
  const unitX = pin.x / reach;
  const unitY = pin.y / reach;
  const upper = { x: mid.x - across * unitY, y: mid.y + across * unitX };
  const lower = { x: mid.x + across * unitY, y: mid.y - across * unitX };

  return {
    joints: [
      { id: 'O', ...center, ground: true },
      { id: 'C', ...pivot, ground: true, input: true },
      { id: 'P', ...pin },
      { id: 'A', ...upper },
      { id: 'B', ...lower },
      // The straight line, which is the whole reason the cell exists.
      { id: 'Q', ...pen, trace: true },
    ],
    links: [
      { joints: 'CP', ...MASSLESS },
      { joints: 'OA', ...MASSLESS },
      { joints: 'OB', ...MASSLESS },
      { joints: 'AP', ...MASSLESS },
      { joints: 'BP', ...MASSLESS },
      { joints: 'AQ', ...MASSLESS },
      { joints: 'BQ', ...MASSLESS },
    ],
    inputAngVel: TEN_RPM,
  };
}

/** The four-bar that pushes the pantograph, and where its tracing point sits. */
export const PANTOGRAPH = {
  /** Crank-rocker proportions: 1.2 + 4 < 2.5 + 3.5, so the crank turns. */
  crank: 1.2,
  ground: 4,
  coupler: 3.5,
  rocker: 2.5,
  /** The tracing point, equidistant from both coupler pins. */
  couplerPoint: 2.2,
  /** Pantograph fixed pivot, and the apex the two straight bars meet at. */
  pivot: { x: -5, y: 2 },
  apex: { x: -3, y: 7 },
} as const;

/**
 * A pantograph copying a coupler curve at half size.
 *
 * The parallelogram is the whole trick. Two bars run out from the apex J, one
 * carrying the fixed pivot O at twice the distance of the pin K, the other
 * carrying the tracing point T at twice the distance of the pin L; the pen P
 * closes the parallelogram JKPL. Write the two bar directions as u and v and
 * the pen sits at J + u + v, which is the midpoint of O and T however the
 * linkage is folded — so O, P and T stay in line and |OT| = 2 · |OP| forever.
 * The pen draws the tracer's path at half scale about O, which is what a
 * pantograph is for and why the shape of the curve does not matter to it.
 *
 * That is also why the thing worth looking at is a curve rather than a circle:
 * a circle copied is another circle and proves nothing. So the tracing point
 * here is the coupler point of a crank-rocker, drawing a bean, and both it and
 * the pen are traced — two curves the same shape and a factor of two apart.
 *
 * A pantograph on its own has two degrees of freedom, which is the point of one
 * you hold in your hand. The four-bar is what takes the second away.
 *
 * The parallelogram's one hazard is folding into its crossed form, which needs
 * O, J and T in line. That is the same pose as the tracer leaving the annulus
 * |JT| ± |OJ| about O, and the four-bar keeps it a long way inside: |OT| runs
 * between 4.72 and 6.83 against limits of 0.37 and 11.14.
 */
export function pantographFixture(): MechanismFixture {
  const { crank, ground, coupler, rocker, couplerPoint, pivot, apex } = PANTOGRAPH;
  const crankPivot = { x: 0, y: 0 };
  const rockerPivot = { x: ground, y: 0 };
  // Drawn with the crank straight up, which is mid-sweep for the rocker.
  const crankPin = { x: 0, y: crank };
  const rockerPin = meet(crankPin, coupler, rockerPivot, rocker, 1);
  // The coupler point, on the far side of the coupler from the ground line.
  const tracer = meet(crankPin, couplerPoint, rockerPin, couplerPoint, 1);
  // Everything else follows from O, J and T: the two pins bisect the straight
  // bars, and the pen closes the parallelogram on them.
  const midway = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  });
  const onPivotBar = midway(apex, pivot);
  const onTracerBar = midway(apex, tracer);
  const pen = midway(pivot, tracer);

  return {
    joints: [
      { id: 'G', ...crankPivot, ground: true, input: true },
      { id: 'H', ...rockerPivot, ground: true },
      { id: 'R', ...crankPin },
      { id: 'S', ...rockerPin },
      // The two curves the mechanism exists to put side by side.
      { id: 'T', ...tracer, trace: true },
      { id: 'O', ...pivot, ground: true },
      { id: 'J', ...apex },
      { id: 'K', ...onPivotBar },
      { id: 'L', ...onTracerBar },
      { id: 'P', ...pen, trace: true },
    ],
    links: [
      { joints: 'GR', ...MASSLESS },
      { joints: 'RST', ...MASSLESS },
      { joints: 'HS', ...MASSLESS },
      { joints: 'JKO', ...MASSLESS },
      { joints: 'JLT', ...MASSLESS },
      { joints: 'KP', ...MASSLESS },
      { joints: 'LP', ...MASSLESS },
    ],
    inputAngVel: TEN_RPM,
  };
}

/**
 * The double butterfly linkage: an eight-bar no chain of dyads can solve.
 *
 * Four ternary links and four binary ones, ten pins, one degree of freedom. The
 * topology is the standard benchmark one — a binary frame carrying a ternary
 * input link and a second ternary link, with the two joined by three separate
 * chains rather than one, which is what makes it a *double* butterfly and what
 * makes it hard. Wampler solved it with a Dixon determinant and Nielsen and
 * Roth in a rational formulation; its input-output curve is famously high
 * degree, and the reason is visible in the drawing: there is no four-bar loop
 * anywhere in it to peel off first.
 *
 * That is exactly what makes it worth opening here. Turning the input places C
 * and D and nothing else: every one of the six remaining joints has only one
 * already-known neighbor, so the ordering walk that solves the rest of the
 * library places nothing at all, and the six settle together under
 * `simultaneous-solver.ts` instead. The Jansen leg has one more bar than this
 * and solves in closed form; this one cannot.
 *
 * `A` and `B` are the frame pivots, `ACD` is the driven ternary link and `BFJ`
 * the other grounded one; `EFG` and `DHI` are the two floating ternaries, and
 * `CE`, `GH` and `IJ` are the three binary bars that make the three chains
 * between the two ends.
 *
 * There is no table of dimensions to quote — the linkage is a topology, and
 * every non-degenerate drawing of it is one. So these coordinates are the drawn
 * pose and the fifteen bar lengths follow from it. What the pose was chosen for
 * is that the crank turns *all the way round*, which is not automatic here and
 * is not what most drawings of this topology do: they rock a little way and
 * jam. It also has to sit clear of every dead-center, since the solver refuses
 * a constraint set whose Jacobian loses a column where it is drawn, and away
 * from the poses where a chain runs nearly straight, where the six joints move
 * far in one sample and the run stops looking like a mechanism.
 */
export function doubleButterflyFixture(): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: 6.17, y: 0, ground: true },
      { id: 'C', x: -0.21, y: 1.94 },
      { id: 'D', x: 1.4, y: 0.48 },
      { id: 'E', x: 2.69, y: 3.37 },
      { id: 'F', x: 5.84, y: 3.17 },
      { id: 'G', x: 5.37, y: 1.82 },
      { id: 'H', x: 3.63, y: 1.03 },
      { id: 'I', x: 4.67, y: -1.09 },
      { id: 'J', x: 4.13, y: 2.05 },
    ],
    // Ground pivot first on each grounded ternary, so the two rows that carry
    // its third joint are measured in a frame with one end already known.
    links: [
      { joints: 'ACD', ...MASSLESS },
      { joints: 'CE', ...MASSLESS },
      { joints: 'EFG', ...MASSLESS },
      { joints: 'BFJ', ...MASSLESS },
      { joints: 'DHI', ...MASSLESS },
      { joints: 'GH', ...MASSLESS },
      { joints: 'IJ', ...MASSLESS },
    ],
    inputAngVel: TEN_RPM,
  };
}
