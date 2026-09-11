import { ForceDocument } from './force-document';
import { compareRecordIds, WORLD } from './body-id';
import { CompiledBodyPartition, CompiledBodySystem } from './compiled-body-system';
import { createBodySolveFrame } from './body-solve-frame';
import { BodyRatesResult } from './body-rates';
import { groupForceLoads } from './body-force-loads';
import { solveBodyEfforts } from './body-efforts';
import { forceFrameJoints } from './force-frame-joints';
import { forceAvailable } from './force-frame-result';
import { FixedForceInputs } from './fixed-force-inputs';
import { FixedBodyForces, FixedForceOptions } from './fixed-force-result';
import { freezeResult, snapshotMap } from './sample-results';
import { scale } from './body-frame';
import { unitFactors } from './body-units';

/** Equilibrium uses a read-only material view, never a replacement editable document. */
export function fixedForceBalance(
  document: ForceDocument,
  system: CompiledBodySystem,
  revision: number,
  inputs: Extract<FixedForceInputs, { ok: true }>,
  options: FixedForceOptions
): FixedBodyForces {
  const refuse = (reason: Extract<FixedBodyForces, { ok: false }>['reason']): FixedBodyForces =>
    freezeResult({ ok: false, reason });
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
  // A WORLD-only weld group has no moving origin to choose. Refer its force
  // balance to nearby material instead of subtracting moments about a distant zero.
  const reference = document.bodies
    .filter(
      (body) => body.kind === 'material' && system.groups.get(system.groupOf.get(body.id)!)?.fixed
    )
    .sort((a, b) => compareRecordIds(a.id, b.id))[0];
  const frame = createBodySolveFrame(
    partition,
    new Map(groups.map((group) => [group.id, group.pose])),
    reference && scale(reference.pose, unitFactors(document.units).length)
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
