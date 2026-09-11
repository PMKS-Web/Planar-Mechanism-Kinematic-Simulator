import { BodyDocument } from './body-document';
import { BodyId, WORLD } from './body-id';
import { Point, scale } from './body-frame';
import { CompiledBodyGroup, CompiledBodySystem } from './compiled-body-system';
import { ForceDocument } from './force-document';
import { FixedForceComponent } from './fixed-force-components';
import { aggregateMaterialMass } from './weld-groups';
import { unitFactors } from './body-units';

export type FixedForceProjection =
  | { readonly ok: false; readonly reason: 'aggregate-properties' | 'load-owner' }
  | { readonly ok: true; readonly document: ForceDocument; readonly system: CompiledBodySystem };

/** Restrict equilibrium to material connections, retaining the original numerical frames and all owned support rows. */
export function fixedForceProjection(
  document: BodyDocument,
  system: CompiledBodySystem,
  component: FixedForceComponent,
  gravity: Point
): FixedForceProjection {
  const owns = new Set([WORLD, ...component.bodies]),
    jointIds = new Set(component.joints);
  const touches = (ids: readonly BodyId[]) => ids.some((id) => id !== WORLD && owns.has(id));
  const partial = (ids: readonly BodyId[]) => touches(ids) && ids.some((id) => !owns.has(id));
  if (
    (gravity.x !== 0 || gravity.y !== 0) &&
    document.groups.some(
      (group) =>
        partial(group.members) &&
        (group.mass?.mass !== undefined || group.mass?.center !== undefined)
    )
  )
    return { ok: false, reason: 'aggregate-properties' };
  if (
    document.forces.some(
      (load) =>
        load.legacyGroupScope &&
        partial(load.legacyGroupScope.members.map((member) => member.bodyId)) &&
        (load.vector.x !== 0 || load.vector.y !== 0 || load.couple !== 0)
    )
  )
    return { ok: false, reason: 'load-owner' };
  const groups = new Map<BodyId, CompiledBodyGroup>();
  const length = unitFactors(document.units).length;
  for (const group of system.groups.values()) {
    const members = new Map([...group.members].filter(([id]) => owns.has(id)));
    if (!members.size) continue;
    if (members.size === group.members.size) {
      groups.set(group.id, group);
      continue;
    }
    // Only WORLD may join disconnected material through ground. Its projected mass
    // must not become the mass of a lone selected bracket on a different foundation.
    const materialMass = aggregateMaterialMass(
      document,
      new Map(
        [...members].map(([id, pose]) => [id, { ...scale(pose, 1 / length), angle: pose.angle }])
      )
    );
    groups.set(group.id, { ...group, members, mass: materialMass, materialMass });
  }
  const view: ForceDocument = {
    units: document.units,
    bodies: document.bodies.filter((body) => owns.has(body.id)),
    joints: document.joints.filter((joint) => jointIds.has(joint.id)),
    forces: document.forces.filter((load) => owns.has(load.bodyId)),
    groups: document.groups.filter((group) => group.members.every((id) => owns.has(id))),
  };
  return {
    ok: true,
    document: view,
    system: {
      ...system,
      groups,
      partitions: [],
      fixedRows: system.fixedRows.filter((row) => jointIds.has(row.jointId)),
      fixedDrivers: system.fixedDrivers.filter((driver) => jointIds.has(driver.row.jointId)),
      fixedLimits: system.fixedLimits.filter((limit) => jointIds.has(limit.row.jointId)),
    },
  };
}
