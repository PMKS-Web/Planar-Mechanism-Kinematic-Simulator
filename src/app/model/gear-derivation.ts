import { GearAssembly, gearPlane } from './gear';
import { GearDrive, gearBodyFor } from './mechanism/gear-drive';

/** Reduce tooth counts for display only; motion and overall ratios remain compiler-owned. */
function toothRatio(from: number, to: number): string {
  let a = BigInt(from),
    b = BigInt(to);
  while (b) [a, b] = [b, a % b];
  return `-${BigInt(from) / a}/${BigInt(to) / a}`;
}

/** An authored mesh route explains the compiler result; it never prescribes motion. */
export function gearDerivation(assembly: GearAssembly, plan: GearDrive | undefined): string[] {
  if (!plan) return [];
  const gears = new Map(assembly.gears.map((g) => [g.id, g]));
  const root = assembly.gears.find((g) => g.centerJointId === plan.inputJointId)!;
  const name = (id: string) => gears.get(id)!.name || id;
  const lines = assembly.meshes.map((mesh) => {
    const a = gears.get(mesh.gearAId)!,
      b = gears.get(mesh.gearBId)!;
    return `Plane ${gearPlane(a) + 1}: ${name(a.id)} ${a.teeth}T → ${name(b.id)} ${b.teeth}T. Relative angular ratio = -${a.teeth}/${b.teeth} = ${toothRatio(a.teeth, b.teeth)}.`;
  });
  for (const body of plan.bodies) {
    const siblings = assembly.gears.filter((g) => g.hostLinkId === body.hostLinkId);
    if (siblings.length > 1)
      lines.push(
        `Same shaft ${body.hostLinkId}: ${siblings.map((g) => name(g.id)).join(' and ')} share angular travel, velocity and acceleration.`
      );
  }
  const paths = new Map<string, string[]>([[root.hostLinkId, []]]);
  const queue = [root.hostLinkId];
  for (const host of queue) {
    for (const mesh of assembly.meshes) {
      let a = gears.get(mesh.gearAId)!,
        b = gears.get(mesh.gearBId)!;
      if (b.hostLinkId === host) [a, b] = [b, a];
      if (a.hostLinkId !== host || paths.has(b.hostLinkId)) continue;
      paths.set(b.hostLinkId, [...paths.get(host)!, toothRatio(a.teeth, b.teeth)]);
      queue.push(b.hostLinkId);
    }
  }
  for (const gear of assembly.gears) {
    const factors = paths.get(gear.hostLinkId);
    if (!factors?.length) continue;
    const { numerator, denominator } = gearBodyFor(plan, gear.id)!.ratio;
    const sameDirection = numerator > 0n;
    lines.push(
      `${name(gear.id)} / ${name(root.id)}: ${factors.map((f) => '(' + f + ')').join(' × ')} = ${sameDirection ? '+' : ''}${numerator}/${denominator}. ${sameDirection ? 'Same' : 'Opposite'} rotation direction; this is also the travel and speed ratio.`
    );
  }
  return lines;
}
