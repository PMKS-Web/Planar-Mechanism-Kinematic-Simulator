import { bodyRowValue, GroupPoses } from './body-constraint-rows';
import { CompiledBodyPartition } from './compiled-body-system';
import { BodyPositionScale } from './body-position-scale';
import { LimitId } from './body-id';

export type BodyLimitRefusal = {
  readonly reason: 'travel' | 'unsolved';
  readonly limitId: LimitId;
  readonly value: number;
};

/** Bounds validate a settled pose; crossing one is distinct from failing to solve the pose. */
export function checkBodyLimits(
  partition: CompiledBodyPartition,
  poses: GroupPoses,
  scale: BodyPositionScale
): BodyLimitRefusal | undefined {
  for (const limit of partition.limits) {
    const value = bodyRowValue(limit.row, poses);
    if (!Number.isFinite(value)) return { reason: 'unsolved', limitId: limit.id, value };
    const tolerance = 1e-9 * (limit.row.kind === 'angle' ? 1 : scale.length);
    if (value < limit.lower - tolerance || value > limit.upper + tolerance)
      return { reason: 'travel', limitId: limit.id, value };
  }
  return undefined;
}
