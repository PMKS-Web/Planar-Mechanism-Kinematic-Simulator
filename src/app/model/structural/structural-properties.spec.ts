import { sectionProperties } from './cross-section';
import { validateStructuralProperties } from './structural-properties';
import { validateLoadCase } from './loads';

describe('structural material and section data', () => {
  it('derives rectangle area, centroidal bending inertia, and section modulus', () => {
    const p = sectionProperties({ kind: 'rectangle', widthM: 0.02, heightM: 0.04 });
    expect(p.areaM2).toBeCloseTo(0.0008, 12);
    expect(p.secondMomentM4).toBeCloseTo(1.0666666666666667e-7, 14);
    expect(p.sectionModulusM3).toBeCloseTo(5.333333333333334e-6, 13);
    expect(p.extremeFiberM).toBe(0.02);
  });

  it('derives circle properties without treating diameter as radius', () => {
    const p = sectionProperties({ kind: 'circle', diameterM: 0.1 });
    expect(p.areaM2).toBeCloseTo(Math.PI / 400, 12);
    expect(p.secondMomentM4).toBeCloseTo(Math.PI / 640000, 12);
    expect(p.sectionModulusM3).toBeCloseTo(Math.PI / 32000, 12);
  });

  for (const dimension of [0, -1, NaN, Infinity, 1e100, 1e-100]) {
    it('refuses nonphysical or unrepresentable dimensions: ' + dimension, () => {
      expect(() => sectionProperties({ kind: 'circle', diameterM: dimension })).toThrow();
    });
  }

  it('permits missing optional properties and auxetic isotropic materials', () => {
    expect(() => validateStructuralProperties({})).not.toThrow();
    expect(() =>
      validateStructuralProperties({
        material: { name: 'Auxetic sample', poissonRatio: -0.2 },
      })
    ).not.toThrow();
  });

  it('refuses impossible material data instead of supplying defaults', () => {
    for (const material of [
      { name: '' },
      { name: 'Steel', elasticModulusPa: 0 },
      { name: 'Steel', densityKgM3: NaN },
      { name: 'Steel', poissonRatio: 0.5 },
      { name: 'Steel', poissonRatio: -1 },
      { name: 'Steel', yieldStrengthPa: 400, ultimateStrengthPa: 300 },
    ])
      expect(() => validateStructuralProperties({ material })).toThrow();
  });

  it('refuses unframed, nonfinite and unsupported loads', () => {
    expect(() =>
      validateLoadCase({
        name: 'Invalid',
        loads: [{ kind: 'moment', linkId: 'AB', momentNm: Infinity }],
      })
    ).toThrow();
    expect(() =>
      validateLoadCase({
        name: 'Invalid',
        loads: [],
        gravityMPerS2: { x: 0, y: NaN },
      })
    ).toThrow();
  });
});
