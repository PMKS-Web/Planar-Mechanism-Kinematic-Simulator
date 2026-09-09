// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { constraintRates, SimultaneousSystem } from '../../app/model/mechanism/simultaneous-solver';

/**
 * What the rate solve is allowed to depend on, and what it is not.
 *
 * The space part of the formulation is analytic and exact. The time part is a
 * central difference, and a difference has a step, and a step chosen from the
 * wrong quantity is how an exact method quietly stops being one. Two rules
 * follow, and both were broken:
 *
 *   - a prescribed point no constraint mentions cannot change the answer,
 *     because it appears in no equation. It appeared in the *step*.
 *   - the same mechanism drawn ten thousand times bigger has the same motion,
 *     ten thousand times bigger, and nothing about the arithmetic may notice.
 *
 * The mechanism throughout is the simplest one with a closed form: a point Q
 * on a fixed line, held at a fixed distance from a point A that is being
 * carried up the y axis at a constant speed. With `A = (0, a)`, `Q = (x, 0)`
 * and `|AQ| = L`,
 *
 *     x = sqrt(L^2 - a^2),  xdot = -a adot / x,
 *     xddot = -adot^2 / x - a^2 adot^2 / x^3
 *
 * which at `a = L/2` is `-4 adot^2 / (3 sqrt(3) a)`.
 */

/** The system, its pose and its exact answer, at any size and any speed. */
function carriedPoint(size: number, speed: number) {
  const system: SimultaneousSystem = {
    unknownIds: ['Q'],
    constraints: [
      { kind: 'distance', a: 'A', b: 'Q', length: 2 * size },
      { kind: 'onFixedLine', point: 'Q', at: [0, 0], dir: [1, 0] },
    ],
  };
  const positions = new Map<string, number[]>([
    ['A', [0, size]],
    ['Q', [Math.sqrt(3) * size, 0]],
  ]);
  return {
    system,
    positions,
    boundary: {
      velocity: new Map<string, number[]>([['A', [0, speed]]]),
      acceleration: new Map<string, number[]>([['A', [0, 0]]]),
    },
    velocity: (-speed / Math.sqrt(3)) as number,
    acceleration: (-4 * speed * speed) / (3 * Math.sqrt(3) * size),
  };
}

describe('a prescribed point no constraint mentions', () => {
  // Every one of these is far outside what a drawing produces. That is the
  // point: an unreferenced witness must be *exactly* absent from the
  // arithmetic, and an absence is only visible when the thing absent is
  // enormous. Left in the step calculation these read -0.7698, -0.7693 and
  // -0.3701 -- the last a 52% error from a point in no equation.
  for (const speed of [0, 1, 1e6, 1e8, 1e10, 1e12]) {
    it(`changes nothing when it is moving at ${speed}`, () => {
      const { system, positions, boundary, acceleration } = carriedPoint(1, 1);
      const withWitness = {
        velocity: new Map(boundary.velocity).set('W', [0, speed]),
        acceleration: new Map(boundary.acceleration).set('W', [-speed, 0]),
      };
      positions.set('W', [speed, 0]);

      const alone = constraintRates(system, positions, 0, 0, boundary);
      const rates = constraintRates(system, positions, 0, 0, withWitness);

      expect(rates).toBeDefined();
      // Identical, not merely close: the witness is in no equation, so the
      // arithmetic it goes through has to be the same arithmetic.
      expect(rates!.velocity.get('Q')).toEqual(alone!.velocity.get('Q'));
      expect(rates!.acceleration.get('Q')).toEqual(alone!.acceleration.get('Q'));
      expect(rates!.acceleration.get('Q')![0] / acceleration).toBeCloseTo(1, 6);
    });
  }
});

describe('the same mechanism at every size and every speed', () => {
  // The differencing step is picked from the rates, so a drawing in model
  // units and the same drawing in user units go through different arithmetic
  // to reach answers that must agree once scaled. Four decades of size against
  // four of speed is enough to show a step tied to the wrong quantity.
  for (const size of [1e-2, 1, 200, 1e4]) {
    for (const speed of [1e-3, 1, 1e3]) {
      it(`solves size ${size} at speed ${speed}`, () => {
        const { system, positions, boundary, velocity, acceleration } = carriedPoint(size, speed);

        const rates = constraintRates(system, positions, 0, 0, boundary);

        expect(rates).toBeDefined();
        const solvedVelocity = rates!.velocity.get('Q')!;
        const solvedAcceleration = rates!.acceleration.get('Q')!;
        // Relative, because the answers span fourteen decades between these
        // cases and an absolute bound would be a different test at each size.
        expect(Math.abs(solvedVelocity[0] - velocity) / Math.abs(velocity)).toBeLessThan(1e-9);
        expect(Math.abs(solvedVelocity[1])).toBeLessThan(Math.abs(velocity) * 1e-9);
        expect(
          Math.abs(solvedAcceleration[0] - acceleration) / Math.abs(acceleration)
        ).toBeLessThan(1e-5);
      });
    }
  }
});

