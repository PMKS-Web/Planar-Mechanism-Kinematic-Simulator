import { MechanismFixture } from './fixture';

// Mechanisms built for the features of the app the library had no example of:
// a link drawn as a disc, a drawing carrying more than one load, a load held in
// its link's frame, a centre of mass placed off the centroid, and — the big one
// — several machines in one drawing, each on its own drive.
//
// Everything here is an ordinary machine. A feature demonstration whose linkage
// is also unfamiliar teaches neither thing, which is the same rule the force
// fixtures are built to.

/**
 * How fast a drive is commanded, in rpm, and the rad/s the fixture solves at.
 *
 * The document default is 5 rpm — twelve seconds a revolution, which is longer
 * than anyone watches a template for. Ten is a cycle in six seconds: fast
 * enough to read as motion, slow enough to follow a coupler point round.
 *
 * The two numbers are the same speed said twice, so they are derived from one:
 * `driveSpeed` is what rides the URL and what the app runs the opened template
 * at, and `inputAngVel` is what `buildMechanism` solves at here.
 */
const radPerSecond = (rpm: number) => (rpm * Math.PI) / 30;

/**
 * One root of a pair of circles, as a dyad is located: centre `a` at radius
 * `ra`, centre `b` at radius `rb`.
 *
 * `side` picks between the two roots — which is the assembly mode, and the
 * difference between the linkage meant and its mirror. Written once here
 * because all three mechanisms below close a loop the same way.
 */
function dyad(
  a: { x: number; y: number },
  ra: number,
  b: { x: number; y: number },
  rb: number,
  side: 1 | -1
): { x: number; y: number } {
  const span = Math.hypot(b.x - a.x, b.y - a.y);
  const foot = (ra ** 2 - rb ** 2 + span ** 2) / (2 * span);
  const rise = Math.sqrt(ra ** 2 - foot ** 2);
  const ux = (b.x - a.x) / span;
  const uy = (b.y - a.y) / span;
  return {
    x: a.x + foot * ux - side * rise * uy,
    y: a.y + foot * uy + side * rise * ux,
  };
}

/** Flywheel radius, crank throw and rod, in the drawing's own units. */
const ENGINE = { rim: 1.4, throw: 1, rod: 3.6 };

/**
 * A single-cylinder engine: a flywheel on the crankshaft, driving a piston.
 *
 * The library's one circular link. "Drawn as a Disc" is a drawing choice —
 * the mass properties still come from the joint skeleton — and this is where
 * the choice is the honest one, because the thing on the end of a crankshaft
 * really is a disc and drawing it as a bar between two pins misdescribes it.
 *
 * The rim pin `R` is what gives the disc its size: a circular link is drawn as
 * the circle that reaches its outermost joint, so without a joint out at the
 * rim the flywheel would be no bigger than the crank throw. It sits opposite
 * the crank pin, where an engine puts its counterweight. The rod is long
 * enough that the piston at inner dead centre clears the rim rather than
 * disappearing behind it.
 *
 * Kinematics only, so every mass is zero.
 */
export function flywheelSliderCrankFixture(): MechanismFixture {
  const RPM = 10;
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true, driveSpeed: RPM },
      { id: 'B', x: ENGINE.throw, y: 0 },
      // Opposite the crank pin: the counterweight, and the rim of the disc.
      { id: 'R', x: -ENGINE.rim, y: 0 },
      { id: 'C', x: ENGINE.throw + ENGINE.rod, y: 0 },
    ],
    links: [
      { joints: 'ABR', mass: 0, moi: 0, name: 'Flywheel', circle: true },
      { joints: 'BC', mass: 0, moi: 0, name: 'Connecting rod' },
    ],
    // The bore, on the crankshaft's own centreline.
    slider: { at: 'C', prisId: 'P', angleRad: 0, pistonMass: 0 },
    inputAngVel: radPerSecond(RPM),
  };
}

/** The jib, and the crank and link that luff it. */
const CRANE = {
  reach: 7,
  /** How far out the luffing link picks the jib up. */
  toLink: 3.2,
  /** Where the hoist rope's snatch block sits on the jib. */
  toSheave: 5.6,
  /** How far out the counterweighted jib balances — well inside its centroid. */
  toBalance: 1.4,
  angle: (50 * Math.PI) / 180,
  winch: { x: 2.4, y: -0.8 },
  crank: 1.1,
  link: 2.6,
};

