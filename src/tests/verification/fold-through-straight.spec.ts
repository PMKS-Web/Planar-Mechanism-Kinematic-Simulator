import '../../app/model/joint';
import { buildMechanism } from '../../test-utils/verification/fixture';
import {
  equalSidedFourBarFixture,
  redundantParallelCrankFixture,
} from '../../test-utils/verification/fixtures';

/**
 * The two linkages that are hardest to solve, kept side by side.
 *
 * Both were reported from shared links, and both are the same *kind* of
 * difficulty rather than the same bug: a place where the geometry stops telling
 * the solver which way to go, and it has to come back on the branch it left on.
 *
 * - A four-bar with four equal sides folds flat twice a turn. At a quarter and
 *   three-quarters every joint is on one line -- the change point -- and from
 *   there the mechanism can continue as a parallelogram or cross over into the
 *   anti-parallelogram. Either is a valid assembly; only one is the motion the
 *   reader was watching.
 * - A parallelogram with a third parallel crank is the mobility case:
 *   Gruebler's count says zero because the third crank repeats what the first
 *   two said, and it turns perfectly well. `redundant-parallel-crank.spec.ts`
 *   covers the counting; what is checked here is the *motion*, which is the
 *   half a reader sees.
 *
 * What both assert is the same thing, and it is deliberately about the whole
 * cycle rather than about any one pose: every bar keeps its length from end to
 * end, and the drawing comes home. A branch flip shows up in both -- a bar
 * whose length jumps, or a cycle that ends somewhere the start was not.
 */
describe('a linkage that folds through a straight line', () => {
  /** Every rigid pair in the drawing, and how much it varied across the cycle. */
  function rigidity(built: ReturnType<typeof buildMechanism>) {
    const frames = built.mechanism.joints;
    const at = (frame: (typeof frames)[number], id: string) => frame.find((one) => one.id === id)!;
    return (pairs: readonly (readonly [string, string])[]) =>
      pairs.map(([from, to]) => {
        const lengths = frames.map((frame) =>
          Math.hypot(at(frame, to).x - at(frame, from).x, at(frame, to).y - at(frame, from).y)
        );
        return {
          pair: `${from}${to}`,
          at: Math.min(...lengths),
          drift: Math.max(...lengths) - Math.min(...lengths),
        };
      });
  }

  /** How far each joint ended from where it began. */
  function closes(built: ReturnType<typeof buildMechanism>): number {
    const frames = built.mechanism.joints;
    const first = frames[0];
    const last = frames[frames.length - 1];
    return Math.max(
      ...first.map((joint, index) => Math.hypot(last[index].x - joint.x, last[index].y - joint.y))
    );
  }

  it('turns a rhombus all the way round without changing a bar', () => {
    const built = buildMechanism(equalSidedFourBarFixture());
    expect(built.mechanism.dof).toBe(1);
    expect(built.mechanism.isMechanismValid()).toBe(true);

    // Four equal sides, and they stay equal. A crossover at either fold shows
    // up here first: the coupler has to stretch to reach the other branch.
    for (const bar of rigidity(built)([
      ['A', 'B'],
      ['B', 'G'],
      ['G', 'H'],
    ])) {
      expect(bar.drift, `${bar.pair} at ${bar.at}`).toBeLessThan(1e-3);
    }
    expect(closes(built)).toBeLessThan(1e-3);
  });

  it('and passes through the fold rather than stopping at it', () => {
    // The two flat poses are a quarter and three-quarters of the way round. A
    // solver that gives up at a change point ends its cycle there, so the count
    // of samples is what says it went through: a full turn, not a quarter of
    // one.
    const built = buildMechanism(equalSidedFourBarFixture());
    const frames = built.mechanism.joints;
    expect(frames.length).toBeGreaterThan(300);

    // Flat means every joint on one line, which is what the fold is. It has to
    // happen -- a rhombus cannot go round without it -- and the drawing has to
    // be somewhere else by the end.
    const spread = frames.map((frame) => {
      const ys = frame.map((joint) => joint.y);
      return Math.max(...ys) - Math.min(...ys);
    });
    expect(Math.min(...spread)).toBeLessThan(1e-3);
    expect(Math.max(...spread)).toBeGreaterThan(1);
  });

  it('turns the redundant-crank parallelogram without tearing it', () => {
    const built = buildMechanism(redundantParallelCrankFixture());
    expect(built.mechanism.dof).toBe(1);
    expect(built.mechanism.isMechanismValid()).toBe(true);

    for (const bar of rigidity(built)([
      ['A', 'B'],
      ['E', 'F'],
      ['I', 'J'],
      ['B', 'E'],
      ['B', 'I'],
      ['E', 'I'],
    ])) {
      expect(bar.drift, `${bar.pair} at ${bar.at}`).toBeLessThan(1e-3);
    }
    expect(closes(built)).toBeLessThan(1e-3);
  });
});
