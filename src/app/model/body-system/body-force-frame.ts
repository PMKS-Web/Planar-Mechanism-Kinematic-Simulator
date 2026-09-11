import { BodyDocument } from './body-document';
import { BodyId, DriverId, compareRecordIds } from './body-id';
import { finitePose, Point } from './body-frame';
import { CompiledBodySystem } from './compiled-body-system';
import { BodySolveFrame } from './body-solve-frame';
import { bodyRowValue, CommandValues, GroupPoses } from './body-constraint-rows';
import { bodyPositionScale } from './body-position-scale';
import { checkBodyLimits } from './body-limits';
import { BodyRatesResult } from './body-rates';
import { groupForceLoads } from './body-force-loads';
import { solveBodyEfforts } from './body-efforts';
import {
  BodyForceFrame,
  DriverEffort,
  ForceRefusal,
  ForceValue,
  GroupForceBalance,
  forceAvailable,
  forceUnavailable,
} from './force-frame-result';
import { forceFramePower } from './force-frame-power';
import { forceFrameJoints } from './force-frame-joints';
import { SampleIdentity, freezeResult, snapshotMap } from './sample-results';

export interface BodyForceInput {
  readonly sample: SampleIdentity;
  readonly pose:
    | { readonly ok: true; readonly poses: GroupPoses; readonly commands: CommandValues }
    | { readonly ok: false; readonly reason: 'branch' | 'travel' | 'unsolved' };
  readonly rates?: BodyRatesResult;
  readonly reversal?: boolean;
}

/** Per-sample ownership and availability are fixed before any graph or export reads the result. */
export function solveBodyForceFrame(
  document: BodyDocument,
  system: CompiledBodySystem,
  frame: BodySolveFrame,
  input: BodyForceInput,
  options: {
    readonly mode: 'static' | 'dynamic';
    readonly gravity: Point;
    readonly supportPolicy?: 'unique' | 'evenest';
  }
): BodyForceFrame {
  const sample = freezeResult({ ...input.sample }),
    mode = options.mode,
    gravity = freezeResult({ ...options.gravity });
  const refused = (reason: ForceRefusal): BodyForceFrame =>
    freezeResult({ sample, mode, gravity, ok: false as const, reason });
  if (!validStamp(sample, frame)) return refused('invalid');
  if (!input.pose.ok) return refused('pose');
  if (input.reversal && mode === 'dynamic') return refused('reversal');
  const { poses, commands } = input.pose;
  const partition = frame.partition;
  const ids = new Set([...partition.unknowns, ...partition.boundary]);
  if (
    [...ids].some((id) => !poses.has(id) || !finitePose(poses.get(id)!)) ||
    partition.rows.some(
      (row) =>
        !ids.has(row.pair.groupA) ||
        !ids.has(row.pair.groupB) ||
        (row.commandId !== undefined && !Number.isFinite(commands.get(row.commandId)))
    )
  )
    return refused('invalid');
  if (partition.drivers.length === 1 && commands.get(partition.drivers[0].id) !== sample.command)
    return refused('invalid');
  const scaling = bodyPositionScale(partition, poses, commands);
  if (
    partition.rows.some(
      (row, i) =>
        !Number.isFinite(bodyRowValue(row, poses, commands)) ||
        Math.abs(bodyRowValue(row, poses, commands) * scaling.rows[i]) > 1e-9
    )
  )
    return refused('pose');
  const limit = checkBodyLimits(partition, poses, scaling);
  if (limit) return refused(limit.reason === 'travel' ? 'travel' : 'invalid');
  const rates = input.reversal ? undefined : input.rates;
  const loads = groupForceLoads(document, system, frame, poses, mode, options.gravity, rates);
  if (!loads.ok) return refused(loads.reason);
  const supportPolicy = options.supportPolicy ?? 'unique';
  const efforts = solveBodyEfforts(
    partition,
    poses,
    loads.required,
    supportPolicy,
    loads.arithmeticScale
  );
  if (!efforts.ok) return refused(efforts.reason);
  const mapped = forceFrameJoints(
    document,
    system,
    frame,
    poses,
    rates,
    efforts,
    mode,
    options.gravity
  );
  if (!mapped.ok) return refused(mapped.reason);
  const joints = mapped.joints;
  const drivers = new Map<DriverId, ForceValue<DriverEffort>>();
  for (const driver of partition.drivers) {
    const effort = efforts.efforts.get(driver.row.key);
    drivers.set(
      driver.id,
      effort?.ok
        ? forceAvailable({
            jointId: driver.row.jointId,
            value: effort.value,
            unit: driver.row.kind === 'travel' ? ('N' as const) : ('N*m' as const),
            basis: effort.basis,
          })
        : forceUnavailable('indeterminate')
    );
  }
  const groups = partition.unknowns.map(
    (id) =>
      [
        id,
        freezeResult({
          applied: loads.applied.get(id)!,
          inertia: loads.inertia.get(id)!,
          required: loads.required.get(id)!,
        }),
      ] as const
  );
  return freezeResult({
    sample,
    mode,
    ok: true as const,
    gravity,
    joints: snapshotMap([...joints].sort(([a], [b]) => compareRecordIds(a, b))),
    drivers: snapshotMap(drivers),
    groups: snapshotMap<BodyId, GroupForceBalance>(groups),
    power: forceFramePower(frame, poses, rates, loads, efforts, mode),
    supportPolicy,
    externalNullity: Math.max(
      0,
      partition.rows.filter((row) => row.pair.groupA !== row.pair.groupB).length - efforts.rank
    ),
    freeEquilibriumDirections: efforts.freeEquilibriumDirections,
    residual: efforts.residual,
  });
}

function validStamp(sample: SampleIdentity, frame: BodySolveFrame): boolean {
  return (
    sample.partitionKey === frame.partition.key &&
    Number.isInteger(sample.revision) &&
    sample.revision >= 0 &&
    Number.isInteger(sample.index) &&
    sample.index >= 0 &&
    Number.isFinite(sample.time) &&
    sample.time >= 0 &&
    Number.isFinite(sample.command) &&
    (sample.direction === 1 || sample.direction === -1)
  );
}
