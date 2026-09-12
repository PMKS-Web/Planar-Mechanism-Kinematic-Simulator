import type { CrossSection, SectionProperties } from './cross-section';
import type { InternalLoads, StationReference } from './member-results';

export type StressStatus =
  | 'missing-cross-section'
  | 'unsupported-cross-section'
  | 'invalid-section-coordinate'
  | 'invalid-section-properties'
  | 'invalid-station'
  | 'invalid-member-load-result'
  | 'upstream-analysis-failed'
  | 'numerical-failure';
export interface StressFailure {
  readonly status: StressStatus;
  readonly message: string;
}
export function stressFailure(status: StressStatus, message: string): StressFailure {
  return { status, message };
}
export interface StressLocation extends StationReference {
  readonly yM: number;
}
export interface StressProvenance {
  readonly memberId: string;
  readonly bodyId: string;
  readonly mode: 'static' | 'dynamic';
  readonly gravityModel: 'none' | 'lumped-at-com' | 'uniform-line';
  readonly massModel: 'none' | 'uniform-line';
  readonly inertiaModel: 'none' | 'distributed-uniform-line';
  readonly motionSource: 'not-applicable' | 'pmks-analytical' | 'prescribed' | 'unspecified';
  readonly stressModel: 'nominal-elementary-beam-plane-stress';
  readonly crossSection: CrossSection;
  readonly sectionProperties: SectionProperties;
}
export type YieldCriterion =
  | {
      readonly status: 'unavailable';
      readonly reason:
        'missing-yield-strength' | 'invalid-material-properties' | 'numerical-failure';
      readonly message: string;
    }
  | {
      readonly status: 'available';
      readonly kind: 'ductile-von-mises-yield';
      readonly yieldStrengthPa: number;
      readonly utilization: number;
      readonly factorOfSafety: number | null;
      readonly factorOfSafetyState: 'finite' | 'unbounded-zero-demand' | 'exceeds-numeric-range';
    };
export interface StressPointSuccess {
  readonly status: 'ok';
  readonly location: StressLocation;
  readonly internalLoads: InternalLoads;
  readonly axialNormalStressPa: number;
  readonly bendingNormalStressPa: number;
  readonly normalStressPa: number;
  /** +n traction on the A-side exposed +e face; integrates to -V. */
  readonly transverseShearStressPa: number;
  readonly vonMisesStressPa: number;
  /** Two in-plane principal stresses, descending; the third principal stress is zero. */
  readonly principalStress1Pa: number;
  readonly principalStress2Pa: number;
  readonly materialCriterion: YieldCriterion;
  readonly provenance: StressProvenance;
}
export type MemberStressPointResult = StressPointSuccess | StressFailure;
export interface StressExtremum {
  readonly valuePa: number;
  readonly signedValuePa: number;
  /** One governing witness; tied/constant fields may have other equally governing points. */
  readonly point: StressPointSuccess;
}
export interface StressExtremaSuccess {
  readonly status: 'ok';
  readonly maximumTensileNormal: StressExtremum;
  /** Nonnegative compressive demand, with signedValuePa retaining the negative stress. */
  readonly maximumCompressiveNormal: StressExtremum;
  readonly maximumAbsoluteNormal: StressExtremum;
  readonly maximumAbsoluteShear: StressExtremum;
  readonly maximumVonMises: StressExtremum;
  /** Evaluated at maximum von Mises: maximum utilization and minimum FoS. */
  readonly governingYieldCriterion: YieldCriterion;
  /** Uses the numerical upper bound, avoiding an optimistic FoS from the attained witness. */
  readonly conservativeYieldCriterion: YieldCriterion;
  readonly provenance: StressProvenance;
  readonly diagnostics: {
    readonly method: 'stationary-roots' | 'stationary-roots-and-bernstein-bounds';
    readonly vonMisesUpperBoundPa: number;
    readonly vonMisesGapPa: number;
    readonly subdivisions: number;
  };
}
export type StressExtremaResult = StressExtremaSuccess | StressFailure;
