import { BodyFold, findBodyFold } from './body-fold';
import { BodyAdmission } from './body-admission';
import { bodyRowsJacobian, GroupPoses } from './body-constraint-rows';
import { CompiledBodyPartition } from './compiled-body-system';
import { BodyPositionScale, bodyPositionScale } from './body-position-scale';
import { factorBodyRows, solveBodyRows } from './body-linear-algebra';
import { relaxBodyPosition } from './body-position-solver';
import { checkBodyLimits } from './body-limits';

export interface BodyContinuationState {
  readonly poses: GroupPoses;
  readonly command: number;
  /** Numerical prediction seed; only a regular state has a command derivative. Never publish as rates. */
  readonly tangent: readonly number[];
  readonly regular: boolean;
}
export type BodyAdvance =
  | { readonly ok: true; readonly state: BodyContinuationState; readonly attempts: number }
  | {
      readonly ok: false;
      readonly reason: 'branch' | 'travel' | 'unsolved';
      readonly attempts: number;
      readonly fold?: BodyFold;
    };
export type AdmittedBodySystem = Extract<BodyAdmission, { ok: true }>;

export function initialBodyContinuation(admitted: AdmittedBodySystem): BodyContinuationState {
  const partition = admitted.frame.partition;
  const tangent = bodyCommandTangent(partition, admitted.poses, admitted.scale);
  if (!tangent) throw new Error('Admitted driver does not control a regular pose');
  return { poses: admitted.poses, command: partition.drivers[0].initial, tangent, regular: true };
}

/** Substeps are private candidates: any refusal takes back the whole requested command advance. */
export function advanceBodyCommand(
  admitted: AdmittedBodySystem,
  start: BodyContinuationState,
  target: number,
  options: { readonly maxCuts?: number; readonly maxAttempts?: number } = {}
): BodyAdvance {
  const partition = admitted.frame.partition;
  const driver = partition.drivers[0];
  const maxCuts = options.maxCuts ?? 64,
    maxAttempts = options.maxAttempts ?? 512;
  let attempts = 0;
  let closest = start;
  if (!Number.isFinite(target)) return { ok: false, reason: 'unsolved', attempts };
  const targetScale = bodyPositionScale(partition, start.poses, new Map([[driver.id, target]]));
  for (const limit of partition.limits) {
    if (limit.row.jointId !== driver.row.jointId || limit.row.kind !== driver.row.kind) continue;
    const tolerance = 1e-9 * (limit.row.kind === 'angle' ? 1 : targetScale.length);
    if (target < limit.lower - tolerance || target > limit.upper + tolerance)
      return { ok: false, reason: 'travel', attempts };
  }
  const segment = (from: BodyContinuationState, command: number, cuts: number): BodyAdvance => {
    if (command === from.command) return { ok: true, state: from, attempts };
    if (attempts >= maxAttempts) return { ok: false, reason: 'unsolved', attempts };
    attempts++;
    const commands = new Map([[driver.id, command]]);
    const scale = bodyPositionScale(partition, from.poses, commands);
    const delta = command - from.command;
    const prediction = new Map(from.poses);
    partition.unknowns.forEach((id, i) => {
      const pose = from.poses.get(id)!,
        j = i * 3;
      prediction.set(id, {
        x: pose.x + from.tangent[j] * delta,
        y: pose.y + from.tangent[j + 1] * delta,
        angle: pose.angle + from.tangent[j + 2] * delta,
      });
    });
    const distance = Math.hypot(
      ...from.tangent.map((value, j) => (value * delta) / scale.columns[j])
    );
    let reason: 'branch' | 'unsolved' = 'branch';
    const angleAdvance = Math.max(
      0,
      ...partition.unknowns.map((_, i) => Math.abs(from.tangent[3 * i + 2] * delta))
    );
    if (angleAdvance <= 0.3) {
      const corrected = relaxBodyPosition(partition, prediction, commands, {
        scale,
        allowSingularCorrection: true,
      });
      if (corrected.ok) {
        const correction = poseDistance(partition, corrected.poses, prediction, scale);
        if (correction <= 0.3 * distance + 1e-9) {
          const limit = checkBodyLimits(partition, corrected.poses, scale);
          if (limit) return { ok: false, reason: limit.reason, attempts };
          const tangent = bodyCommandTangent(partition, corrected.poses, scale);
          const state = {
            poses: corrected.poses,
            command,
            tangent: tangent ?? from.tangent,
            regular: tangent !== undefined,
          };
          if (Math.abs(target - command) < Math.abs(target - closest.command)) closest = state;
          return { ok: true, state, attempts };
        }
      } else reason = 'unsolved';
    }
    if (cuts >= maxCuts) return { ok: false, reason, attempts };
    const middle = from.command + (command - from.command) / 2;
    if (middle === from.command || middle === command) return { ok: false, reason, attempts };
    const first = segment(from, middle, cuts + 1);
    if (!first.ok) return first;
    return segment(first.state, command, cuts + 1);
  };
  const result = segment(start, target, 0);
  if (
    !result.ok &&
    result.reason !== 'travel' &&
    options.maxCuts === undefined &&
    options.maxAttempts === undefined
  ) {
    // The closest Newton sample may sit within round-off of the singularity with an
    // unreliable command tangent. The original regular pose still orients the same branch.
    const seeds = closest === start ? [start] : [closest, start];
    for (const seed of seeds) {
      const scale = bodyPositionScale(partition, seed.poses, new Map([[driver.id, target]]));
      const fold = findBodyFold(partition, seed.poses, seed.tangent, target, scale);
      if (fold) return { ok: false, reason: 'travel', fold, attempts };
    }
  }
  return result;
}

export function bodyCommandTangent(
  partition: CompiledBodyPartition,
  poses: GroupPoses,
  scale: BodyPositionScale
): number[] | undefined {
  const matrix = bodyRowsJacobian(partition.rows, poses, partition.unknowns).map((row, i) =>
    row.map((value, j) => value * scale.rows[i] * scale.columns[j])
  );
  const factor = factorBodyRows(matrix, partition.unknowns.length * 3);
  const driver = partition.drivers[0];
  if (!factor || !driver) return undefined;
  const rhs = partition.rows.map((row, i) => (row.commandId === driver.id ? scale.rows[i] : 0));
  const answer = solveBodyRows(factor, rhs);
  if (!answer) return undefined;
  const residual = matrix.map((row, i) =>
    row.reduce((sum, value, j) => sum + value * answer[j], -rhs[i])
  );
  if (Math.hypot(...residual) > 1e-8 * Math.max(1, Math.hypot(...rhs))) return undefined;
  return answer.map((value, j) => value * scale.columns[j]);
}

function poseDistance(
  partition: CompiledBodyPartition,
  a: GroupPoses,
  b: GroupPoses,
  scale: BodyPositionScale
): number {
  return Math.hypot(
    ...partition.unknowns.flatMap((id, i) => {
      const first = a.get(id)!,
        second = b.get(id)!;
      return [
        (first.x - second.x) / scale.columns[3 * i],
        (first.y - second.y) / scale.columns[3 * i + 1],
        first.angle - second.angle,
      ];
    })
  );
}
