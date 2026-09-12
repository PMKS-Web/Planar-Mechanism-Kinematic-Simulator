import {
  memberAB,
  memberConfiguration,
  memberSuccess,
  verifyMemberCuts,
} from './member-verification';
import { analyzeStatic } from '../../app/model/structural/static-force-solver';
import { recoverStaticMemberLoads } from '../../app/model/structural/member-load-recovery';
import type { StructuralConfiguration } from '../../app/model/structural/configuration';
import type { LoadCase } from '../../app/model/structural/loads';
import type { CrossSection } from '../../app/model/structural/cross-section';
import type {
  MemberStressPointResult,
  StressExtremaResult,
} from '../../app/model/structural/stress-results';

export const stressRectangle: CrossSection = { kind: 'rectangle', widthM: 0.01, heightM: 0.02 };
export const stressCircle: CrossSection = { kind: 'circle', diameterM: 0.02 };
/** Reuse the gallery's held 2 m crank; prescribed N,V,M are attained at x=1 m. */
export function stressDiagram(
  N = 0,
  V = 0,
  M = 0,
  configuration: StructuralConfiguration = memberConfiguration()
) {
  const load: LoadCase = {
    name: 'S4 held member',
    loads: [
      {
        kind: 'point-force',
        linkId: 'AB',
        at: { frame: 'link', positionM: { x: 2, y: 0 } },
        directionFrame: 'link',
        forceN: { x: N, y: -V },
      },
      {
        kind: 'moment',
        linkId: 'AB',
        at: { frame: 'link', positionM: { x: 2, y: 0 } },
        momentNm: M + V,
      },
    ],
  };
  const equilibrium = analyzeStatic(configuration, load);
  const result = memberSuccess(
    recoverStaticMemberLoads(configuration, memberAB, load, equilibrium)
  );
  verifyMemberCuts(configuration, load, equilibrium, result);
  return result;
}
export function stressSuccess(result: MemberStressPointResult) {
  if (result.status !== 'ok') throw new Error(result.status + ': ' + result.message);
  return result;
}
export function extremaSuccess(result: StressExtremaResult) {
  if (result.status !== 'ok') throw new Error(result.status + ': ' + result.message);
  return result;
}
/** Independent quadrature, with no production area/shape factors in the integrand. */
export function integrateSection(section: CrossSection, stress: (y: number) => number): number {
  const circle = section.kind === 'circle';
  const lower = circle ? -Math.PI / 2 : -section.heightM / 2;
  const upper = -lower,
    count = 2048,
    step = (upper - lower) / count;
  const integrand = (s: number) => {
    if (section.kind === 'rectangle') return stress(s) * section.widthM;
    const radius = section.diameterM / 2;
    return stress(radius * Math.sin(s)) * 2 * radius ** 2 * Math.cos(s) ** 2;
  };
  let sum = integrand(lower) + integrand(upper);
  for (let i = 1; i < count; i++) sum += (i % 2 ? 4 : 2) * integrand(lower + i * step);
  return (sum * step) / 3;
}
