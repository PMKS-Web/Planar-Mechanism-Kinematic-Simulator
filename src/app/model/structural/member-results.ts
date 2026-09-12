import type { StructuralStatus } from './results';
import type { ResolvedStructuralMember } from './member';

export type MemberStatus =
  | Exclude<StructuralStatus, 'ok'>
  | 'unsupported-member-geometry'
  | 'ambiguous-member-mapping'
  | 'invalid-station'
  | 'load-not-on-supported-member'
  | 'missing-mass-distribution'
  | 'mass-distribution-mismatch'
  | 'missing-angular-velocity'
  | 'unsupported-compound'
  | 'invalid-equilibrium-result'
  | 'missing-gravity-model'
  | 'upstream-analysis-failed';
export interface MemberFailure {
  readonly status: MemberStatus;
  readonly message: string;
}
export function memberFailure(status: MemberStatus, message: string): MemberFailure {
  return { status, message };
}
export interface InternalLoads {
  readonly axialN: number;
  readonly shearN: number;
  readonly momentNm: number;
}
export interface StationReference {
  readonly xM: number;
  readonly side: 'left' | 'right';
}
export interface MemberEvent {
  readonly xM: number;
  readonly sources: readonly string[];
  readonly leftLimit: InternalLoads;
  readonly rightLimit: InternalLoads;
}
/** Coefficients in ascending powers of u=x-startM, not a set of plot samples. */
export interface InternalLoadSegment {
  readonly startM: number;
  readonly endM: number;
  readonly axialN: readonly number[];
  readonly shearN: readonly number[];
  readonly momentNm: readonly number[];
}
export interface LoadExtremum {
  readonly value: number;
  readonly at: readonly StationReference[];
  readonly intervals: readonly { startM: number; endM: number }[];
}
export interface ComponentExtrema {
  readonly minimum: LoadExtremum;
  readonly maximum: LoadExtremum;
  readonly absoluteMaximum: LoadExtremum;
}
export interface MemberLoadsSuccess {
  readonly status: 'ok';
  readonly mode: 'static' | 'dynamic';
  readonly member: ResolvedStructuralMember;
  readonly gravityModel: 'none' | 'lumped-at-com' | 'uniform-line';
  readonly massModel: 'none' | 'uniform-line';
  readonly events: readonly MemberEvent[];
  readonly segments: readonly InternalLoadSegment[];
  readonly extrema: {
    readonly axialN: ComponentExtrema;
    readonly shearN: ComponentExtrema;
    readonly momentNm: ComponentExtrema;
  };
  readonly diagnostics: { readonly normalizedClosureResidual: number };
}
export type MemberInternalLoadResult = MemberLoadsSuccess | MemberFailure;
