import '../../app/model/joint';
import { buildMechanism } from '../../test-utils/verification/fixture';
import {
  redundantParallelCrankFixture,
  teachingLabFourBarFixture,
  teachingLabSliderCrankFixture,
} from '../../test-utils/verification/fixtures';

/**
 * Gruebler's paradox, and the second question that keeps the cure honest.
 *
 * Counting bodies and joints answers "can this move" correctly almost always,
 * and wrongly in one direction: it charges twice for constraints that say the
 * same thing, so a linkage whose redundancy is geometric comes out too low.
 * Reported by a reader whose drawing -- three parallel cranks carrying one
 * coupler -- refused to simulate.
 *
 * Asking the geometry instead is right but not sufficient: a rank deficiency
 * says the linkage can move *at this instant*, which a tangency also says. So
 * both halves are pinned here, on the same page, because either alone is a
 * wrong answer to a different drawing.
 */
describe('a mechanism Gruebler counts as rigid', () => {
  it('turns, when its third crank only repeats what the first two said', () => {
    const built = buildMechanism(redundantParallelCrankFixture());

    expect(built.mechanism.dof).toBe(1);
    expect(built.mechanism.isMechanismValid()).toBe(true);
  });

  it('and turns as a parallelogram: every bar rigid, the coupler never turning', () => {
    // The claim worth making is not that a cycle came back -- it is that the
    // cycle is the motion a parallelogram has. Each bar keeps its length, and
    // the coupler translates on a circle without rotating, which is what makes
    // this linkage worth drawing in the first place.
    const built = buildMechanism(redundantParallelCrankFixture());
    const frames = built.mechanism.joints;
    expect(frames.length).toBeGreaterThan(300);

    const at = (frame: (typeof frames)[number], id: string) => frame.find((one) => one.id === id)!;
    const span = (id: string, other: string) =>
      frames.map((frame) =>
        Math.hypot(at(frame, id).x - at(frame, other).x, at(frame, id).y - at(frame, other).y)
      );
    for (const [from, to] of [
      ['A', 'B'],
      ['E', 'F'],
      ['I', 'J'],
      ['B', 'E'],
      ['B', 'I'],
    ]) {
      const lengths = span(from, to);
      expect(Math.max(...lengths) - Math.min(...lengths), `${from}${to}`).toBeLessThan(1e-3);
    }

    // The coupler holds its heading the whole way round: that is what "the
    // third crank changes nothing" means, said as a measurement. The bound is
    // a twentieth of a degree -- the solver's own drift, and four orders below
    // the radians a coupler that really turned would move through.
    const headings = frames.map((frame) =>
      Math.atan2(at(frame, 'E').y - at(frame, 'B').y, at(frame, 'E').x - at(frame, 'B').x)
    );
    expect(Math.max(...headings) - Math.min(...headings)).toBeLessThan(1e-3);
  });

  it('stays rigid when the freedom is a tangency rather than a motion', () => {
    // The same test, told no. A slider-crank whose coupler is welded to its
    // block has the crank pin on a circle and on a line at once; drawn where
    // the two touch, the rank finds a freedom that the second step takes away.
    // Counting it would hand a solver a linkage to tear apart.
    const welded = { ...teachingLabSliderCrankFixture(), welds: ['C'] };

    expect(buildMechanism(welded).mechanism.dof).toBe(0);
  });

  it('leaves an ordinary four-bar exactly where it found it', () => {
    // Nothing above may reach a drawing the count already gets right: the
    // geometry is asked only when the count says the linkage cannot move.
    expect(buildMechanism(teachingLabFourBarFixture()).mechanism.dof).toBe(1);
  });
});
