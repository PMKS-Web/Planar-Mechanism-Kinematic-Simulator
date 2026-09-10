import { BodyId, DriverId, JointId } from './body-id';
import { Wrench } from './joint-wrenches';
import { SampleIdentity, freezeResult } from './sample-results';

export type ForceRefusal =
  | 'invalid'
  | 'pose'
  | 'travel'
  | 'reversal'
  | 'missing-rates'
  | 'unbalanced'
  | 'indeterminate'
  | 'aggregate-properties'
  | 'load-owner'
  | 'external-reaction'
  | 'frame-context'
  | 'outside-sample'
  | 'wrong-body';
export type ForceValue<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: ForceRefusal };
export interface PairWrench {
  readonly bodyA: BodyId;
  readonly bodyB: BodyId;
  /** SI, world-oriented, about each named material body's own origin. */
  readonly a: Wrench;
  readonly b: Wrench;
  readonly basis: 'unique' | 'evenest';
}
export interface DriverEffort {
  readonly jointId: JointId;
  readonly value: number;
  readonly unit: 'N' | 'N*m';
  readonly basis: 'unique' | 'evenest';
}
export interface ForcePower {
  readonly applied: number;
  readonly driver: number;
  /** Positive work entering this partition through prescribed boundary motion. */
  readonly boundary: number;
  readonly kineticEnergyRate: number;
  readonly residual: number;
}
export interface GroupForceBalance {
  /** SI, world-oriented, about the group's numerical origin in this sample's solve frame. */
  readonly applied: Wrench;
  readonly inertia: Wrench;
  readonly required: Wrench;
}
interface ForceFrameStamp {
  readonly sample: SampleIdentity;
  readonly mode: 'static' | 'dynamic';
}
export type BodyForceFrame = ForceFrameStamp &
  (
    | { readonly ok: false; readonly reason: ForceRefusal }
    | {
        readonly ok: true;
        readonly joints: ReadonlyMap<JointId, ForceValue<PairWrench>>;
        readonly drivers: ReadonlyMap<DriverId, ForceValue<DriverEffort>>;
        readonly groups: ReadonlyMap<BodyId, GroupForceBalance>;
        readonly power: ForceValue<ForcePower>;
        readonly supportPolicy: 'unique' | 'evenest';
        readonly externalNullity: number;
        readonly freeEquilibriumDirections: number;
        readonly residual: number;
      }
  );

export function forceUnavailable<T = never>(reason: ForceRefusal): ForceValue<T> {
  return Object.freeze({ ok: false, reason });
}
export function forceAvailable<T>(value: T): ForceValue<T> {
  return freezeResult({ ok: true as const, value });
}

export function driverForceValue(frame: BodyForceFrame, id: DriverId): ForceValue<DriverEffort> {
  return frame.ok
    ? (frame.drivers.get(id) ?? forceUnavailable('outside-sample'))
    : forceUnavailable(frame.reason);
}

export function jointBodyWrench(
  frame: BodyForceFrame,
  jointId: JointId,
  body: BodyId
): ForceValue<Wrench> {
  if (!frame.ok) return forceUnavailable(frame.reason);
  const result = frame.joints.get(jointId);
  if (!result) return forceUnavailable('outside-sample');
  if (!result.ok) return result;
  const pair = result.value;
  if (body !== pair.bodyA && body !== pair.bodyB) return forceUnavailable('wrong-body');
  return forceAvailable(body === pair.bodyA ? pair.a : pair.b);
}
