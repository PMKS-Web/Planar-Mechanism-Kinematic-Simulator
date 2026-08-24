import { MechanismFixture } from './fixture';

// Mechanisms that fill holes in the template library rather than holes in the
// solver. Each one is a machine a workshop would recognise, chosen because the
// library has no other example of the thing it does: a four-bar whose output
// crank goes round, a link that is two bars welded together, and a drive that
// pushes instead of turning.

/**
 * How fast a pin-driven mechanism here is told to turn, in rad/s.
 *
 * Ten rpm, which is 2*pi/6 rad/s, so a revolution takes six seconds. The
 * verification suite's own fixtures run at 1 rad/s because their truth tables
 * are stated against it; these are made to be watched, and the shared default
 * of 5 rpm takes twelve seconds to come back round, which is long enough that a
 * class stops looking.
 */
const PIN_SPEED = (10 * Math.PI) / 30;

/**
 * Where two bar lengths meet, given the two points they hang from.
 *
 * The circles cross twice and the roots mirror across the line `from`-`to`;
 * `side` is +1 for the root left of that line and -1 for the right. Which root
 * a fixture wants is its assembly mode, so it is named at the call site rather
 * than guessed here.
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
 * Drag-link proportions: the four bar lengths, and nothing else.
 *
 * Grashof's rule decides which bar can turn all the way round — the shortest
 * one — and the frame's role decides what the linkage is called. Here the
 * shortest bar *is* the frame, which is the double-crank case: both bars pinned
 * to it rotate. Written out, s + l = 1.0 + 2.6 = 3.6 against p + q = 2.2 + 2.0
 * = 4.2, so the inequality is strict and there is no change point anywhere in
 * the revolution for the linkage to fall through.
 *
 * The two cranks are deliberately unequal. Equal ones with an equal frame and
 * coupler give a parallelogram, where the output simply copies the input and
 * there is nothing to see; off-square like this the output runs between 0.47
 * and 2.03 times the input rate, a spread of better than four to one, which is
 * the quick-return a drag link is actually bought for.
 */
export const DRAG_LINK = {
  frame: 1.0,
  driver: 2.2,
  coupler: 2.6,
  follower: 2.0,
} as const;

/**
 * A drag link: the four-bar where the output crank goes round too.
 *
 * It is worth opening precisely because it looks like the four-bar everyone
 * already knows and does not behave like it. Give a crank-rocker's frame the
 * shortest bar instead of one of the sides and the far crank stops rocking and
 * starts rotating — same four bars, same joints, an output that never reverses.
 * Watching the far crank complete a turn is the whole demonstration, and the
 * uneven rate it does it at is what the mechanism is used for.
 *
 * Drawn with the driving crank straight up, a quarter turn from either of the
 * poses where it lines up with the frame, so a run crosses both.
 */
export function dragLinkFixture(): MechanismFixture {
  const A = { x: 0, y: 0 };
  const D = { x: DRAG_LINK.frame, y: 0 };
  const B = { x: A.x, y: A.y + DRAG_LINK.driver };
  // The upper root, which puts the coupler across the top of the frame rather
  // than folded back under it. Either assembly mode turns the output all the
  // way round — the linkage is Grashof on both — but this one draws open.
  const C = meet(B, DRAG_LINK.coupler, D, DRAG_LINK.follower, 1);
  return {
    joints: [
      { id: 'A', ...A, ground: true, input: true },
      { id: 'B', ...B },
      { id: 'C', ...C },
      { id: 'D', ...D, ground: true },
    ],
    // Kinematics demonstration: the bars have no mass, so the force analysis
    // has nothing to report and cannot distract from what is being shown.
    links: [
      { joints: 'AB', mass: 0, moi: 0 },
      { joints: 'BC', mass: 0, moi: 0 },
      { joints: 'CD', mass: 0, moi: 0 },
    ],
    inputAngVel: PIN_SPEED,
  };
}

