import { BodyDocument } from './body-document';
import { BodyId } from './body-id';
import { CompiledBodySystem } from './compiled-body-system';
import { BodySolveFrame, solveFramePoint } from './body-solve-frame';
import { GroupPoses } from './body-constraint-rows';
import { BodyRatesResult } from './body-rates';
import { bodyPointRates } from './body-point-rates';
import { cross, dot, finitePoint, localToWorld, Point, rotate, scale } from './body-frame';
import { addWrenches, finiteWrench, scaleWrench, Wrench, ZERO_WRENCH } from './joint-wrenches';
import { unitFactors } from './body-units';

export type GroupForceLoads =
  | { readonly ok: false; readonly reason: 'missing-rates' | 'invalid' }
  | {
      readonly ok: true;
      readonly required: ReadonlyMap<BodyId, Wrench>;
      readonly applied: ReadonlyMap<BodyId, Wrench>;
      readonly inertia: ReadonlyMap<BodyId, Wrench>;
      readonly kineticEnergyRate?: number;
      readonly appliedPower?: number;
    };

/** Moving-group Newton–Euler loads. Fixed/member reactions require the later weld recovery. */
export function groupForceLoads(
  document: BodyDocument,
  system: CompiledBodySystem,
  frame: BodySolveFrame,
  poses: GroupPoses,
  mode: 'static' | 'dynamic',
  gravity: Point,
  rates?: BodyRatesResult
): GroupForceLoads {
  if (mode === 'dynamic' && !rates?.ok) return { ok: false, reason: 'missing-rates' };
  if (!finitePoint(gravity)) return { ok: false, reason: 'invalid' };
  const required = new Map<BodyId, Wrench>(),
    applied = new Map<BodyId, Wrench>(),
    inertia = new Map<BodyId, Wrench>();
  const factors = unitFactors(document.units);
  let energyRate = 0,
    power = 0;
  for (const id of frame.partition.unknowns) {
    const group = system.groups.get(id),
      pose = poses.get(id);
    if (!group || !pose) return { ok: false, reason: 'invalid' };
    const mass = group.mass;
    const center = solveFramePoint(frame, id, mass.center ?? mass.displayCenter);
    const arm = rotate(center, pose.angle);
    const weight = scale(gravity, mass.mass);
    let external: Wrench = { force: weight, moment: cross(arm, weight) };
    let inertial = ZERO_WRENCH;
    const motion = rates?.ok ? rates.motions.get(id) : undefined;
    if (rates?.ok && !motion) return { ok: false, reason: 'missing-rates' };
    const centerRates = motion && bodyPointRates(pose, center, motion);
    if (motion && !centerRates) return { ok: false, reason: 'invalid' };
    if (mode === 'dynamic') {
      const force = scale(centerRates!.acceleration, mass.mass);
      inertial = { force, moment: mass.inertia * motion!.acceleration.alpha + cross(arm, force) };
    }
    if (centerRates && motion) {
      power += dot(weight, centerRates.velocity);
      energyRate +=
        mass.mass * dot(centerRates.velocity, centerRates.acceleration) +
        mass.inertia * motion.velocity.omega * motion.acceleration.alpha;
    }
    for (const load of document.forces) {
      if (system.groupOf.get(load.bodyId) !== id) continue;
      const member = group.members.get(load.bodyId);
      if (!member) return { ok: false, reason: 'invalid' };
      const point = solveFramePoint(
        frame,
        id,
        localToWorld(member, scale(load.point, factors.length))
      );
      const vector = scale(
        load.frame === 'body' ? rotate(load.vector, pose.angle + member.angle) : load.vector,
        factors.force
      );
      const couple = load.couple * factors.force * factors.length;
      external = addWrenches(external, {
        force: vector,
        moment: cross(rotate(point, pose.angle), vector) + couple,
      });
      if (motion) {
        const at = bodyPointRates(pose, point, motion);
        if (!at) return { ok: false, reason: 'invalid' };
        power += dot(vector, at.velocity) + couple * motion.velocity.omega;
      }
    }
    const needed = addWrenches(inertial, scaleWrench(external, -1));
    if (![needed, external, inertial].every(finiteWrench)) return { ok: false, reason: 'invalid' };
    required.set(id, needed);
    applied.set(id, external);
    inertia.set(id, inertial);
  }
  if (rates?.ok && (!Number.isFinite(energyRate) || !Number.isFinite(power)))
    return { ok: false, reason: 'invalid' };
  return {
    ok: true,
    required,
    applied,
    inertia,
    ...(rates?.ok ? { kineticEnergyRate: energyRate, appliedPower: power } : {}),
  };
}
