import type { CrossSection } from './cross-section';
import type {
  MemberInternalLoadResult,
  StationReference,
  InternalLoadSegment,
} from './member-results';
import type { MaterialProperties } from './structural-properties';
import { prepareStress, StressContext } from './stress-validation';
import { stressPoint, stressProvenance, yieldCriterion } from './member-stress';
import {
  StressPointSuccess,
  StressExtremaResult,
  StressExtremaSuccess,
  StressExtremum,
  stressFailure,
} from './stress-results';
import { add, composeAffine, derivative, realRoots, scale } from './stress-polynomial';
import { sectionCandidates, maximizeStress, StressField } from './stress-maximizer';

function requirePoint(
  context: StressContext,
  station: StationReference,
  t: number,
  material?: MaterialProperties
): StressPointSuccess {
  const result = stressPoint(
    context,
    { ...station, yM: t * context.properties.extremeFiberM },
    material
  );
  if (result.status !== 'ok') throw new Error(result.message);
  return result;
}
function sectionPoints(
  context: StressContext,
  station: StationReference,
  material?: MaterialProperties
): StressPointSuccess[] {
  const center = requirePoint(context, station, 0, material);
  const { areaM2, extremeFiberM, secondMomentM4 } = context.properties;
  const a = center.internalLoads.axialN / areaM2;
  const b = -center.internalLoads.momentNm * (extremeFiberM / secondMomentM4);
  const d = center.transverseShearStressPa;
  if (![a, b, d].every(Number.isFinite)) throw new Error('Section stress polynomial overflow.');
  return sectionCandidates(a, b, d).map((t) => requirePoint(context, station, t, material));
}
function summarize(
  context: StressContext,
  points: StressPointSuccess[],
  diagnostics: StressExtremaSuccess['diagnostics']
): StressExtremaSuccess {
  const maximum = (
    score: (point: StressPointSuccess) => number,
    signed: (point: StressPointSuccess) => number
  ): StressExtremum => {
    const point = points.reduce((best, point) => (score(point) > score(best) ? point : best));
    return { valuePa: score(point), signedValuePa: signed(point), point };
  };
  const normal = (p: StressPointSuccess) => p.normalStressPa;
  const shear = (p: StressPointSuccess) => p.transverseShearStressPa;
  const vm = (p: StressPointSuccess) => p.vonMisesStressPa;
  const maximumVonMises = maximum(vm, vm);
  const governing = maximumVonMises.point.materialCriterion;
  const upperBound = Math.max(maximumVonMises.valuePa, diagnostics.vonMisesUpperBoundPa);
  return {
    status: 'ok',
    maximumTensileNormal: maximum((p) => Math.max(0, normal(p)), normal),
    maximumCompressiveNormal: maximum((p) => Math.max(0, -normal(p)), normal),
    maximumAbsoluteNormal: maximum((p) => Math.abs(normal(p)), normal),
    maximumAbsoluteShear: maximum((p) => Math.abs(shear(p)), shear),
    maximumVonMises,
    governingYieldCriterion: maximumVonMises.point.materialCriterion,
    conservativeYieldCriterion:
      governing.status === 'available'
        ? yieldCriterion(upperBound, {
            name: 'Governing yield material',
            yieldStrengthPa: governing.yieldStrengthPa,
          })
        : governing,
    provenance: stressProvenance(context),
    diagnostics: {
      ...diagnostics,
      vonMisesUpperBoundPa: Math.max(maximumVonMises.valuePa, diagnostics.vonMisesUpperBoundPa),
      vonMisesGapPa: Math.max(0, diagnostics.vonMisesUpperBoundPa - maximumVonMises.valuePa),
    },
  };
}
export function findSectionStressExtrema(
  loads: MemberInternalLoadResult,
  section: CrossSection | undefined,
  station: StationReference,
  material?: MaterialProperties
): StressExtremaResult {
  const context = prepareStress(loads, section);
  if (context.status !== 'ok') return context;
  const probe = stressPoint(context, { ...station, yM: 0 }, material);
  if (probe.status !== 'ok') return probe;
  try {
    const points = sectionPoints(context, station, material);
    return summarize(context, points, {
      method: 'stationary-roots',
      vonMisesUpperBoundPa: Math.max(...points.map((p) => p.vonMisesStressPa)),
      vonMisesGapPa: 0,
      subdivisions: 0,
    });
  } catch (error) {
    return stressFailure('numerical-failure', (error as Error).message);
  }
}
function fieldOnSegment(
  context: StressContext,
  segment: InternalLoadSegment
): { field: StressField; stressScale: number } {
  const width = segment.endM - segment.startM;
  const { areaM2, extremeFiberM, secondMomentM4 } = context.properties;
  const a = composeAffine(
    segment.axialN.map((c) => c / areaM2),
    0,
    width
  );
  const b = composeAffine(
    segment.momentNm.map((c) => -c * (extremeFiberM / secondMomentM4)),
    0,
    width
  );
  const d = composeAffine(
    segment.shearN.map((c) => -context.shearFactor * (c / areaM2)),
    0,
    width
  );
  const stressScale = Math.max(...[a, b, d].map((p) => p.reduce((sum, c) => sum + Math.abs(c), 0)));
  if (!Number.isFinite(stressScale)) throw new Error('Interval stress polynomial overflow.');
  const normalize = (p: number[]) => p.map((c) => (stressScale === 0 ? 0 : c / stressScale));
  return { field: { a: normalize(a), b: normalize(b), d: normalize(d) }, stressScale };
}

/** One S3 sample, the entire member and section domain; no cycle aggregation or plot grid. */
export function findMemberStressExtrema(
  loads: MemberInternalLoadResult,
  section: CrossSection | undefined,
  material?: MaterialProperties
): StressExtremaResult {
  const context = prepareStress(loads, section);
  if (context.status !== 'ok') return context;
  try {
    const points: StressPointSuccess[] = [];
    for (const event of context.loads.events)
      for (const side of ['left', 'right'] as const)
        points.push(...sectionPoints(context, { xM: event.xM, side }, material));
    let upper = Math.max(...points.map((p) => p.vonMisesStressPa)),
      subdivisions = 0;
    for (const segment of context.loads.segments) {
      const { field, stressScale } = fieldOnSegment(context, segment);
      const at = (u: number): StationReference => {
        const xM = segment.startM + u * (segment.endM - segment.startM);
        // An interior root may round onto the endpoint; preserve this interval's limit.
        return { xM, side: xM === segment.endM ? 'left' : 'right' };
      };
      for (const t of [-1, 1]) {
        const normal = add(field.a, scale(field.b, t));
        for (const u of realRoots(derivative(normal), 0, 1))
          points.push(requirePoint(context, at(u), t, material));
      }
      for (const u of realRoots(derivative(field.d), 0, 1))
        points.push(requirePoint(context, at(u), 0, material));
      const maximum = maximizeStress(field);
      points.push(requirePoint(context, at(maximum.x), maximum.t, material));
      upper = Math.max(upper, Math.sqrt(Math.max(0, maximum.upperSquared)) * stressScale);
      subdivisions += maximum.subdivisions;
    }
    if (!Number.isFinite(upper)) throw new Error('Stress maximum exceeds the numeric range.');
    return summarize(context, points, {
      method: 'stationary-roots-and-bernstein-bounds',
      vonMisesUpperBoundPa: upper,
      vonMisesGapPa: 0,
      subdivisions,
    });
  } catch (error) {
    return stressFailure('numerical-failure', (error as Error).message);
  }
}
