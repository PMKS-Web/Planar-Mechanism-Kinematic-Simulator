import { MechanismFixture } from './fixture';
import { INPUT_SPEED } from './slot-fixtures';

// Fixtures mirror the MATLAB mechanism definitions in
// PMKS-Web/PMKS_Verification (Initializer.m / main.m of each mechanism, with
// initial link CoMs cross-checked against row 0 of the exported CSVs).
//
// reference-data/v1 intentionally rebaselines every speed from the declared
// RPM instead of retaining older rounded rad/s constants.
const rpmToRadPerSec = (rpm: number) => (rpm * Math.PI) / 30;

/** Four-bar with tracer points on every link and CAD-measured mass properties. */
export function teachingLabFourBarFixture(gravity = false): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: 1.52, y: 0 },
      { id: 'C', x: 4.23, y: 3.029 },
      { id: 'D', x: 4.572, y: 0, ground: true },
      { id: 'E', x: 4.79, y: 1.632 },
      { id: 'F', x: 2.548, y: 1.958 },
      { id: 'G', x: 2.053, y: 3.543 },
      { id: 'H', x: 0.7598, y: 1.0278 },
      { id: 'I', x: 4.1798, y: 1.952 },
    ],
    links: [
      { joints: 'ABH', mass: 10.458382, moi: 52777966.276354, com: [-6.38, 2.39] },
      { joints: 'BCFG', mass: 0.626202, moi: 10871793.503827, com: [185.73, 209.1] },
      { joints: 'CDEI', mass: 4.901229, moi: 63343618.03601, com: [472.56, -20.8] },
    ],
    inputAngVel: rpmToRadPerSec(10.31),
    gravity,
  };
}

/**
 * Crank-slider. The MATLAB link is named BCE, where E is a sensor mounted
 * exactly at joint B, so the PMKS+ link is just BC; the prismatic joint takes
 * the next free letter D.
 */
export function teachingLabSliderCrankFixture(gravity = false): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 13.79, y: 10.01, ground: true, input: true },
      { id: 'B', x: 13.79, y: 13.82 },
      { id: 'C', x: -0.97, y: 10.01 },
    ],
    links: [
      { joints: 'AB', mass: 1.08532, moi: 0.0004647594, com: [0, 0.1] },
      { joints: 'BC', mass: 0.50144, moi: 0.0030344427, com: [0.5, 0.7] },
    ],
    slider: { at: 'C', prisId: 'D', angleRad: 0, pistonMass: 1.31788 },
    inputAngVel: rpmToRadPerSec(15.1),
    gravity,
  };
}

/** Crank-slider with a tracer point D on the coupler. Prismatic joint is E. */
export function sliderCrankTracerFixture(): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: 4, y: 2 },
      { id: 'C', x: 12, y: 0 },
      { id: 'D', x: 20, y: 2 },
    ],
    links: [
      { joints: 'AB', mass: 5, moi: 0.1 },
      { joints: 'BCD', mass: 10, moi: 0.2 },
    ],
    slider: { at: 'C', prisId: 'E', angleRad: 0 },
    inputAngVel: rpmToRadPerSec(10),
  };
}

/** Stephenson III six-bar with a 50 N x-load at the midpoint of output link FG. */
export function stephensonIiiEx2Fixture(gravity = false): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 7, y: 4, ground: true, input: true },
      { id: 'B', x: 5, y: 16 },
      { id: 'C', x: 25, y: 25 },
      { id: 'D', x: 23, y: 10, ground: true },
      { id: 'E', x: 18, y: 35 },
      { id: 'F', x: 43, y: 32 },
      { id: 'G', x: 45, y: 17, ground: true },
    ],
    links: [
      { joints: 'AB', mass: 5, moi: 0.1 },
      { joints: 'BCE', mass: 10, moi: 0.2 },
      { joints: 'CD', mass: 5, moi: 0.1 },
      { joints: 'EF', mass: 10, moi: 0.2 },
      { joints: 'FG', mass: 5, moi: 0.1 },
    ],
    load: { onLink: 'FG', at: [(43 + 45) / 2, (32 + 17) / 2], vector: [50, 0] },
    inputAngVel: rpmToRadPerSec(10),
    gravity,
  };
}

