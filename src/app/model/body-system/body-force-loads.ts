import { BodyDocument } from './body-document';
import { BodyId } from './body-id';
import { CompiledBodySystem } from './compiled-body-system';
import { BodySolveFrame, solveFramePoint } from './body-solve-frame';
import { GroupPoses } from './body-constraint-rows';
import { BodyRatesResult } from './body-rates';
import { finitePoint, Point } from './body-frame';
import { MaterialWrenches, Wrench } from './joint-wrenches';
import { bodyLoadWrenches, frameBodyLoad } from './body-load-wrenches';
import { unitFactors } from './body-units';

export type GroupForceLoads =
  | { readonly ok: false; readonly reason: 'missing-rates' | 'invalid' }
  | {
      readonly ok: true;
      readonly required: ReadonlyMap<BodyId, Wrench>;
      readonly applied: ReadonlyMap<BodyId, Wrench>;
      readonly inertia: ReadonlyMap<BodyId, Wrench>;
      readonly arithmeticScale: ReadonlyMap<BodyId, Wrench>;
      readonly kineticEnergyRate?: number;
      readonly appliedPower?: number;
    };

/** External equilibrium uses aggregate inertia; member recovery retains the material distribution. */
export function groupForceLoads(
  document: BodyDocument,
  system: CompiledBodySystem,
  frame: BodySolveFrame,
  poses: GroupPoses,
  mode: 'static' | 'dynamic',
  gravity: Point,
  rates?: BodyRatesResult,
  materialWrenches: MaterialWrenches = new Map()
): GroupForceLoads {
  if (!finitePoint(gravity)) return { ok: false, reason: 'invalid' };
  if (mode === 'dynamic' && !rates?.ok) return { ok: false, reason: 'missing-rates' };
  const required = new Map<BodyId, Wrench>(),
    applied = new Map<BodyId, Wrench>(),
    inertia = new Map<BodyId, Wrench>(),
    arithmeticScale = new Map<BodyId, Wrench>();
  const factors = unitFactors(document.units);
  let energyRate = 0,
    power = 0;
  for (const id of frame.partition.unknowns) {
    const group = system.groups.get(id),
      pose = poses.get(id);
    if (!group || !pose) return { ok: false, reason: 'invalid' };
    const center = solveFramePoint(frame, id, group.mass.center ?? group.mass.displayCenter);
    const mass = { ...group.mass, center: group.mass.center && center, displayCenter: center };
    const motion = rates?.ok ? rates.motions.get(id) : undefined;
    if (rates?.ok && !motion) return { ok: false, reason: 'missing-rates' };
    const loads = document.forces
      .filter((load) => system.groupOf.get(load.bodyId) === id)
      .map((load) => {
        const member = group.members.get(load.bodyId)!;
        return frameBodyLoad(
          load,
          { ...solveFramePoint(frame, id, member), angle: member.angle },
          pose.angle,
          factors
        );
      });
    for (const [bodyId, wrenches] of materialWrenches) {
      const member = group.members.get(bodyId);
      if (member)
        for (const wrench of wrenches)
          loads.push({
            point: solveFramePoint(frame, id, member),
            vector: wrench.force,
            couple: wrench.moment,
          });
    }
    const result = bodyLoadWrenches(mass, pose, loads, mode, gravity, motion);
    if (!result.ok) return result;
    required.set(id, result.required);
    applied.set(id, result.applied);
    inertia.set(id, result.inertia);
    arithmeticScale.set(id, result.arithmeticScale);
    energyRate += result.kineticEnergyRate ?? 0;
    power += result.appliedPower ?? 0;
  }
  if (rates?.ok && (!Number.isFinite(energyRate) || !Number.isFinite(power)))
    return { ok: false, reason: 'invalid' };
  return {
    ok: true,
    required,
    applied,
    inertia,
    arithmeticScale,
    ...(rates?.ok ? { kineticEnergyRate: energyRate, appliedPower: power } : {}),
  };
}