/**
 * Bell-crank proportions: the two arms, the angle they are fused at, and the
 * four-bar on either side of them.
 *
 * The arms are unequal because a bell crank that is not is a plain rocker with
 * extra joints: the ratio of the arms is the force ratio the part exists to
 * provide, and 2.0 to 1.6 shows it without being so lopsided that the short arm
 * disappears.
 *
 * The input four-bar is Grashof with the crank shortest and next to the frame,
 * so the crank turns continuously: |A-D| is 4.61 for a frame, s + l = 1.0 +
 * 4.61 = 5.61 against p + q = 4.0 + 2.0 = 6.0.
 */
export const BELL_CRANK = {
  /** Ground pivot the two arms are fused about, at the origin. */
  pivot: { x: 0, y: 0 },
  inputArm: 2.0,
  outputArm: 1.6,
  /** The fused angle — a right angle is what makes it a bell crank. */
  includedRad: Math.PI / 2,
  /** Where the input arm points in the drawn pose, roughly mid-rock. */
  inputArmRad: (150 * Math.PI) / 180,
  /** The driving crank's ground pivot, its length, and the coupler up to the arm. */
  crankPivot: { x: -4.5, y: -1 },
  crank: 1.0,
  coupler: 4.0,
  /** The output rocker's ground pivot, its length, and the link across to it. */
  rockerPivot: { x: 3.5, y: 0.4 },
  rocker: 1.2,
  link: 2.5,
} as const;

/**
 * A bell crank: two bars welded at a right angle, turning a push into a push
 * the other way.
 *
 * This is the honest reason a compound link exists. A crank drives the long arm
 * from the left; because the short arm is fused rigid to it and shares its
 * pivot, whatever the long arm does the short arm does too, ninety degrees
 * round — so the machine's motion comes out of the far side pointing somewhere
 * the input never did. Take the weld away and the two bars fold at the pivot
 * and carry nothing.
 *
 * The welded body is the link `CDE`, holding sub-links `CD` and `DE`. Nothing
 * else in the library has one, so this is the only template from which the
 * app's Compound Link Settings can be reached.
 *
 * Six bars in all, and every joint is reachable from two already-known ones:
 * the crank places B, B and the fixed pivot D place C, C fixes the whole welded
 * body and with it E, and E and the rocker pivot place F. The crank turns
 * continuously, the bell crank rocks 61 degrees, and the output rocker sweeps
 * 42 — with 49 degrees of transmission angle in hand at the worst pose, so
 * neither dyad comes near flattening.
 */
export function bellCrankFixture(): MechanismFixture {
  const { pivot, includedRad, inputArmRad } = BELL_CRANK;
  const arm = (length: number, angleRad: number) => ({
    x: pivot.x + length * Math.cos(angleRad),
    y: pivot.y + length * Math.sin(angleRad),
  });
  const C = arm(BELL_CRANK.inputArm, inputArmRad);
  // The output arm trails the input arm by the fused angle, which is the only
  // relation that makes this one body rather than two.
  const E = arm(BELL_CRANK.outputArm, inputArmRad - includedRad);
  // The branch matters here rather than only drawing differently: assembled the
  // other way the coupler cannot hold the bell crank's arm through a whole turn
  // of the crank, and the linkage jams partway round.
  const B = meet(BELL_CRANK.crankPivot, BELL_CRANK.crank, C, BELL_CRANK.coupler, 1);
  const F = meet(E, BELL_CRANK.link, BELL_CRANK.rockerPivot, BELL_CRANK.rocker, 1);
  return {
    joints: [
      { id: 'A', ...BELL_CRANK.crankPivot, ground: true, input: true },
      { id: 'B', ...B },
      { id: 'C', ...C },
      { id: 'D', ...pivot, ground: true },
      { id: 'E', ...E },
      { id: 'F', ...F },
      { id: 'G', ...BELL_CRANK.rockerPivot, ground: true },
    ],
    links: [
      { joints: 'AB', mass: 0, moi: 0 },
      { joints: 'BC', mass: 0, moi: 0 },
      // The compound body, and the two bars a user would have drawn and then
      // welded at D. `subset` is what carries that history into the model.
      {
        joints: 'CDE',
        mass: 0,
        moi: 0,
        subset: [
          { joints: 'CD', mass: 0, moi: 0 },
          { joints: 'DE', mass: 0, moi: 0 },
        ],
      },
      { joints: 'EF', mass: 0, moi: 0 },
      { joints: 'FG', mass: 0, moi: 0 },
    ],
    // D carries no slider, so the flag reads as a compound weld rather than a
    // Slide, and the mark rides the URL with the rest of the state.
    welds: ['D'],
    inputAngVel: PIN_SPEED,
  };
}

