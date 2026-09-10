import { BodyDocument } from './body-document';
import { BodyId, WORLD } from './body-id';
import { CompiledBodySystem } from './compiled-body-system';
import { BodySolveFrame, solveFramePoint } from './body-solve-frame';
import { GroupPoses } from './body-constraint-rows';
import { BodyRatesResult } from './body-rates';
import { bodyLoadWrenches, BodyLoadWrenches, frameBodyLoad } from './body-load-wrenches';
import { finitePoint, localToWorld, Point } from './body-frame';
import { resolveMass } from './body-properties';
import { unitFactors } from './body-units';

export type MemberForceLoads =
  | {
      readonly ok: false;
      readonly reason: 'missing-rates' | 'invalid' | 'aggregate-properties' | 'load-owner';
    }
  | {
      readonly ok: true;
      readonly members: ReadonlyMap<BodyId, Extract<BodyLoadWrenches, { ok: true }>>;
    };

/** Material balances share the group's numerical origin, so internal wrenches cancel before transport. */
export function memberForceLoads(
  document: BodyDocument,
  system: CompiledBodySystem,
  frame: BodySolveFrame,
  poses: GroupPoses,
  groupId: BodyId,
  mode: 'static' | 'dynamic',
  gravity: Point,
  rates?: BodyRatesResult
): MemberForceLoads {
  if (!finitePoint(gravity)) return { ok: false, reason: 'invalid' };
  const group = system.groups.get(groupId),
    pose = poses.get(groupId);
  if (!group || !pose || !frame.groupOffsets.has(groupId)) return { ok: false, reason: 'invalid' };
  if (mode === 'dynamic' && !rates?.ok) return { ok: false, reason: 'missing-rates' };
  const materialCount = group.members.size - (group.members.has(WORLD) ? 1 : 0);
  const annotation = document.groups.find((item) => group.members.has(item.frameBody));
  const override = annotation?.mass;
  const weighted = gravity.x !== 0 || gravity.y !== 0;
  if (
    materialCount > 1 &&
    override &&
    ((mode === 'dynamic' &&
      (override.mass !== undefined ||
        override.inertia !== undefined ||
        override.center !== undefined)) ||
      (weighted && (override.mass !== undefined || override.center !== undefined)))
  )
    return { ok: false, reason: 'aggregate-properties' };
  const loads = document.forces.filter((load) => group.members.has(load.bodyId));
  if (
    loads.some(
      (load) =>
        load.legacyGroupScope &&
        load.legacyGroupScope.members.length > 1 &&
        (load.vector.x !== 0 || load.vector.y !== 0 || load.couple !== 0)
    )
  )
    return { ok: false, reason: 'load-owner' };
  const motion = rates?.ok ? rates.motions.get(groupId) : undefined;
  if (rates?.ok && !motion) return { ok: false, reason: 'missing-rates' };
  const factors = unitFactors(document.units);
  const bodies = new Map(document.bodies.map((body) => [body.id, body]));
  const members = new Map<BodyId, Extract<BodyLoadWrenches, { ok: true }>>();
  for (const [id, transform] of group.members) {
    if (id === WORLD) continue;
    const body = bodies.get(id);
    if (!body || body.kind !== 'material') return { ok: false, reason: 'invalid' };
    const member = { ...solveFramePoint(frame, groupId, transform), angle: transform.angle };
    const own = resolveMass(body, document.units);
    const center = localToWorld(member, own.center ?? own.displayCenter);
    // A single material has no distribution ambiguity; its group override is its whole inertia.
    const mass =
      materialCount === 1
        ? {
            ...group.mass,
            center: group.mass.center && solveFramePoint(frame, groupId, group.mass.center),
            displayCenter: solveFramePoint(frame, groupId, group.mass.displayCenter),
          }
        : { ...own, center: own.center && center, displayCenter: center };
    const applied = loads
      .filter((load) => load.bodyId === id)
      .map((load) => frameBodyLoad(load, member, pose.angle, factors));
    const result = bodyLoadWrenches(mass, pose, applied, mode, gravity, motion);
    if (!result.ok) return result;
    members.set(id, result);
  }
  return { ok: true, members };
}
