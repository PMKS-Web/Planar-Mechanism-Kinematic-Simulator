import { frictionless, frictionPropertyError, hasFriction } from './joint-friction';

describe('friction property validation', () => {
  it('defaults to frictionless without requiring a bearing radius', () => {
    expect(hasFriction(frictionless())).toBe(false);
    expect(frictionPropertyError(frictionless(), true)).toBeUndefined();
  });
  it('rejects invalid coefficients and pin radii without clamping', () => {
    for (const value of [-1, NaN, Infinity]) {
      expect(
        frictionPropertyError({ staticCoefficient: value, kineticCoefficient: 0, radius: 1 }, true)
      ).toBeDefined();
      expect(
        frictionPropertyError({ staticCoefficient: 1, kineticCoefficient: value, radius: 1 }, true)
      ).toBeDefined();
      expect(
        frictionPropertyError(
          { staticCoefficient: 1, kineticCoefficient: 0.1, radius: value },
          true
        )
      ).toBeDefined();
    }
    expect(
      frictionPropertyError({ staticCoefficient: 0.1, kineticCoefficient: 0.2, radius: 1 }, true)
    ).toContain('at least');
    expect(
      frictionPropertyError({ staticCoefficient: 0.3, kineticCoefficient: 0.2, radius: 0 }, true)
    ).toContain('positive');
    expect(
      frictionPropertyError({ staticCoefficient: 0.3, kineticCoefficient: 0.2, radius: 0 }, false)
    ).toBeUndefined();
  });
});
