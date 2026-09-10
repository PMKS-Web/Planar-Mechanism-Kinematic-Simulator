import { bodyRowsJacobian, bodyRowValue, CommandValues, GroupPoses } from './body-constraint-rows';
import { CompiledBodyPartition, CompiledBodySystem } from './compiled-body-system';
import { BodySolveFrame, createBodySolveFrame } from './body-solve-frame';
import { bodyPositionScale, BodyPositionScale } from './body-position-scale';
import { bodyMobility, BodyMobility } from './body-mobility';
import { factorBodyRows } from './body-linear-algebra';
import { relaxBodyPosition } from './body-position-solver';
import { checkBodyLimits } from './body-limits';

export type BodyAdmissionRefusal =
  | 'invalid'
  | 'inconsistent'
  | 'no-drive'
  | 'multiple-drives'
  | 'immobile'
  | 'underconstrained'
  | 'singular-start'
  | 'drive-does-not-control-motion'
  | 'travel'
  | 'fixed-drive';
export type BodyAdmission =
  | { readonly ok: false; readonly reason: BodyAdmissionRefusal; readonly mobility?: BodyMobility }
  | {
      readonly ok: true;
      readonly frame: BodySolveFrame;
      readonly poses: GroupPoses;
      readonly commands: CommandValues;
      readonly scale: BodyPositionScale;
      readonly mobility: BodyMobility;
    };

/** A complete row set, controlled freedom and a consistent start are separate admission tests. */
export function admitBodyPartition(
  system: CompiledBodySystem,
  partition: CompiledBodyPartition
): BodyAdmission {
  const fixedIssue = fixedBodyAdmission(system);
  if (fixedIssue) return { ok: false, reason: fixedIssue };
  const worldPoses = new Map([...system.groups].map(([id, group]) => [id, group.pose]));
  const frame = createBodySolveFrame(partition, worldPoses);
  const local = frame.partition;
  const commands = new Map(local.drivers.map((driver) => [driver.id, driver.initial]));
  const scale = bodyPositionScale(local, frame.initialPoses, commands);
  if (!Number.isFinite(scale.length) || scale.length <= 0) return { ok: false, reason: 'invalid' };
  for (const [i, row] of local.rows.entries()) {
    const residual = Math.abs(bodyRowValue(row, frame.initialPoses, commands) * scale.rows[i]);
    const tolerance = 1e-9 + (row.kind === 'angle' ? 0 : frame.inputPrecision * scale.rows[i]);
    if (!Number.isFinite(residual) || residual > tolerance)
      return { ok: false, reason: 'inconsistent' };
  }
  if (local.drivers.length === 0) return { ok: false, reason: 'no-drive' };
  if (local.drivers.length !== 1) return { ok: false, reason: 'multiple-drives' };
  const corrected = relaxBodyPosition(local, frame.initialPoses, commands, { scale });
  if (!corrected.ok)
    return { ok: false, reason: corrected.reason === 'rank' ? 'singular-start' : 'inconsistent' };
  const mobility = bodyMobility(local, corrected.poses, commands);
  if (mobility.dof === 0) return { ok: false, reason: 'immobile', mobility };
  if (mobility.dof !== undefined && mobility.dof > 1)
    return { ok: false, reason: 'underconstrained', mobility };
  if (mobility.dof !== 1) return { ok: false, reason: 'singular-start', mobility };
  const matrix = bodyRowsJacobian(local.rows, corrected.poses, local.unknowns).map((row, i) =>
    row.map((value, j) => value * scale.rows[i] * scale.columns[j])
  );
  const factor = factorBodyRows(matrix, local.unknowns.length * 3);
  if (!factor || factor.rank !== local.unknowns.length * 3)
    return { ok: false, reason: 'drive-does-not-control-motion', mobility };
  const limit = checkBodyLimits(local, corrected.poses, scale);
  if (limit)
    return { ok: false, reason: limit.reason === 'travel' ? 'travel' : 'invalid', mobility };
  return { ok: true, frame, poses: corrected.poses, commands, scale, mobility };
}

/** Condensation must not erase a moving command or incompatible relationship inside ground. */
export function fixedBodyAdmission(system: CompiledBodySystem): BodyAdmissionRefusal | undefined {
  if (system.fixedDrivers.some((driver) => driver.speed !== 0)) return 'fixed-drive';
  const fixed: CompiledBodyPartition = {
    key: 'fixed',
    unknowns: [],
    materialIds: [],
    boundary: [...system.groups.values()].filter((group) => group.fixed).map((group) => group.id),
    rows: system.fixedRows,
    drivers: system.fixedDrivers,
    limits: system.fixedLimits,
  };
  const poses = new Map([...system.groups].map(([id, group]) => [id, group.pose]));
  const commands = new Map(fixed.drivers.map((driver) => [driver.id, driver.initial]));
  const scale = bodyPositionScale(fixed, poses, commands);
  if (
    fixed.rows.some(
      (row, i) =>
        !Number.isFinite(bodyRowValue(row, poses, commands)) ||
        Math.abs(bodyRowValue(row, poses, commands) * scale.rows[i]) > 1e-9
    )
  )
    return 'inconsistent';
  const limit = checkBodyLimits(fixed, poses, scale);
  return limit ? (limit.reason === 'travel' ? 'travel' : 'invalid') : undefined;
}
