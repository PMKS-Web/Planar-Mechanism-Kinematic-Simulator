import type { Vector2 } from './loads';

export type StructuralStatus =
  | 'ok'
  | 'underconstrained'
  | 'statically-indeterminate'
  | 'singular'
  | 'inconsistent'
  | 'unsupported-joint-type'
  | 'unsupported-topology'
  | 'invalid-geometry'
  | 'invalid-load'
  | 'invalid-properties'
  | 'invalid-dynamic-state'
  | 'numerical-failure';

export interface SolverDiagnostics {
  readonly equationCount: number;
  readonly unknownCount: number;
  readonly rank?: number;
  /** Nullspaces: unrestrained body motions and undetermined reaction combinations. */
  readonly equilibriumDeficiency?: number;
  readonly reactionRedundancy?: number;
  readonly conditionNumber?: number;
  /** Maximum row imbalance after moment rows are divided by a characteristic length. */
  readonly normalizedResidual?: number;
  readonly characteristicLengthM?: number;
  readonly message?: string;
}

export interface JointReactionResult {
  readonly jointId: string;
  /** Force ON this body. A binary internal pin returns both sides. */
  readonly linkId: string;
  readonly forceN: Vector2;
}

export interface LinkEquilibriumResult {
  readonly linkId: string;
  readonly momentReferenceM: Vector2;
  readonly forceResidualN: Vector2;
  readonly momentResidualNm: number;
}

export interface DriverReactionResult {
  readonly jointId: string;
  readonly linkId: string;
  /** Counterclockwise positive on the driven body. */
  readonly momentNm: number;
}

export type StaticForceAnalysisResult =
  | {
      readonly status: 'ok';
      readonly diagnostics: SolverDiagnostics;
      readonly jointReactions: readonly JointReactionResult[];
      readonly linkEquilibrium: readonly LinkEquilibriumResult[];
      readonly driverReactions: readonly DriverReactionResult[];
    }
  | StructuralFailure;

export interface StructuralFailure {
  readonly status: Exclude<StructuralStatus, 'ok'>;
  readonly diagnostics: SolverDiagnostics;
}

/** All moments use momentReferenceM, including the translated inertial target. */
export interface DynamicBodyEquilibriumResult extends LinkEquilibriumResult {
  readonly knownAppliedForceN: Vector2;
  readonly knownAppliedMomentNm: number;
  readonly inertialForceN: Vector2;
  readonly inertialMomentNm: number;
}

export type DynamicForceAnalysisResult = { readonly mode: 'dynamic' } & (
  | {
      readonly status: 'ok';
      readonly diagnostics: SolverDiagnostics;
      readonly jointReactions: readonly JointReactionResult[];
      readonly driverReactions: readonly DriverReactionResult[];
      readonly bodyEquilibrium: readonly DynamicBodyEquilibriumResult[];
    }
  | StructuralFailure
);

export function structuralFailure(
  status: Exclude<StructuralStatus, 'ok'>,
  message: string,
  diagnostics: SolverDiagnostics = { equationCount: 0, unknownCount: 0 }
): StructuralFailure {
  return { status, diagnostics: { ...diagnostics, message } };
}