/** Watt I six-bar (rocking input) with a [50, 25] N load at output link CFG's center. */
export function wattIFixture(gravity = false): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: -3.74, y: -2.41, ground: true, input: true },
      { id: 'B', x: -2.72, y: 0.91 },
      { id: 'C', x: 1.58, y: 0.43 },
      { id: 'D', x: -0.24, y: 4.01 },
      { id: 'E', x: 5.08, y: 5.31 },
      { id: 'F', x: 8.14, y: 3.35 },
      { id: 'G', x: 7.32, y: -3.51, ground: true },
    ],
    links: [
      { joints: 'AB', mass: 5, moi: 0.1 },
      { joints: 'BCD', mass: 10, moi: 0.2 },
      { joints: 'DE', mass: 5, moi: 0.1 },
      { joints: 'EF', mass: 10, moi: 0.2 },
      { joints: 'CFG', mass: 5, moi: 0.1 },
    ],
    load: {
      onLink: 'CFG',
      at: [(1.58 + 8.14 + 7.32) / 3, (0.43 + 3.35 - 3.51) / 3],
      vector: [50, 25],
    },
    inputAngVel: rpmToRadPerSec(10),
    gravity,
  };
}

/**
 * Gate 6: one four-bar, drivable from either of two joints.
 *
 * `drivenAt: 'A'` is the ordinary machine — a grounded crank, solved by the
 * walk. `drivenAt: 'C'` drives the *coupler–rocker pin*, which is a floating
 * joint: nothing about its position is known when the walk starts, so it
 * reaches the constraint set instead (§2.9, Phase 6).
 *
 * The point of having both is that they are the same mechanism. Whatever the
 * coupler traces one way it must trace the other, which makes the reference
 * exact and leaves no data to drift.
 *
 * Grashof proportions, so the crank turns fully: ground 4, crank 1.5,
 * coupler 3.5, rocker 3. T is a tracer on the coupler, off its line, so the
 * curve it draws is a real coupler curve rather than a circle.
 */
export function fourBarDrivenAtFixture(
  drivenAt: 'A' | 'C',
  /**
   * Hang a second chain off the driven pin, so three bodies meet there. An
   * input then names no particular pair of them (§2.9), and the mechanism has
   * to say so rather than drive one of them and hope.
   */
  extraChainAtC: boolean = false
): MechanismFixture {
  return {
    joints: [
      { id: 'O', x: 0, y: 0, ground: true, input: drivenAt === 'A' },
      { id: 'A', x: 0.45, y: 1.43 },
      { id: 'C', x: 3.3, y: 2.4, input: drivenAt === 'C' },
      { id: 'D', x: 4, y: 0, ground: true },
      { id: 'T', x: 2.1, y: 3.3 },
      ...(extraChainAtC
        ? [
            { id: 'U', x: 5.2, y: 2.9 },
            { id: 'V', x: 6.4, y: 1.4, ground: true },
          ]
        : []),
    ],
    links: [
      { joints: 'OA' },
      { joints: 'ACT' },
      { joints: 'CD' },
      ...(extraChainAtC ? [{ joints: 'CU' }, { joints: 'UV' }] : []),
    ],
    inputAngVel: INPUT_SPEED,
  };
}

/**
 * Two crank-rockers side by side in one drawing, sharing nothing.
 *
 * The gallery's first two-machine mechanism. What it is for is not that a
 * second four-bar can be drawn — it always could — but that drawing it no
 * longer breaks the first: everything used to go into one Mechanism, so the
 * document read as 2 degrees of freedom and *both* machines stopped solving.
 * Opened from this URL the app should partition it into M1 and M2, each 1-DoF
 * with its own input, its own playback row and its own clock.
 */
