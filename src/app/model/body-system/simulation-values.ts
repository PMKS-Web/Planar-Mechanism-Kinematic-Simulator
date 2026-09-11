import { BodyAdmissionRefusal } from './body-admission';
import { ForceRefusal } from './force-frame-result';
import { freezeResult } from './sample-results';

export type SimulationRefusal =
  | BodyAdmissionRefusal
  | ForceRefusal
  | 'branch'
  | 'unsolved'
  | 'stale-snapshot'
  | 'sample-index'
  | 'missing-sample'
  | 'unknown-body'
  | 'unknown-attachment'
  | 'unknown-coordinate'
  | 'unknown-joint'
  | 'unknown-driver'
  | 'unknown-group'
  | 'world-group'
  | 'zero-mass'
  | 'rank'
  | 'velocity-inconsistent'
  | 'acceleration-inconsistent';
export type SimulationValue<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: SimulationRefusal };
export function simulationUnavailable(reason: SimulationRefusal): SimulationValue<never> {
  return Object.freeze({ ok: false, reason });
}
export function simulationAvailable<T>(value: T): SimulationValue<T> {
  return freezeResult({ ok: true as const, value });
}
