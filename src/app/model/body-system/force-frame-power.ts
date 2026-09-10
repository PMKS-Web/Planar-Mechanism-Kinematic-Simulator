import { BodySolveFrame } from './body-solve-frame';
import { GroupPoses, bodyRowGradient } from './body-constraint-rows';
import { BodyRatesResult } from './body-rates';
import { BodyEfforts } from './body-efforts';
import { GroupForceLoads } from './body-force-loads';
import { ForcePower, ForceValue, forceAvailable, forceUnavailable } from './force-frame-result';

/** Moving-body power is applied + driver - work delivered to the prescribed boundary. */
export function forceFramePower(
  frame: BodySolveFrame,
  poses: GroupPoses,
  rates: BodyRatesResult | undefined,
  loads: Extract<GroupForceLoads, { ok: true }>,
  efforts: Extract<BodyEfforts, { ok: true }>,
  mode: 'static' | 'dynamic'
): ForceValue<ForcePower> {
  if (!rates?.ok || loads.appliedPower === undefined || loads.kineticEnergyRate === undefined)
    return forceUnavailable('missing-rates');
  const boundary = new Set(frame.partition.boundary);
  let driver = 0,
    intoBoundary = 0;
  for (const row of frame.partition.rows) {
    if (row.pair.groupA === row.pair.groupB) continue;
    const gradient = bodyRowGradient(row, poses);
    let coordinateRate = 0,
      boundaryRate = 0;
    for (const [id, values] of gradient) {
      const motion = rates.motions.get(id);
      if (!motion) return forceUnavailable('missing-rates');
      const { vx, vy, omega } = motion.velocity;
      const powerPerEffort = values[0] * vx + values[1] * vy + values[2] * omega;
      coordinateRate += powerPerEffort;
      if (boundary.has(id)) boundaryRate += powerPerEffort;
    }
    const effort = efforts.efforts.get(row.key);
    if (!effort?.ok) {
      if (boundaryRate !== 0 || (row.commandId && coordinateRate !== 0))
        return forceUnavailable('indeterminate');
      continue;
    }
    intoBoundary += effort.value * boundaryRate;
    if (row.commandId) driver += effort.value * coordinateRate;
  }
  const result = {
    applied: loads.appliedPower,
    driver,
    boundary: -intoBoundary,
    kineticEnergyRate: loads.kineticEnergyRate,
    residual:
      loads.appliedPower +
      driver -
      intoBoundary -
      (mode === 'dynamic' ? loads.kineticEnergyRate : 0),
  };
  return Object.values(result).every(Number.isFinite)
    ? forceAvailable(result)
    : forceUnavailable('invalid');
}
