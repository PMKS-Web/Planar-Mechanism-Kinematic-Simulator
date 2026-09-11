import { BodyContinuationState } from './body-continuation';
import { BodyFold } from './body-fold';
import { LimitId } from './body-id';

export interface BodyLimitContact {
  readonly limitId: LimitId;
  readonly side: 'lower' | 'upper';
  readonly bound: number;
  readonly value: number;
  readonly residual: number;
}
export type BodyStop =
  | { readonly kind: 'coordinate'; readonly contacts: readonly BodyLimitContact[] }
  | { readonly kind: 'fold'; readonly curvature: number };
export type BodyInterval =
  | { readonly ok: false; readonly reason: 'branch' | 'unsolved'; readonly probes: number }
  | {
      readonly ok: true;
      readonly state: BodyContinuationState;
      readonly stop?: BodyStop;
      readonly probes: number;
    };
export interface BodyLimitProbe {
  readonly value: number;
  /** Command derivative at regular poses; only its oriented sign is used at a proved fold. */
  readonly slope: number;
}
export interface BodyIntervalPoint {
  readonly state: BodyContinuationState;
  readonly limits: readonly (BodyLimitProbe | undefined)[];
  readonly fold?: BodyFold;
}
export class BodyIntervalRefusal extends Error {
  constructor(readonly reason: 'branch' | 'unsolved') {
    super(reason);
  }
}
