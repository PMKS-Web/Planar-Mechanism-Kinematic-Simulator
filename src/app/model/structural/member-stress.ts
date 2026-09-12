import type { CrossSection } from './cross-section';
import type { MemberInternalLoadResult, StationReference } from './member-results';
import { evaluateMemberLoads } from './member-diagram';
import { MaterialProperties, validateStructuralProperties } from './structural-properties';
import { prepareStress, StressContext } from './stress-validation';
import {
  MemberStressPointResult,
  StressLocation,
  StressPointSuccess,
  StressProvenance,
  YieldCriterion,
  stressFailure,
  StressFailure,
} from './stress-results';

export function yieldCriterion(vonMisesPa: number, material?: MaterialProperties): YieldCriterion {
  try {
    validateStructuralProperties({ material });
  } catch (error) {
    return {
      status: 'unavailable',
      reason: 'invalid-material-properties',
      message: (error as Error).message,
    };
  }
  const strength = material?.yieldStrengthPa;
  if (strength === undefined)
    return {
      status: 'unavailable',
      reason: 'missing-yield-strength',
      message: 'Stress is valid; a yield strength is needed for a ductile yield check.',
    };
  const utilization = vonMisesPa / strength;
  if (!Number.isFinite(utilization))
    return {
      status: 'unavailable',
      reason: 'numerical-failure',
      message: 'The yield utilization exceeds the numeric range.',
    };
  const factor = strength / vonMisesPa;
  return {
    status: 'available',
    kind: 'ductile-von-mises-yield',
    yieldStrengthPa: strength,
    utilization,
    factorOfSafety: Number.isFinite(factor) ? factor : null,
    factorOfSafetyState:
      vonMisesPa === 0
        ? 'unbounded-zero-demand'
        : Number.isFinite(factor)
          ? 'finite'
          : 'exceeds-numeric-range',
  };
}
export function stressProvenance(context: StressContext): StressProvenance {
  const { loads, section, properties } = context;
  return {
    memberId: loads.member.id,
    bodyId: loads.member.bodyId,
    mode: loads.mode,
    gravityModel: loads.gravityModel,
    massModel: loads.massModel,
    inertiaModel: loads.mode === 'dynamic' ? 'distributed-uniform-line' : 'none',
    motionSource:
      loads.mode === 'dynamic' ? (loads.motionSource ?? 'unspecified') : 'not-applicable',
    stressModel: 'nominal-elementary-beam-plane-stress',
    crossSection: { ...section },
    sectionProperties: { ...properties },
  };
}
export function evaluateMemberStress(
  loads: MemberInternalLoadResult,
  section: CrossSection | undefined,
  location: StressLocation,
  material?: MaterialProperties
): MemberStressPointResult {
  const context = prepareStress(loads, section);
  return context.status === 'ok' ? stressPoint(context, location, material) : context;
}

/** Shared by point/profile/extrema APIs after one validation of the immutable input. */
export function stressPoint(
  context: StressContext,
  location: StressLocation,
  material?: MaterialProperties
): MemberStressPointResult {
  if (
    !location ||
    !Number.isFinite(location.yM) ||
    Math.abs(location.yM) > context.properties.extremeFiberM
  )
    return stressFailure(
      'invalid-section-coordinate',
      'Choose a finite y within the physical section; coordinates are never clamped.'
    );
  const evaluated = evaluateMemberLoads(context.loads, location);
  if (evaluated.status !== 'ok')
    return stressFailure(
      evaluated.status === 'invalid-station' ? 'invalid-station' : 'numerical-failure',
      evaluated.message
    );
  const { areaM2: area, secondMomentM4: inertia, extremeFiberM: c } = context.properties;
  const internal = evaluated.loads,
    t = location.yM / c;
  const axial = internal.axialN / area;
  const bending = -internal.momentNm * (location.yM / inertia);
  const normal = axial + bending;
  const shear = -(internal.shearN / area) * context.shearFactor * (1 - t * t);
  const vonMises = Math.hypot(normal, Math.sqrt(3) * shear);
  const radius = Math.hypot(normal / 2, shear);
  // Recover the smaller principal through the determinant to avoid cancellation.
  const large = normal / 2 + (normal >= 0 ? radius : -radius);
  const small = large === 0 ? 0 : -(shear / large) * shear;
  const principal1 = Math.max(large, small),
    principal2 = Math.min(large, small);
  if (![axial, bending, normal, shear, vonMises, principal1, principal2].every(Number.isFinite))
    return stressFailure('numerical-failure', 'Stress exceeds the finite numeric range.');
  return {
    status: 'ok',
    location: { ...location },
    internalLoads: internal,
    // Canonical +0 survives JSON round trips without changing any nonzero stress.
    axialNormalStressPa: axial + 0,
    bendingNormalStressPa: bending + 0,
    normalStressPa: normal + 0,
    transverseShearStressPa: shear + 0,
    vonMisesStressPa: vonMises,
    principalStress1Pa: principal1 + 0,
    principalStress2Pa: principal2 + 0,
    materialCriterion: yieldCriterion(vonMises, material),
    provenance: stressProvenance(context),
  };
}
export function evaluateStressProfileAtStation(
  loads: MemberInternalLoadResult,
  section: CrossSection | undefined,
  station: StationReference,
  yCoordinatesM?: readonly number[],
  material?: MaterialProperties
):
  | { status: 'ok'; points: readonly StressPointSuccess[]; provenance: StressProvenance }
  | StressFailure {
  const context = prepareStress(loads, section);
  if (context.status !== 'ok') return context;
  const c = context.properties.extremeFiberM;
  const coordinates = yCoordinatesM ?? [-c, 0, c];
  if (!Array.isArray(coordinates) || !coordinates.length)
    return stressFailure('invalid-section-coordinate', 'Supply at least one section coordinate.');
  const points: StressPointSuccess[] = [];
  for (const yM of coordinates) {
    const point = stressPoint(context, { ...station, yM }, material);
    if (point.status !== 'ok') return point;
    points.push(point);
  }
  return { status: 'ok', points, provenance: stressProvenance(context) };
}
