import { BodyId } from './body-id';
import { Point, Pose } from './body-frame';
import { BodyMotion } from './body-rates';
import { solveFramePoint } from './body-solve-frame';
import { SimulationView } from './simulation-view';
import { SimulationValue, simulationUnavailable } from './simulation-values';

export interface SimulationBodyContext {
  readonly pose: Pose;
  readonly member: Pose;
  readonly origin: Point;
  readonly motion: SimulationValue<BodyMotion>;
}
export const STILL_BODY_MOTION: BodyMotion = Object.freeze({
  velocity: Object.freeze({ vx: 0, vy: 0, omega: 0 }),
  acceleration: Object.freeze({ ax: 0, ay: 0, alpha: 0 }),
});

/** Keep point arithmetic in the continued numerical frame until returning a world position. */
export function simulationBodyContext(
  view: SimulationView,
  id: BodyId
): SimulationValue<SimulationBodyContext> {
  const snapshot = view.snapshot,
    groupId = snapshot.system.groupOf.get(id);
  if (!groupId) return simulationUnavailable('unknown-body');
  const group = snapshot.system.groups.get(groupId)!,
    transform = group.members.get(id)!;
  if (group.fixed)
    return {
      ok: true,
      value: {
        pose: group.pose,
        member: transform,
        origin: { x: 0, y: 0 },
        motion: { ok: true, value: STILL_BODY_MOTION },
      },
    };
  const key = snapshot.bodyPartition.get(id)!;
  const selected = view.samples.get(key);
  if (!selected?.ok) return selected ?? simulationUnavailable('missing-sample');
  const partition = snapshot.partitions.get(key)!;
  if (!partition.ok) return simulationUnavailable(partition.reason);
  const input = selected.value.input;
  if (!input.pose.ok) return simulationUnavailable(input.pose.reason);
  const pose = input.pose.poses.get(groupId);
  if (!pose) return simulationUnavailable('outside-sample');
  const rates = input.rates;
  const motion = !rates
    ? simulationUnavailable('missing-rates')
    : !rates.ok
      ? simulationUnavailable(rates.reason)
      : rates.motions.has(groupId)
        ? { ok: true as const, value: rates.motions.get(groupId)! }
        : simulationUnavailable('missing-rates');
  return {
    ok: true,
    value: {
      pose,
      member: { ...solveFramePoint(partition.frame, groupId, transform), angle: transform.angle },
      origin: partition.frame.origin,
      motion,
    },
  };
}
