import { JointId } from './body-id';
import { Point } from './body-frame';
import { BodyAdmissionRefusal } from './body-admission';
import { ForceValue, PairWrench } from './force-frame-result';
import { FixedForceInputRefusal } from './fixed-force-inputs';
import { SampleIdentity } from './sample-results';

export interface FixedForceContext {
  readonly revision: number;
  readonly mode: 'static' | 'dynamic';
  readonly gravity: Point;
  readonly samples: readonly SampleIdentity[];
}
export type FixedBodyForces =
  | {
      readonly ok: false;
      readonly reason: FixedForceInputRefusal | BodyAdmissionRefusal | 'unbalanced';
    }
  | {
      readonly ok: true;
      readonly context: FixedForceContext;
      readonly joints: ReadonlyMap<JointId, ForceValue<PairWrench>>;
      readonly supportPolicy: 'unique' | 'evenest';
      readonly conditional: boolean;
      readonly residual: number;
    };

export interface FixedForceOptions {
  readonly mode: 'static' | 'dynamic';
  readonly gravity: Point;
  readonly supportPolicy?: 'unique' | 'evenest';
}
