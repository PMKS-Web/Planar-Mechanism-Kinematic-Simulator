import { BodyLoad } from './body-document';
import {
  cross,
  dot,
  finitePoint,
  finitePose,
  localToWorld,
  Point,
  Pose,
  rotate,
  scale,
} from './body-frame';
import { ResolvedMass } from './body-properties';
import { BodyMotion } from './body-rates';
import { bodyPointRates } from './body-point-rates';
import {
  absoluteWrench,
  addWrenches,
  finiteWrench,
  scaleWrench,
  Wrench,
  ZERO_WRENCH,
} from './joint-wrenches';
import { unitFactors } from './body-units';

export interface FramedLoad {
  readonly point: Point;
  readonly vector: Point;
  readonly couple: number;
}
export type BodyLoadWrenches =
  | { readonly ok: false; readonly reason: 'missing-rates' | 'invalid' }
  | {
      readonly ok: true;
      readonly required: Wrench;
      readonly applied: Wrench;
      readonly inertia: Wrench;
      readonly arithmeticScale: Wrench;
      readonly kineticEnergyRate?: number;
      readonly appliedPower?: number;
    };

/** Group and member balance must use the same load and inertia laws at the same moment reference. */
export function bodyLoadWrenches(
  mass: ResolvedMass,
  pose: Pose,
  loads: readonly FramedLoad[],
  mode: 'static' | 'dynamic',
  gravity: Point,
  motion?: BodyMotion
): BodyLoadWrenches {
  if (mode === 'dynamic' && !motion) return { ok: false, reason: 'missing-rates' };
  if (!finitePose(pose) || !finitePoint(gravity)) return { ok: false, reason: 'invalid' };
  const center = mass.center ?? mass.displayCenter;
  const arm = rotate(center, pose.angle),
    weight = scale(gravity, mass.mass);
  let applied: Wrench = { force: weight, moment: cross(arm, weight) },
    inertia = ZERO_WRENCH;
  const centerRates = motion && bodyPointRates(pose, center, motion);
  if (motion && !centerRates) return { ok: false, reason: 'invalid' };
  if (mode === 'dynamic') {
    const force = scale(centerRates!.acceleration, mass.mass);
    inertia = { force, moment: mass.inertia * motion!.acceleration.alpha + cross(arm, force) };
  }
  let arithmeticScale = addWrenches(absoluteWrench(inertia), absoluteWrench(applied));
  let power = centerRates ? dot(weight, centerRates.velocity) : 0;
  const energyRate =
    centerRates && motion
      ? mass.mass * dot(centerRates.velocity, centerRates.acceleration) +
        mass.inertia * motion.velocity.omega * motion.acceleration.alpha
      : undefined;
  for (const load of loads) {
    const arm = rotate(load.point, pose.angle);
    const wrench = { force: load.vector, moment: cross(arm, load.vector) + load.couple };
    arithmeticScale = addWrenches(arithmeticScale, {
      force: absoluteWrench(wrench).force,
      moment:
        Math.abs(arm.x * load.vector.y) + Math.abs(arm.y * load.vector.x) + Math.abs(load.couple),
    });
    applied = addWrenches(applied, wrench);
    if (motion) {
      const at = bodyPointRates(pose, load.point, motion);
      if (!at) return { ok: false, reason: 'invalid' };
      power += dot(load.vector, at.velocity) + load.couple * motion.velocity.omega;
    }
  }
  const required = addWrenches(inertia, scaleWrench(applied, -1));
  if (
    ![required, applied, inertia, arithmeticScale].every(finiteWrench) ||
    (motion && (!Number.isFinite(power) || !Number.isFinite(energyRate)))
  )
    return { ok: false, reason: 'invalid' };
  return {
    ok: true,
    required,
    applied,
    inertia,
    arithmeticScale,
    ...(motion ? { kineticEnergyRate: energyRate, appliedPower: power } : {}),
  };
}

export function frameBodyLoad(
  load: BodyLoad,
  member: Pose,
  angle: number,
  factors: ReturnType<typeof unitFactors>
): FramedLoad {
  return {
    point: localToWorld(member, scale(load.point, factors.length)),
    vector: scale(
      load.frame === 'body' ? rotate(load.vector, angle + member.angle) : load.vector,
      factors.force
    ),
    couple: load.couple * factors.force * factors.length,
  };
}
