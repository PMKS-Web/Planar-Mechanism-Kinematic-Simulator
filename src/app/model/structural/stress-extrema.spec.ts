import {
  stressRectangle as rectangle,
  stressCircle as circle,
  stressDiagram,
  stressSuccess,
  extremaSuccess,
} from '../../../test-utils/verification/stress-verification';
import { findSectionStressExtrema, findMemberStressExtrema } from './stress-extrema';
import { evaluateMemberStress } from './member-stress';
import { maximizeStress, squaredStress } from './stress-maximizer';
import { realRoots, multiply } from './stress-polynomial';
import {
  memberAB,
  memberConfiguration,
  memberSuccess,
  uniformAB,
  verifyMemberCuts,
} from '../../../test-utils/verification/member-verification';
import { structuralUniformMemberFixture } from '../../../test-utils/verification/structural-fixtures';
import { analyzeStatic } from './static-force-solver';
import { recoverStaticMemberLoads, recoverDynamicMemberLoads } from './member-load-recovery';
import { analyzeDynamic } from './dynamic-force-solver';
import type { CrossSection } from './cross-section';

const station = { xM: 1, side: 'right' as const };
describe('section and member stress extrema', () => {
  it('bounds independently probed polynomial fields with multiple stationary candidates', () => {
    let seed = 42;
    const coefficient = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 31 - 1;
    };
    for (let i = 0; i < 12; i++) {
      const field = {
        a: Array.from({ length: 3 }, coefficient),
        b: Array.from({ length: 4 }, coefficient),
        d: Array.from({ length: 3 }, coefficient),
      };
      const result = maximizeStress(field);
      expect(result.squared).toBeCloseTo(squaredStress(field, result.x, result.t), 12);
      expect(result.upperSquared - result.squared).toBeLessThan(1e-7 * Math.max(1, result.squared));
      // Sampling is an independent regression oracle, never the production maximum algorithm.
      for (let x = 0; x <= 40; x++)
        for (let y = 0; y <= 40; y++)
          expect(squaredStress(field, x / 40, y / 20 - 1)).toBeLessThanOrEqual(
            result.upperSquared + 1e-12
          );
    }
  });
  for (const section of [rectangle, circle])
    it('finds shear-dominated von Mises at the section center for ' + section.kind, () => {
      const result = extremaSuccess(
        findSectionStressExtrema(stressDiagram(0, 800, 0), section, station)
      );
      const area = section.kind === 'rectangle' ? 0.0002 : Math.PI * 0.01 ** 2;
      const factor = section.kind === 'rectangle' ? 1.5 : 4 / 3;
      expect(result.maximumVonMises.valuePa).toBeCloseTo((Math.sqrt(3) * factor * 800) / area, 6);
      expect(result.maximumVonMises.point.location.yM).toBeCloseTo(0, 10);
      expect(result.maximumAbsoluteShear.signedValuePa).toBeCloseTo((-factor * 800) / area, 6);
    });
  it('finds a combined-loading section maximum at y=c/4, neither centroid nor outer fiber', () => {
    // In MPa: sigma=2.6875+0.5t, tau=1-t². Derivative vanishes at t=1/4.
    const result = extremaSuccess(
      findSectionStressExtrema(stressDiagram(537.5, -400 / 3, -1 / 3), rectangle, station)
    );
    expect(result.maximumVonMises.point.location.yM).toBeCloseTo(0.0025, 9);
    expect(result.maximumVonMises.valuePa).toBeCloseTo(
      Math.sqrt(2.8125 ** 2 + 3 * 0.9375 ** 2) * 1e6,
      5
    );
    expect(result.maximumVonMises.valuePa).toBeGreaterThan(3.1875e6);
  });
  it('reports signed tension/compression and the material criterion at the governing point', () => {
    const result = extremaSuccess(
      findSectionStressExtrema(stressDiagram(2400, 0, 10), rectangle, station, {
        name: 'Example',
        yieldStrengthPa: 270e6,
      })
    );
    expect(result.maximumTensileNormal.valuePa).toBeCloseTo(27e6, 6);
    expect(result.maximumTensileNormal.point.location.yM).toBe(-0.01);
    expect(result.maximumCompressiveNormal.signedValuePa).toBeCloseTo(-3e6, 6);
    expect(result.maximumAbsoluteNormal.valuePa).toBeCloseTo(27e6, 6);
    expect(result.governingYieldCriterion).toMatchObject({
      status: 'available',
      factorOfSafety: 10,
      utilization: 0.1,
    });
  });
  for (const section of [rectangle, circle])
    it('finds the interior x=2 gravity bending maximum for ' + section.kind, () => {
      const c = memberConfiguration(structuralUniformMemberFixture());
      const load = { name: 'Uniform self-weight', loads: [], gravityMPerS2: { x: 0, y: -10 } };
      const eq = analyzeStatic(c, load);
      const diagram = memberSuccess(
        recoverStaticMemberLoads(c, memberAB, load, eq, {
          gravityModel: 'uniform-line',
          massDistribution: uniformAB,
        })
      );
      verifyMemberCuts(c, load, eq, diagram);
      const result = extremaSuccess(
        findMemberStressExtrema(diagram, section, { name: 'Steel', yieldStrengthPa: 250e6 })
      );
      const inertia =
        section.kind === 'rectangle' ? (0.01 * 0.02 ** 3) / 12 : (Math.PI * 0.02 ** 4) / 64;
      expect(result.maximumAbsoluteNormal.valuePa).toBeCloseTo((20 * 0.01) / inertia, 5);
      expect(result.maximumVonMises.point.location.xM).toBeCloseTo(2, 7);
      expect(Math.abs(result.maximumVonMises.point.location.yM)).toBeCloseTo(0.01, 10);
      expect(result.provenance.gravityModel).toBe('uniform-line');
      expect(result.diagnostics.vonMisesGapPa / result.maximumVonMises.valuePa).toBeLessThan(1e-7);
    });
  it('preserves the governing side of an endpoint couple discontinuity', () => {
    const result = extremaSuccess(findMemberStressExtrema(stressDiagram(2400, 800, 10), rectangle));
    expect(result.maximumVonMises.point.location).toMatchObject({ xM: 2, side: 'left', yM: -0.01 });
    expect(result.maximumVonMises.valuePa).toBeCloseTo(
      12e6 + (810 * 0.01) / ((0.01 * 0.02 ** 3) / 12),
      4
    );
  });
  it('bounds a separable two-variable maximum at x=0.37, y/c=0.25, away from all fixed candidates', () => {
    // p=1-(x-.37)^2 <=1, with equality only at .37.
    const p = [1 - 0.37 ** 2, 0.74, -1];
    const result = maximizeStress({ a: p.map((c) => 2.6875 * c), b: p.map((c) => 0.5 * c), d: p });
    const expected = 2.8125 ** 2 + 3 * 0.9375 ** 2;
    expect(result.x).toBeCloseTo(0.37, 7);
    expect(result.t).toBeCloseTo(0.25, 7);
    expect(result.squared).toBeCloseTo(expected, 10);
    expect(result.upperSquared).toBeGreaterThanOrEqual(expected - 1e-12);
    expect(result.upperSquared - result.squared).toBeLessThan(1e-8);
    expect(result.subdivisions).toBeGreaterThan(0);
  });
  it('retains repeated derivative roots and ignores complex or out-of-domain roots', () => {
    const polynomial = multiply(multiply([-0.213, 1], [-0.213, 1]), multiply([0.4, 1], [1, 0, 1]));
    const roots = realRoots(polynomial, 0, 1);
    expect(roots.some((x) => Math.abs(x - 0.213) < 1e-7)).toBe(true);
    expect(roots.every((x) => Number.isFinite(x) && x >= 0 && x <= 1)).toBe(true);
    expect(realRoots([1, 0, 1], -1, 1)).toEqual([]);
  });
  it('finds dynamic centripetal axial maximum inside the member and preserves its mass provenance', () => {
    const c = memberConfiguration(),
      load = { name: 'Spin about CoM', loads: [] };
    const motion = {
      linkId: 'AB',
      angularVelocityRadPerS: 2,
      angularAccelerationRadPerS2: 0,
      centerOfMassAccelerationMPerS2: { x: 0, y: 0 },
    };
    const eq = analyzeDynamic(c, [motion], load);
    const diagram = memberSuccess(
      recoverDynamicMemberLoads(c, memberAB, load, eq, motion, { massDistribution: uniformAB })
    );
    verifyMemberCuts(c, load, eq, diagram, motion);
    const result = extremaSuccess(findMemberStressExtrema(diagram, rectangle));
    expect(result.maximumVonMises.point.location.xM).toBeCloseTo(1, 7);
    expect(result.maximumVonMises.valuePa).toBeCloseTo(2 / 0.0002, 6);
    expect(result.provenance).toMatchObject({
      mode: 'dynamic',
      massModel: 'uniform-line',
      motionSource: 'unspecified',
    });
  });
  it('is scale invariant over many stress orders and returns finite zero-demand extrema', () => {
    for (const factor of [0, 1e-9, 1, 1e9]) {
      const loads = stressDiagram(100 * factor, 0, 2 * factor);
      const result = extremaSuccess(findMemberStressExtrema(loads, rectangle));
      const expected = factor * (100 / 0.0002 + (2 * 0.01) / ((0.01 * 0.02 ** 3) / 12));
      expect(Math.abs(result.maximumVonMises.valuePa - expected)).toBeLessThan(
        Math.max(1e-8, expected * 1e-10)
      );
      expect(Number.isFinite(result.diagnostics.vonMisesUpperBoundPa)).toBe(true);
    }
  });
  it('uses the public point evaluator for reported extrema and refuses unsupported input', () => {
    const loads = stressDiagram(2400, 800, 10);
    const result = extremaSuccess(findMemberStressExtrema(loads, rectangle));
    for (const e of [
      result.maximumAbsoluteNormal,
      result.maximumAbsoluteShear,
      result.maximumVonMises,
    ])
      expect(e.point).toEqual(
        stressSuccess(evaluateMemberStress(loads, rectangle, e.point.location))
      );
    expect(findMemberStressExtrema(loads, { kind: 'tube' } as unknown as CrossSection).status).toBe(
      'unsupported-cross-section'
    );
    expect(findSectionStressExtrema(loads, rectangle, { xM: Infinity, side: 'left' }).status).toBe(
      'invalid-station'
    );
  });
});
