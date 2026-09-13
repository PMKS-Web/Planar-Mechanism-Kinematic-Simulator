import type { StructuralConfiguration } from './configuration';
import type { CrossSection } from './cross-section';
import type { LoadCase } from './loads';
import type { StructuralMember } from './member';
import type { BodySectionMotionState } from './member-mass';
import type { MemberRecoveryOptions } from './member-load-recovery';
import type { MaterialProperties } from './structural-properties';
import type { StressExtremaSuccess, StressExtremum, StressPointSuccess } from './stress-results';

export type DriveCoordinate =
  | {
      readonly kind: 'angle';
      readonly jointId: string;
      readonly canonicalRad: number;
      readonly unwrappedRad: number;
      readonly referenceBodyId: string;
      readonly drivenBodyId: string;
    }
  | {
      readonly kind: 'length';
      readonly jointId: string;
      readonly displacementM: number;
      readonly reference: 'initial-position-along-slot';
    }
  | { readonly kind: 'unavailable'; readonly jointId?: string; readonly reason: string };

export interface CycleSampleMetadata {
  readonly sampleIndex: number;
  /** Null for an invalid/missing sample; never invent time from its index. */
  readonly timeSeconds: number | null;
  readonly drive: DriveCoordinate;
}
export interface CycleSequenceMetadata {
  readonly closure: 'closed' | 'open' | 'unknown';
  readonly duplicateEndpointPose: boolean | null;
  readonly reverses: boolean | null;
  readonly order: 'forward' | 'reverse' | 'explicit';
  readonly coversAllSolvedSamples: boolean;
  readonly notes: readonly string[];
}
export interface FixedMaterialPoint {
  readonly id: string;
  readonly xi: number;
  readonly eta: number;
  readonly side: 'left' | 'right';
}
export interface CycleAnalysisOptions {
  readonly member: StructuralMember;
  readonly mode: 'static' | 'dynamic';
  readonly section: CrossSection;
  readonly material?: MaterialProperties;
  readonly recovery: MemberRecoveryOptions;
  readonly materialPoints?: readonly FixedMaterialPoint[];
}
export interface CycleFailure {
  readonly status: 'failed';
  readonly stage: 'setup' | 'snapshot' | 'equilibrium' | 'member-loads' | 'stress';
  readonly code: string;
  readonly message: string;
  readonly upstreamDiagnostics?: unknown;
}
export type CycleSampleInput =
  | {
      readonly status: 'ok';
      readonly configuration: StructuralConfiguration;
      readonly loadCase: LoadCase;
      readonly motion?: readonly BodySectionMotionState[];
    }
  | CycleFailure;

/** A pure, lazy source: no Angular, UI selection, or retained array of large snapshots. */
export interface CycleAnalysisRequest extends CycleAnalysisOptions {
  readonly samples: readonly CycleSampleMetadata[];
  readonly sequence: CycleSequenceMetadata;
  readonly readSample: (sample: CycleSampleMetadata, sequenceIndex: number) => CycleSampleInput;
}
export type CycleSampleResult = CycleSampleMetadata & { readonly sequenceIndex: number } & (
    | CycleFailure
    | {
        readonly status: 'ok';
        readonly stress: StressExtremaSuccess;
        readonly material: MaterialProperties | null;
        readonly loadSource: {
          readonly name: string;
          readonly gravityMPerS2: LoadCase['gravityMPerS2'];
        };
        readonly memberLengthM: number;
        readonly points: readonly { readonly id: string; readonly stress: StressPointSuccess }[];
        readonly diagnostics: { readonly normalizedClosureResidual: number };
      }
  );
export type SuccessfulCycleSample = Extract<CycleSampleResult, { status: 'ok' }>;
export interface CycleWitness {
  readonly sample: CycleSampleMetadata & { readonly sequenceIndex: number };
  readonly extremum: StressExtremum;
}
export interface CycleBoundWitness {
  readonly sample: CycleSampleMetadata & { readonly sequenceIndex: number };
  readonly upperBoundPa: number;
  /** This is an attained witness at the bounding sample, NOT a location of the upper bound. */
  readonly attainedWitness: StressExtremum;
  readonly diagnostics: StressExtremaSuccess['diagnostics'];
  readonly criterion: StressExtremaSuccess['conservativeYieldCriterion'];
}
export interface CycleEnvelope {
  readonly scope: 'successful-requested-samples';
  readonly maximumTensileNormal: CycleWitness;
  readonly maximumCompressiveNormal: CycleWitness;
  readonly maximumAbsoluteNormal: CycleWitness;
  readonly maximumAbsoluteShear: CycleWitness;
  readonly maximumVonMises: CycleWitness;
  readonly maximumConservativeVonMises: CycleBoundWitness;
  /** Unavailable if ANY successful sample lacks a usable criterion or provenance differs. */
  readonly yield:
    | { readonly status: 'available'; readonly governing: CycleBoundWitness }
    | { readonly status: 'unavailable'; readonly reason: string };
}
export interface SignedHistoryStatistics {
  readonly minimumPa: number;
  readonly maximumPa: number;
  readonly rangePa: number;
  readonly midrangePa: number;
  readonly amplitudePa: number;
}
export interface MaterialPointHistory {
  readonly point: FixedMaterialPoint;
  readonly entries: readonly (CycleSampleMetadata & { readonly sequenceIndex: number } & (
      { readonly status: 'ok'; readonly stress: StressPointSuccess } | CycleFailure
    ))[];
  readonly statistics: {
    readonly scope: 'successful-requested-samples';
    readonly normal: SignedHistoryStatistics;
    readonly shear: SignedHistoryStatistics;
  } | null;
}
export interface CycleAnalysisResult {
  readonly status: 'complete' | 'incomplete' | 'failed';
  readonly coverageKind: 'sampled';
  readonly requestedAnalysis: CycleAnalysisOptions;
  readonly sequence: CycleSequenceMetadata;
  readonly setupFailure?: CycleFailure;
  readonly coverage: {
    readonly requested: number;
    readonly successful: number;
    readonly failed: number;
    readonly fraction: number;
    readonly percent: number;
  };
  /** Gaps are contiguous in REQUEST ORDER, including reordered/subset requests. */
  readonly gaps: readonly {
    readonly startSequenceIndex: number;
    readonly endSequenceIndex: number;
    readonly failures: readonly Extract<CycleSampleResult, { status: 'failed' }>[];
  }[];
  readonly provenance: {
    readonly status: 'consistent' | 'heterogeneous' | 'unavailable';
    readonly variantCount: number;
  };
  readonly samples: readonly CycleSampleResult[];
  readonly envelope: CycleEnvelope | null;
  readonly histories: readonly MaterialPointHistory[];
}
