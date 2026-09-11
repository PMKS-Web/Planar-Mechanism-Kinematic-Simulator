import { BodyDocument } from './body-document';
import { JointId, compareRecordIds, WORLD } from './body-id';
import { Point } from './body-frame';
import { CompiledBodyPartition, CompiledBodySystem } from './compiled-body-system';
import { fixedBodyAdmission, BodyAdmissionRefusal } from './body-admission';
import { createBodySolveFrame } from './body-solve-frame';
import { BodyRatesResult } from './body-rates';
import { groupForceLoads } from './body-force-loads';
import { solveBodyEfforts } from './body-efforts';
import { forceFrameJoints } from './force-frame-joints';
import { BodyForceFrame, ForceValue, PairWrench, forceAvailable } from './force-frame-result';
import { FixedForceInputRefusal, fixedForceInputs } from './fixed-force-inputs';
import { SampleIdentity, freezeResult, snapshotMap } from './sample-results';

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

/** Fixed supports balance their own material plus all selected clocks, without choosing one clock as owner. */
export function solveFixedBodyForces(
  document: BodyDocument,
  system: CompiledBodySystem,
  revision: number,
  samples: readonly BodyForceFrame[],
  options: {
    readonly mode: 'static' | 'dynamic';
    readonly gravity: Point;
    readonly supportPolicy?: 'unique' | 'evenest';
  }
): FixedBodyForces {
  const refuse = (reason: Extract<FixedBodyForces, { ok: false }>['reason']): FixedBodyForces =>
    freezeResult({ ok: false, reason });
  const fixedIssue = fixedBodyAdmission(system);
  if (fixedIssue) return refuse(fixedIssue);
  const inputs = fixedForceInputs(
    document,
    system,
    revision,
    samples,
    options.mode,
    options.gravity
  );
  if (!inputs.ok) return refuse(inputs.reason);
  const groups = [...system.groups.values()]
    .filter((group) => group.fixed)
    .sort((a, b) => compareRecordIds(a.id, b.id));
  const unknowns = groups.filter((group) => group.id !== WORLD).map((group) => group.id);
  const partition: CompiledBodyPartition = {
    key: 'fixed-forces',
    unknowns,
    boundary: [WORLD],
    materialIds: unknowns.flatMap((id) => [...system.groups.get(id)!.members.keys()]),
    rows: system.fixedRows,
    drivers: system.fixedDrivers,
    limits: system.fixedLimits,
  };
  const frame = createBodySolveFrame(
    partition,
    new Map(groups.map((group) => [group.id, group.pose]))
  );
  const poses = frame.initialPoses;
  const rates: BodyRatesResult = {
    ok: true,
    motions: new Map(
      groups.map((group) => [
        group.id,
        { velocity: { vx: 0, vy: 0, omega: 0 }, acceleration: { ax: 0, ay: 0, alpha: 0 } },
      ])
    ),
  };
  const loads = groupForceLoads(
    document,
    system,
    frame,
    poses,
    options.mode,
    options.gravity,
    rates,
    inputs.materialWrenches
  );
  if (!loads.ok) return refuse(loads.reason === 'missing-rates' ? 'invalid' : loads.reason);
  const supportPolicy = options.supportPolicy ?? 'unique';
  const efforts = solveBodyEfforts(
    frame.partition,
    poses,
    loads.required,
    supportPolicy,
    loads.arithmeticScale
  );
  if (!efforts.ok) return refuse(efforts.reason);
  // The foundation has zero acceleration even when its attached machines supply
  // dynamic reactions; no distribution of an overridden inertia is needed here.
  const mapped = forceFrameJoints(
    document,
    system,
    frame,
    poses,
    rates,
    efforts,
    'static',
    options.gravity,
    { recoverBoundary: true, materialWrenches: inputs.materialWrenches }
  );
  if (!mapped.ok) return refuse(mapped.reason);
  const conditional = inputs.conditional || supportPolicy === 'evenest';
  const joints = [...mapped.joints].map(
    ([id, result]) =>
      [
        id,
        result.ok && conditional
          ? forceAvailable({ ...result.value, basis: 'evenest' as const })
          : result,
      ] as const
  );
  return freezeResult({
    ok: true,
    context: {
      revision,
      mode: options.mode,
      gravity: { ...options.gravity },
      samples: inputs.samples,
    },
    joints: snapshotMap(joints.sort(([a], [b]) => compareRecordIds(a, b))),
    supportPolicy,
    conditional,
    residual: efforts.residual,
  });
}
