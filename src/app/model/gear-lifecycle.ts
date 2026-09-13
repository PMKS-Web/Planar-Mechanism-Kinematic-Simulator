import { Gear, GearAssembly } from './gear';
import { Joint } from './joint';
import { Link } from './link';

/** A known body gaining/losing a tracer keeps ownership when its letter-based ID changes. */
export function renamedGearHost(gears: Gear[], before: string, after: string): Gear[] {
  return gears.map((gear) => (gear.hostLinkId === before ? { ...gear, hostLinkId: after } : gear));
}

export function gearHostAt(
  assembly: GearAssembly,
  joints: readonly Joint[],
  links: readonly Link[]
): boolean {
  return assembly.gears.some((gear) =>
    links.some(
      (link) => link.id === gear.hostLinkId && joints.some((joint) => link.joints.includes(joint))
    )
  );
}

export const GEAR_HOST_REFUSAL =
  'Remove all gear attachments before welding, unwelding, merging, or changing the host type. The host body must keep its identity.';

/** Copy only internal relationships; no copied rotor can acquire an edge to an original. */
export function duplicateGears(
  assembly: GearAssembly,
  jointMap: ReadonlyMap<Joint, Joint>,
  linkMap: ReadonlyMap<Link, Link>
): GearAssembly {
  const ids = new Map<string, string>();
  const gears = assembly.gears.flatMap((gear) => {
    const host = [...linkMap].find(([link]) => link.id === gear.hostLinkId)?.[1];
    const center = [...jointMap].find(([joint]) => joint.id === gear.centerJointId)?.[1];
    const reference = [...jointMap].find(([joint]) => joint.id === gear.referenceJointId)?.[1];
    if (!host || !center || !reference) return [];
    const id = 'G-' + crypto.randomUUID();
    ids.set(gear.id, id);
    return [
      {
        ...gear,
        id,
        hostLinkId: host.id,
        centerJointId: center.id,
        referenceJointId: reference.id,
      },
    ];
  });
  const meshes = assembly.meshes.flatMap((mesh) => {
    const a = ids.get(mesh.gearAId),
      b = ids.get(mesh.gearBId);
    return a && b ? [{ ...mesh, id: 'GM-' + crypto.randomUUID(), gearAId: a, gearBId: b }] : [];
  });
  return { gears, meshes };
}

/** Run after structural deletion, before a removed ID can be assigned again. */
export function survivingGears(
  assembly: GearAssembly,
  joints: Joint[],
  links: Link[]
): GearAssembly {
  const gears = assembly.gears.filter((gear) => {
    const host = links.find((link) => link.id === gear.hostLinkId);
    return (
      host?.joints.some((j) => j.id === gear.centerJointId) &&
      host.joints.some((j) => j.id === gear.referenceJointId) &&
      joints.some((j) => j.id === gear.centerJointId) &&
      joints.some((j) => j.id === gear.referenceJointId)
    );
  });
  const ids = new Set(gears.map((gear) => gear.id));
  return {
    gears,
    meshes: assembly.meshes.filter((mesh) => ids.has(mesh.gearAId) && ids.has(mesh.gearBId)),
  };
}