/**
 * A jib crane carrying two loads at once, one of each kind.
 *
 * The lesson is the difference between them, which is why there are two:
 *
 * - the **hook load** at the tip is global. It is weight, so it hangs straight
 *   down whatever the jib does, and its arrow keeps pointing at the floor
 *   through the whole luffing cycle;
 * - the **rope pull** at the snatch block is local. It is the hoist rope
 *   dragging the block back down the jib towards the winch, so it is held in
 *   the jib's own frame and its arrow swings up and down with the jib.
 *
 * They act at different stations so the two arrows never sit on top of each
 * other, and the jib sweeps about fifty degrees, which is enough for the local
 * one to visibly part company with the global one.
 *
 * The jib is also the library's one link whose centre of mass is not at its
 * centroid: a counterweighted jib balances well inside the middle of its own
 * length, and a hand-placed centre of mass is what says so. It is held against
 * the link (the default anchor), because a counterweight is bolted to the jib
 * and rides it — which is exactly what the analysis needs, since the mass at
 * that point is what the inertia terms are computed about.
 *
 * This is a force mechanism, so the masses are real, in the same register the
 * other force fixtures use.
 */
export function craneWithTwoLoadsFixture(): MechanismFixture {
  const RPM = 9;
  const along = (distance: number) => ({
    x: distance * Math.cos(CRANE.angle),
    y: distance * Math.sin(CRANE.angle),
  });
  const linkPin = along(CRANE.toLink);
  const tip = along(CRANE.reach);
  const sheave = along(CRANE.toSheave);
  const balance = along(CRANE.toBalance);
  // The crank pin closes the four-bar: the crank's circle about the winch
  // meeting the luffing link's circle about the jib's own pin. The frame is
  // the shortest bar and the crank is next, so this is a crank-rocker — the
  // crank comes all the way round and the jib rocks between two limits.
  const crankPin = dyad(CRANE.winch, CRANE.crank, linkPin, CRANE.link, -1);
  // The rope runs from the block back down the jib to the winch, so its pull
  // on the jib points at the foot.
  const ropePull = 180;

  return {
    joints: [
      { id: 'O', x: 0, y: 0, ground: true },
      { id: 'C', x: linkPin.x, y: linkPin.y },
      { id: 'T', x: tip.x, y: tip.y },
      { id: 'G', x: CRANE.winch.x, y: CRANE.winch.y, ground: true, input: true, driveSpeed: RPM },
      { id: 'K', x: crankPin.x, y: crankPin.y },
    ],
    links: [
      { joints: 'GK', mass: 2, moi: 0.05, name: 'Luffing crank' },
      { joints: 'CK', mass: 3, moi: 0.4, name: 'Luffing link' },
      {
        joints: 'OCT',
        mass: 12,
        moi: 3,
        name: 'Jib',
        com: [balance.x, balance.y],
      },
    ],
    loads: [
      // F1: the hook, hanging off the tip. Weight, so global.
      { onLink: 'OCT', at: [tip.x, tip.y], vector: [0, -260] },
      // F2: the hoist rope, pulling the block back along the jib. Local, so it
      // stays along the jib as the jib luffs.
      {
        onLink: 'OCT',
        at: [sheave.x, sheave.y],
        vector: [-ropePull * Math.cos(CRANE.angle), -ropePull * Math.sin(CRANE.angle)],
        local: true,
      },
    ],
    inputAngVel: radPerSecond(RPM),
  };
}

/**
 * Three machines in one drawing, each on its own drive.
 *
 * The library's example of the multi-machine feature, and the reason to open it
 * is what the app does with it rather than any one of the linkages: three
 * partitions, M1, M2 and M3, three rows in the playback bar, three drives that
 * can be set independently, and the sync toggle that decides whether they share
 * a clock or keep their own.
 *
 * They are three different characters on purpose, so that a shared clock is
 * visibly doing something:
 *
 * - **M1** is a drag link — the frame is the shortest bar, so the output crank
 *   comes all the way round like the input, and `C` traces a full circle;
 * - **M2** is a slider-crank, whose piston reciprocates;
 * - **M3** is a crank-rocker, whose output rocks between two limits and stops.
 *
 * Each runs at its own speed and its own direction: six seconds a cycle
 * anticlockwise, seven and a half clockwise, five anticlockwise. Nothing is
 * shared between them — not a joint, not a bar, not a ground pin — so the
 * partitioner sees three machines, and they stand well apart on the grid so a
 * reader sees three too.
 *
 * Kinematics only, so every mass is zero.
 */
