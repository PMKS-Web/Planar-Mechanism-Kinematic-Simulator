import '../../app/model/joint';
import { RealJoint } from '../../app/model/joint';
import { RealLink } from '../../app/model/link';
import { ForceAnalysisSeries, ForceSolver } from '../../app/model/mechanism/force-solver';
import { Mechanism } from '../../app/model/mechanism/mechanism';
import { buildMechanism, MechanismFixture } from '../../test-utils/verification/fixture';
import {
  loadedInvertedSliderCrankFixture,
  scotchYokeFixture,
  scotchYokeGuidedAtFarEndFixture,
  SLOT_RISE,
  swingingBlockFixture,
  YOKE_CRANK,
} from '../../test-utils/verification/slot-fixtures';

// Statics through a welded slide assembly (docs/phase-3-slide-spec.md §9).
//
// A prismatic pair transmits a normal force *and* a couple. While the block is
// a free-turning body the couple never appears; welded to a rider, the guide
// has to supply one, and the solver now carries a column for it. Phase 3's
// honest refusal is retired by the thing it was holding the door for.
//
// The check is against hand statics, not against the solver's own arithmetic.
// For a yoke under a load (fx, fy) applied to the rider, with the crank pin B
// riding the vertical slot and the guide pin at G:
//
//   - the slot passes the horizontal load through to the crank pin unchanged,
//     so the crank feels torque      T = fx · y_B;
//   - the load line misses the pin, and the guide couple closes the gap:
//                                    τ = fx · (y_L − y_B) − fy · (x_L − x_G),
//     counterclockwise-positive on the rider.
//
// Both are evaluated from the mechanism's own positions at each step — the
// formulas are hand-derived, the coordinates are whatever the position solver
// (with its four-decimal rounding) actually produced. τ barely depends on
// where along the rider the guide sits, which is why the same two formulas
// cover both yoke variants.

/** Horizontal load on the yoke, newtons. */
const P = 40;

const loadedYoke = (fixture: MechanismFixture): Mechanism => {
  fixture.load = { onLink: 'CD', at: [YOKE_CRANK, SLOT_RISE], vector: [P, 0] };
  return buildMechanism(fixture).mechanism;
};

const everyFrameOk = (series: ForceAnalysisSeries): void => {
  expect(series.diagnostic).toBeUndefined();
  expect(series.successfulFrames).toBe(series.frames.length);
  expect(series.frames.length).toBeGreaterThan(300);
};

/** Hand statics evaluated at timestep t's own (rounded) geometry. */
const handStatics = (mechanism: Mechanism, t: number, guideId: string) => {
  const at = (id: string) => mechanism.joints[t].find((joint) => joint.id === id)!;
  const load = (mechanism.links[t].find((link) => link.id === 'CD') as RealLink).forces[0];
  const fx = load.mag * Math.cos(load.angleRad);
  const fy = load.mag * Math.sin(load.angleRad);
  const pinHeight = at('B').y - at('A').y;
  return {
    torque: fx * pinHeight,
    couple: fx * (load.startCoord.y - at('A').y - pinHeight) - fy * (load.startCoord.x - at(guideId).x),
  };
};

describe('force analysis of a welded slide assembly', () => {
  it('solves the loaded Scotch yoke, matching hand statics on every frame', () => {
    const mechanism = loadedYoke(scotchYokeFixture());
    const series = mechanism.getForceAnalysis('static');
    everyFrameOk(series);

    series.frames.forEach((frame, t) => {
      const expected = handStatics(mechanism, t, 'C');
      expect(frame.inputEffort!.valueSI).toBeCloseTo(expected.torque, 6);
      expect(frame.guideCouples.get('F')).toBeCloseTo(expected.couple, 6);
    });
  });

  it('reaches the same two numbers with the guide at the far end of the slot', () => {
    // Kinematically identical, but the loop reaches the welded rider along a
    // link edge instead of stepping straight onto the block — the same control
    // the kinematics suite uses, now standing guard over the couple column.
    const mechanism = loadedYoke(scotchYokeGuidedAtFarEndFixture());
    const series = mechanism.getForceAnalysis('static');
    everyFrameOk(series);

    series.frames.forEach((frame, t) => {
      const expected = handStatics(mechanism, t, 'D');
      expect(frame.inputEffort!.valueSI).toBeCloseTo(expected.torque, 6);
      expect(frame.guideCouples.get('G')).toBeCloseTo(expected.couple, 6);
    });
  });

  it('passes the load across the slot with reactions equal and opposite', () => {
    const mechanism = loadedYoke(scotchYokeFixture());
    const frame = mechanism.getForceAnalysis('static').frames[45];

    const acrossSlot = frame.jointReactionsByLink.get('E')!;
    const onBlock = acrossSlot.get('BE') ?? [...acrossSlot.values()][0];
    const onCarrier = acrossSlot.get('CD') ?? [...acrossSlot.values()][1];
    expect(onBlock[0] + onCarrier[0]).toBeCloseTo(0, 8);
    expect(onBlock[1] + onCarrier[1]).toBeCloseTo(0, 8);
    // And the carrier-side force is the load, passed through unchanged.
    expect(Math.hypot(onCarrier[0], onCarrier[1])).toBeCloseTo(P, 3);
    expect(onCarrier[0]).toBeLessThan(0);
  });

  it('solves a slide whose guide is cut into a moving link', () => {
    // The swinging-block engine: rider welded to a block sliding in a link
    // that itself pivots. The couple's reaction lands on that carrier rather
    // than on the world — the −1 side of the column, which no grounded-guide
    // yoke can reach. Its kinematics are still refused (spec §4), so this is
    // the statics of the drawn pose.
    const fixture = swingingBlockFixture();
    fixture.load = { onLink: 'BR', at: [YOKE_CRANK, 0], vector: [30, 0] };
    const built = buildMechanism(fixture);

    const frame = ForceSolver.analyzeFrame(built.joints, built.links, 'static', false, 'm');

    expect(frame.status).toBe('ok');
    expect(frame.guideCouples.size).toBe(1);
    expect([...frame.guideCouples.values()].every(Number.isFinite)).toBe(true);
    expect(frame.residual).toBeLessThanOrEqual(1e-8);
  });

  it('still refuses a weld that turns the mechanism into a structure', () => {
    // Welding the inverted slider-crank's pin makes crank and block one rigid
    // body: DOF 0, a structure. Its statics are indeterminate — an input
    // effort has nowhere to go — and the honest answer is a refusal, not a
    // number.
    const welded = buildMechanism(loadedInvertedSliderCrankFixture());
    (welded.joints.find((joint) => joint.id === 'B') as RealJoint).isWelded = true;

    const frame = ForceSolver.analyzeFrame(welded.joints, welded.links, 'static', true, 'm');

    expect(frame.status).toBe('unsupported-topology');
    expect(frame.message).toContain('equations');
  });
});
