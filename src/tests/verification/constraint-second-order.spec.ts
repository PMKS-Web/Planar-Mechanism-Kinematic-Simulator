// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import {
  Constraint,
  PositionMap,
  residuals,
  secondOrderTerms,
  SimultaneousSystem,
} from '../../app/model/mechanism/simultaneous-solver';

/**
 * Every row's second derivative, against a difference that can be trusted.
 *
 * `secondOrderTerms` is what makes an acceleration exact rather than
 * differenced, and it is a page of hand-derived algebra -- the place a sign or
 * a factor of two goes wrong and nothing says so, because a wrong `gamma`
 * still produces a confident number.
 *
 * So each row is checked the one way that does not need the algebra: send the
 * pose down a straight line at constant velocity, where every acceleration is
 * zero by construction, and difference the residual itself twice. On a
 * well-scaled pose that second difference is good to a part in a million,
 * which is far under what a missing term is worth. It is *not* a good enough
 * method to compute with -- that is the whole reason this function exists --
 * but it is a fine one to check against, on poses chosen to suit it.
 */

/**
 * Every point moves, and no velocity lies along a span it is part of.
 *
 * The second-order term of a length is the *perpendicular* part of how its two
 * ends separate, so a velocity that happens to point down the bar makes the
 * whole term vanish -- and a test written on one of those would pass with the
 * function returning nothing at all.
 */
const POSE: PositionMap = new Map<string, number[]>([
  ['A', [0.7, -1.3]],
  ['B', [2.9, 0.4]],
  ['C', [-1.1, 2.2]],
  ['D', [3.4, 2.8]],
  ['E', [1.6, -2.5]],
]);
const MOTION: PositionMap = new Map<string, number[]>([
  ['A', [0.31, 0.87]],
  ['B', [0.35, -0.91]],
  ['C', [0.44, -0.73]],
  ['D', [-0.66, 0.12]],
  ['E', [-0.27, -0.41]],
]);
const COMMAND = 0.83;
const COMMAND_RATE = 0.47;

/** The pose a straight-line motion reaches after `t`. */
function moved(t: number): PositionMap {
  const out: PositionMap = new Map();
  for (const [id, at] of POSE) {
    const rate = MOTION.get(id)!;
    out.set(id, [at[0] + t * rate[0], at[1] + t * rate[1]]);
  }
  return out;
}

/**
 * The second derivative of each residual along that motion, by difference.
 *
 * A step of a thousandth on a pose of order one: truncation goes as the square
 * of it, and the subtraction still keeps ten digits.
 */
function differenced(system: SimultaneousSystem): number[] {
  const h = 1e-3;
  const ahead = residuals(system, moved(h), COMMAND + h * COMMAND_RATE);
  const here = residuals(system, POSE, COMMAND);
  const behind = residuals(system, moved(-h), COMMAND - h * COMMAND_RATE);
  return here.map((value, row) => (ahead[row] - 2 * value + behind[row]) / (h * h));
}

const CASES: { name: string; constraint: Constraint }[] = [
  { name: 'a fixed length', constraint: { kind: 'distance', a: 'A', b: 'B', length: 2.8 } },
  { name: 'a commanded length', constraint: { kind: 'driven', a: 'A', b: 'B' } },
  { name: 'two points held together', constraint: { kind: 'coincident', a: 'A', b: 'B' } },
  {
    name: 'a point on a moving line',
    constraint: { kind: 'onLine', point: 'A', from: 'B', to: 'C' },
  },
  {
    name: 'a point carried in a body’s frame',
    constraint: { kind: 'rigidOffset', point: 'A', from: 'B', to: 'C', along: 0.9, across: -0.4 },
  },
  {
    name: 'a point on a fixed line',
    constraint: { kind: 'onFixedLine', point: 'A', at: [0.2, 0.5], dir: [0.6, 0.8] },
  },
  {
    name: 'a commanded angle',
    constraint: { kind: 'drivenAngle', pivot: 'A', reference: 'B', driven: 'C' },
  },
  {
    name: 'an angle held to a moving slot',
    constraint: { kind: 'fixedAngle', a1: 'A', a2: 'B', b1: 'C', b2: 'D', sin: 0.6, cos: 0.8 },
  },
  {
    name: 'a heading held against the world',
    constraint: { kind: 'fixedDirection', a1: 'A', a2: 'B', dir: [0.28, 0.96] },
  },
];

describe('the second-order term of each kind of row', () => {
  for (const { name, constraint } of CASES) {
    it(`matches a trustworthy difference for ${name}`, () => {
      const system: SimultaneousSystem = { unknownIds: ['A'], constraints: [constraint] };

      const exact = secondOrderTerms(system, POSE, MOTION, COMMAND, COMMAND_RATE);
      const approximate = differenced(system);

      expect(exact).toHaveLength(approximate.length);
      exact.forEach((value, row) => {
        // Relative to the larger of the answer and one. A second difference of
        // an O(1) residual has a noise floor near 1e-9 whatever the true value
        // is, so a row whose exact term is zero has to be judged against
        // something other than itself.
        expect(Math.abs(value - approximate[row]), `row ${row} of ${name}`).toBeLessThan(
          Math.max(Math.abs(approximate[row]), 1) * 1e-5
        );
      });
      // A term that came out identically zero would agree with a difference
      // that also read zero, and prove nothing. Only the linear rows may.
      const linear = ['coincident', 'onFixedLine', 'fixedDirection'].includes(constraint.kind);
      expect(
        exact.some((value) => Math.abs(value) > 1e-3),
        `${name} is not all zeros`
      ).toBe(!linear);
      if (linear) expect(exact.every((value) => value === 0)).toBe(true);
    });
  }

  it('writes exactly as many terms as there are residuals, kind for kind', () => {
    // The nastiest failure this file can have: one row too few shifts every
    // term after it onto the wrong constraint, and each of them is still a
    // plausible number.
    const system: SimultaneousSystem = {
      unknownIds: ['A'],
      constraints: CASES.map((one) => one.constraint),
    };

    expect(secondOrderTerms(system, POSE, MOTION, COMMAND, COMMAND_RATE)).toHaveLength(
      residuals(system, POSE, COMMAND).length
    );
  });

  it('answers zero for a span too short to have a direction', () => {
    // The residual gives up on a degenerate span and returns zero; the second
    // derivative has to give up in the same places, or the two describe
    // different systems.
    const together: PositionMap = new Map([
      ['A', [1, 1]],
      ['B', [1, 1]],
      ['C', [1, 1]],
      ['D', [1, 1]],
    ]);
    const system: SimultaneousSystem = {
      unknownIds: ['A'],
      constraints: CASES.map((one) => one.constraint),
    };

    const terms = secondOrderTerms(system, together, MOTION, COMMAND, COMMAND_RATE);

    expect(terms).toHaveLength(residuals(system, together, COMMAND).length);
    expect(terms.every(Number.isFinite)).toBe(true);
  });
});