export function threeMachinesFixture(): MechanismFixture {
  // Anticlockwise, clockwise, anticlockwise; 6.0 s, 7.5 s and 5.0 s a cycle.
  const DRAG_LINK_RPM = 10;
  const SLIDER_RPM = -8;
  const ROCKER_RPM = 12;

  // M1, at the origin. Frame 1, crank 2, coupler 2.5, output crank 2: the
  // shortest bar is the frame and s + l < p + q, which is the double-crank
  // case — both grounded bars turn all the way round.
  const dragGround = { x: 0, y: 0 };
  const dragOut = { x: 1, y: 0 };
  const dragPin = { x: dragGround.x, y: dragGround.y + 2 };
  const dragCoupler = dyad(dragPin, 2.5, dragOut, 2, 1);

  // M2, ten units along. Crank 1, rod 3, bore on the crankshaft centreline.
  // Kept on y = 0: the bore and the rod below are written against that line.
  const sliderGround = { x: 8, y: 0 };

  // M3, above the other two rather than beyond them. Frame 3.5, crank 1,
  // coupler 3, rocker 2.5: shortest bar next to the frame, so the crank turns
  // and the rocker rocks. Three machines in a row framed as a thin strip and
  // drew each one too small to read; clustered, they share a square-ish box
  // and stay far enough apart to read as three.
  const rockGround = { x: 1, y: 6 };
  const rockAnchor = { x: 4.5, y: 6 };
  const rockPin = { x: rockGround.x, y: rockGround.y + 1 };
  const rockOut = dyad(rockPin, 3, rockAnchor, 2.5, 1);

  return {
    joints: [
      // M1 — the drag link.
      {
        id: 'A',
        x: dragGround.x,
        y: dragGround.y,
        ground: true,
        input: true,
        driveSpeed: DRAG_LINK_RPM,
      },
      { id: 'B', x: dragPin.x, y: dragPin.y },
      // The output pin goes round rather than rocking, which is the whole
      // point of a drag link and is only obvious once it is traced.
      { id: 'C', x: dragCoupler.x, y: dragCoupler.y, trace: true },
      { id: 'D', x: dragOut.x, y: dragOut.y, ground: true },

      // M2 — the slider-crank.
      {
        id: 'E',
        x: sliderGround.x,
        y: sliderGround.y,
        ground: true,
        input: true,
        driveSpeed: SLIDER_RPM,
      },
      { id: 'F', x: sliderGround.x + 1, y: 0 },
      { id: 'G', x: sliderGround.x + 4, y: 0 },

      // M3 — the crank-rocker.
      {
        id: 'H',
        x: rockGround.x,
        y: rockGround.y,
        ground: true,
        input: true,
        driveSpeed: ROCKER_RPM,
      },
      { id: 'I', x: rockPin.x, y: rockPin.y },
      { id: 'J', x: rockOut.x, y: rockOut.y },
      { id: 'K', x: rockAnchor.x, y: rockAnchor.y, ground: true },
    ],
    links: [
      { joints: 'AB', mass: 0, moi: 0, name: 'Drag crank' },
      { joints: 'BC', mass: 0, moi: 0, name: 'Drag coupler' },
      { joints: 'CD', mass: 0, moi: 0, name: 'Drag output' },

      { joints: 'EF', mass: 0, moi: 0, name: 'Crank' },
      { joints: 'FG', mass: 0, moi: 0, name: 'Connecting rod' },

      { joints: 'HI', mass: 0, moi: 0, name: 'Rocker crank' },
      { joints: 'IJ', mass: 0, moi: 0, name: 'Rocker coupler' },
      { joints: 'JK', mass: 0, moi: 0, name: 'Rocker' },
    ],
    slider: { at: 'G', prisId: 'P', angleRad: 0, pistonMass: 0 },
    // One Mechanism cannot hold three machines, so this is only what the
    // harness solves the drawing at when it is handed to the solver whole;
    // what each machine actually runs at is the `driveSpeed` on its own pin.
    inputAngVel: radPerSecond(DRAG_LINK_RPM),
  };
}
