import { BodyDocument } from './body-document';
import { BodyId } from './body-id';
import { CompiledBodySystem } from './compiled-body-system';
import { BodySolveFrame } from './body-solve-frame';
import { BodyAdmissionRefusal } from './body-admission';
import { BodyCycle } from './body-cycle';
import { BodyMotionWindow } from './body-motion-window';
import { BodyForceInput } from './body-force-frame';
import { BodyForceSeries } from './body-force-series';
import { Point } from './body-frame';
import { DocumentIssue } from './body-validation';

export type SimulationPath = Extract<BodyCycle | BodyMotionWindow, { ok: true }>;
export type SimulationPartition =
  | {
      readonly ok: false;
      readonly key: string;
      readonly stage: 'admission' | 'trajectory';
      readonly reason: BodyAdmissionRefusal | 'branch' | 'unsolved';
    }
  | {
      readonly ok: true;
      readonly key: string;
      readonly frame: BodySolveFrame;
      readonly path: SimulationPath;
      readonly inputs: readonly BodyForceInput[];
      readonly forces: BodyForceSeries;
    };
export interface SimulationSnapshot {
  readonly revision: number;
  readonly document: BodyDocument;
  readonly system: CompiledBodySystem;
  readonly mode: 'static' | 'dynamic';
  readonly gravity: Point;
  readonly partitions: ReadonlyMap<string, SimulationPartition>;
  /** Moving material ownership only; a fixed frame has no clock. */
  readonly bodyPartition: ReadonlyMap<BodyId, string>;
  readonly fixedSupportPolicies: ReadonlyMap<string, 'unique' | 'evenest'>;
}
export type SimulationBuild =
  | { readonly ok: true; readonly snapshot: SimulationSnapshot }
  | {
      readonly ok: false;
      readonly reason: 'invalid' | 'document';
      readonly issues?: readonly DocumentIssue[];
    };
export interface SimulationPathOptions {
  readonly commandStep?: number;
  readonly maxSamples?: number;
  readonly maxTurns?: number;
  readonly maxIntervalProbes?: number;
  /** Explicit nonlooping analysis window; absence requests a complete physical cycle. */
  readonly duration?: number;
}