export function twoFourBarsFixture(): MechanismFixture {
  const bar = (from: string, offset: number) => {
    const letter = (n: number) => String.fromCharCode(from.charCodeAt(0) + n);
    return {
      joints: [
        { id: letter(0), x: offset, y: 0, ground: true, input: true },
        { id: letter(1), x: offset, y: 1 },
        { id: letter(2), x: offset + 3, y: 2 },
        { id: letter(3), x: offset + 4, y: 0, ground: true },
      ],
      links: [
        { joints: letter(0) + letter(1) },
        { joints: letter(1) + letter(2) },
        { joints: letter(2) + letter(3) },
      ],
    };
  };
  const first = bar('A', 0);
  const second = bar('E', 10);
  return {
    joints: [...first.joints, ...second.joints],
    links: [...first.links, ...second.links],
    inputAngVel: INPUT_SPEED,
  };
}

/**
 * A crank-rocker one edit away from being neither.
 *
 * Its links are 1.85, 2.75, 3.45 and 4.20: shortest plus longest is 6.05
 * against 6.20 for the other two, so Grashof holds by 0.15 and a crank about a
 * third longer breaks it.
 *
 * Grashof's condition -- whether the shortest link can turn all the way round
 * -- is a comparison between four lengths, so it is always one drag from
 * changing. This one sits close enough to the boundary that lengthening the
 * crank a little crosses it, which is the mainline case for an anchor becoming
 * unreachable (`docs/edit-mode-playback-plan.md` §6.1): the input that used to
 * go round now rocks between limits, and the value the cycle started at is
 * outside them.
 *
 * Published so a reader can open the mechanism the test is about and try the
 * drag themselves, rather than rebuilding it from a spec by hand.
 */
export function nearlyNonGrashofFixture(): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: 0, y: 1.85 },
      { id: 'C', x: 2.5, y: 3.0 },
      { id: 'D', x: 4.2, y: 0, ground: true },
    ],
    links: [{ joints: 'AB' }, { joints: 'BC' }, { joints: 'CD' }],
    inputAngVel: INPUT_SPEED,
  };
}

/**
 * A rocker whose swing is wider than a full turn.
 *
 * Ten pins and eight bars, drawn by a reader who found that it "says it loops
 * but does not come back". An independent continuation of its configuration
 * curve puts the crank's range at 444 degrees: from where it is drawn it turns
 * clockwise through a whole revolution and 75 degrees more, stops, comes back,
 * passes the start, stops 9 degrees beyond it, and comes back again.
 *
 * The sweep used to close every crank on the count of one revolution, and
 * this one is not home after one -- the drawing at 360 degrees is half a
 * mechanism away from the drawing at 0 -- so it was published as looping,
 * with every joint but the crank teleporting at the wrap. The count of a
 * revolution is only a cycle when the drawing is home on it.
 */
export function wideSwingRockerFixture(): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: -0.154, y: 0.528, ground: true, input: true, driveSpeed: -10 },
      { id: 'B', x: 6.17, y: 0, ground: true },
      { id: 'C', x: 0.97, y: 2.123 },
      { id: 'D', x: 0.841, y: 0.28 },
      { id: 'E', x: 2.641, y: 3.107 },
      { id: 'F', x: 6.17, y: 3.107 },
      { id: 'G', x: 4.665, y: 2.031 },
      { id: 'H', x: 3.141, y: 1.303 },
      { id: 'I', x: 3.954, y: -0.407 },
      { id: 'J', x: 3.881, y: 1.886 },
    ],
    links: [
      { joints: 'ACD' },
      { joints: 'CE' },
      { joints: 'EFG' },
      { joints: 'BFJ' },
      { joints: 'DHI' },
      { joints: 'GH' },
      { joints: 'IJ' },
    ],
    inputAngVel: -INPUT_SPEED,
  };
}