/**
 * The same rod, with its guide written as a line between two prescribed points
 * rather than as a fixed one.
 *
 * `Q` is held on the line through `B` and `C`. Where those two points *are*,
 * and how fast they slide along their own line, changes nothing about where
 * `Q` goes -- the line is the same line. So both are exact tests of the one
 * thing a differenced derivative cannot promise: that a number far away, or
 * moving fast, stays out of a local answer.
 */
function carriedOnALine(guideLength: number, guideSpeed: number) {
  const system: SimultaneousSystem = {
    unknownIds: ['Q'],
    constraints: [
      { kind: 'distance', a: 'A', b: 'Q', length: 2 },
      { kind: 'onLine', point: 'Q', from: 'B', to: 'C' },
    ],
  };
  return {
    system,
    positions: new Map<string, number[]>([
      ['A', [0, 1]],
      ['Q', [Math.sqrt(3), 0]],
      ['B', [0, 0]],
      ['C', [guideLength, 0]],
    ]),
    boundary: {
      velocity: new Map<string, number[]>([
        ['A', [0, 1]],
        ['B', [0, 0]],
        // Along the guide's own direction, so the line does not move.
        ['C', [guideSpeed, 0]],
      ]),
      acceleration: new Map<string, number[]>([
        ['A', [0, 0]],
        ['B', [0, 0]],
        ['C', [0, 0]],
      ]),
    },
    acceleration: -4 / (3 * Math.sqrt(3)),
  };
}

describe('a guide whose far end is a long way off', () => {
  // The endpoint's distance says nothing about the local motion, and a step
  // scaled to the extent of the points a row reads believed otherwise: at a
  // guide length of 100,000 the step reached ten, and the answer came back
  // -0.6667 against an exact -0.7698 -- wrong in its first digit.
  for (const guideLength of [10, 1e3, 1e4, 1e5, 1e8]) {
    it(`leaves a two-unit rod alone at length ${guideLength}`, () => {
      const { system, positions, boundary, acceleration } = carriedOnALine(guideLength, 0);

      const rates = constraintRates(system, positions, 0, 0, boundary);

      expect(rates).toBeDefined();
      expect(rates!.acceleration.get('Q')![0] / acceleration).toBeCloseTo(1, 9);
    });
  }
});

describe('a boundary point moving far faster than the answer', () => {
  // A real ratio, which the test this replaces did not have: its unknown sped
  // up with the boundary, so the two never differed. Here `C` slides along the
  // very line it defines, so it can be given any speed at all while `Q` keeps
  // the one the rod gives it.
  for (const guideSpeed of [0, 1, 1e6, 1e9]) {
    it(`is not felt at ${guideSpeed} times nothing`, () => {
      const { system, positions, boundary, acceleration } = carriedOnALine(1000, guideSpeed);

      const rates = constraintRates(system, positions, 0, 0, boundary);

      expect(rates).toBeDefined();
      expect(rates!.velocity.get('Q')![0]).toBeCloseTo(-1 / Math.sqrt(3), 9);
      expect(rates!.acceleration.get('Q')![0] / acceleration).toBeCloseTo(1, 9);
    });
  }
});

describe('a point sitting on top of an accelerating prescribed one', () => {
  it('is given that acceleration, and not the zero it would have without it', () => {
    // The smallest statement of the `J_b bddot` term there is. `Q` is
    // coincident with `A` and nothing else; whatever `A` is doing, `Q` is
    // doing. Drop the term and this reads zero, which is why it is written
    // here rather than only inside a mechanism where the same term happens to
    // be orthogonal to every row the crank touches.
    const system: SimultaneousSystem = {
      unknownIds: ['Q'],
      constraints: [{ kind: 'coincident', a: 'A', b: 'Q' }],
    };
    const positions = new Map<string, number[]>([
      ['A', [3, 4]],
      ['Q', [3, 4]],
    ]);
    const boundary = {
      velocity: new Map<string, number[]>([['A', [5, -2]]]),
      acceleration: new Map<string, number[]>([['A', [-7, 11]]]),
    };

    const rates = constraintRates(system, positions, 0, 0, boundary);

    expect(rates).toBeDefined();
    expect(rates!.velocity.get('Q')![0]).toBeCloseTo(5, 9);
    expect(rates!.velocity.get('Q')![1]).toBeCloseTo(-2, 9);
    expect(rates!.acceleration.get('Q')![0]).toBeCloseTo(-7, 6);
    expect(rates!.acceleration.get('Q')![1]).toBeCloseTo(11, 6);
  });
});