/**
 * Screw-jack proportions: a horizontal guide, a rocker above it, and the rod
 * between them.
 *
 * The rocker pivot stands 2.2 above the guide and the rocker is 1.6, so the pin
 * it carries never comes down onto the guide line and the rod never has to pass
 * through it. Nothing declares a stroke: the travel is bounded by the rod and
 * the rocker coming into line at |A-C| = 4.0, which is x = +/-3.34, and the
 * solver's tenth-of-a-unit steps stop just inside that, so the block runs 6.6
 * units and reverses. The rocker sweeps 144 degrees between those two limits.
 */
export const SCREW_JACK = {
  /** The rocker's ground pivot, above the actuator's guide. */
  pivot: { x: 0, y: 2.2 },
  rocker: 1.6,
  rod: 2.4,
  /** Where the rocker points when drawn — below the horizontal, mid-stroke. */
  rockerRad: (-50 * Math.PI) / 180,
} as const;

/**
 * How fast the actuator travels, in length units per second.
 *
 * A prismatic drive's speed is a length per second rather than an rpm, so it
 * cannot share `PIN_SPEED`. The block runs 6.6 units and comes back, so 2.2 a
 * second brings a cycle round in exactly six — the same pace as the pin-driven
 * fixtures here, which is the point of choosing it.
 */
const SCREW_JACK_SPEED = 2.2;

/**
 * A linear actuator pushing a rocker: a screw jack, or an electric ram.
 *
 * Every driven-slider template in the library is a sealed hydraulic cylinder,
 * which is a compound part with its own skin and its own rules. This is the
 * plain case underneath all of them — one block on one grounded guide, told how
 * fast to travel, with a rod up to a lever. It is what a screw jack under a
 * table, a linear actuator on a hatch or a rack pushing a gate actually is, and
 * it is the simplest mechanism in which the input is a length rather than an
 * angle.
 *
 * There is no stroke to declare, because a plain guide has no ends: the travel
 * stops where the rod and the rocker come into line and the linkage cannot be
 * assembled any further, and then it runs back. That is the same thing that
 * limits a real jack, and it is why the output is a rocking arm and not a
 * rotation.
 *
 * `scale` is the knob every driven-slider fixture carries, and for the same
 * reason: a driven block advances by a step measured in internal model units,
 * so a mechanism that is to be *solved* is built in them, while the published
 * payload is built at 1 and scaled at the codec boundary.
 */
export function linearActuatorRockerFixture(scale: number = 1): MechanismFixture {
  const at = (point: { x: number; y: number }) => ({ x: point.x * scale, y: point.y * scale });
  const B = {
    x: SCREW_JACK.pivot.x + SCREW_JACK.rocker * Math.cos(SCREW_JACK.rockerRad),
    y: SCREW_JACK.pivot.y + SCREW_JACK.rocker * Math.sin(SCREW_JACK.rockerRad),
  };
  // The block rides the x axis, so its position is the one root of the rod
  // length that puts it left of the pin: the actuator pushes rather than pulls.
  const A = { x: B.x - Math.sqrt(SCREW_JACK.rod ** 2 - B.y ** 2), y: 0 };
  return {
    joints: [
      { id: 'A', ...at(A) },
      { id: 'B', ...at(B) },
      { id: 'C', ...at(SCREW_JACK.pivot), ground: true },
    ],
    links: [
      { joints: 'AB', mass: 0, moi: 0 },
      { joints: 'BC', mass: 0, moi: 0 },
    ],
    // A grounded guide along the x axis, and no `on`, so this is an ordinary
    // slot cut into the world rather than the barrel of a cylinder.
    slider: { at: 'A', prisId: 'P', angleRad: 0, input: true },
    // Length per second, not rpm: 13.2 units of travel out and back at 2.2 a
    // second is a six-second cycle, the same as the pin-driven fixtures here.
    inputAngVel: SCREW_JACK_SPEED * scale,
  };
}
