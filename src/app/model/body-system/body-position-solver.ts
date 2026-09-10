import { finitePose } from './body-frame';
import { bodyRowsJacobian, bodyRowValue, CommandValues, GroupPoses } from './body-constraint-rows';
import { CompiledBodyPartition } from './compiled-body-system';
import { factorBodyRows, fitBodyRows, solveBodyRows } from './body-linear-algebra';
import { BodyPositionScale, bodyPositionScale } from './body-position-scale';

export type BodyRelaxation =
  | {
      readonly ok: true;
      readonly poses: GroupPoses;
      readonly residual: number;
      readonly iterations: number;
    }
  | {
      readonly ok: false;
      readonly reason: 'invalid-pose' | 'rank' | 'unsolved';
      readonly residual: number;
      readonly iterations: number;
    };

/** Local correction only: continuation separately certifies branch choice and coordinate bounds. */
export function relaxBodyPosition(
  partition: CompiledBodyPartition,
  seed: GroupPoses,
  commands: CommandValues,
  options: {
    readonly maxIterations?: number;
    readonly scale?: BodyPositionScale;
    readonly allowSingularCorrection?: boolean;
  } = {}
): BodyRelaxation {
  if (
    [...partition.unknowns, ...partition.boundary].some(
      (id) => !seed.has(id) || !finitePose(seed.get(id)!)
    )
  )
    return { ok: false, reason: 'invalid-pose', residual: Infinity, iterations: 0 };
  if (partition.drivers.some((driver) => !Number.isFinite(commands.get(driver.id))))
    return { ok: false, reason: 'invalid-pose', residual: Infinity, iterations: 0 };
  const scale = options.scale ?? bodyPositionScale(partition, seed, commands);
  if (!Number.isFinite(scale.length) || scale.length <= 0)
    return { ok: false, reason: 'invalid-pose', residual: Infinity, iterations: 0 };
  let poses = new Map(seed);
  const maxIterations = options.maxIterations ?? 40;
  const residuals = (value: GroupPoses) =>
    partition.rows.map((row, i) => bodyRowValue(row, value, commands) * scale.rows[i]);
  let values = residuals(poses);
  for (let iteration = 0; iteration <= maxIterations; iteration++) {
    const residual = Math.max(0, ...values.map(Math.abs));
    if (!Number.isFinite(residual))
      return { ok: false, reason: 'unsolved', residual, iterations: iteration };
    if (residual <= 1e-10) return { ok: true, poses, residual, iterations: iteration };
    if (iteration === maxIterations)
      return { ok: false, reason: 'unsolved', residual, iterations: iteration };
    const jacobian = bodyRowsJacobian(partition.rows, poses, partition.unknowns).map((row, i) =>
      row.map((value, j) => value * scale.rows[i] * scale.columns[j])
    );
    const factor = factorBodyRows(jacobian, partition.unknowns.length * 3);
    const delta =
      factor &&
      (options.allowSingularCorrection ? fitBodyRows : solveBodyRows)(
        factor,
        values.map((value) => -value)
      );
    if (!delta) return { ok: false, reason: 'rank', residual, iterations: iteration };
    const limit = Math.min(
      1,
      0.5 / Math.max(0.5, ...partition.unknowns.map((_, i) => Math.abs(delta[3 * i + 2])))
    );
    const merit = Math.hypot(...values);
    let improved = false;
    for (let cut = 0; cut <= 12; cut++) {
      const step = limit * 2 ** -cut;
      const candidate = new Map(poses);
      partition.unknowns.forEach((id, index) => {
        const pose = poses.get(id)!,
          offset = index * 3;
        candidate.set(id, {
          x: pose.x + delta[offset] * scale.columns[offset] * step,
          y: pose.y + delta[offset + 1] * scale.columns[offset + 1] * step,
          angle: pose.angle + delta[offset + 2] * step,
        });
      });
      if (partition.unknowns.some((id) => !finitePose(candidate.get(id)!))) continue;
      const next = residuals(candidate);
      if (Math.hypot(...next) < merit) {
        poses = candidate;
        values = next;
        improved = true;
        break;
      }
    }
    if (!improved) return { ok: false, reason: 'unsolved', residual, iterations: iteration + 1 };
  }
  return { ok: false, reason: 'unsolved', residual: Infinity, iterations: maxIterations };
}
