import { BodyDocument } from './body-document';
import { BodyId, JointId, compareRecordIds, WORLD } from './body-id';
import { CompiledBodySystem } from './compiled-body-system';

export interface FixedForceComponent {
  readonly key: string;
  readonly bodies: readonly BodyId[];
  readonly joints: readonly JointId[];
}

/** WORLD transmits no material balance between otherwise independent foundations. */
export function fixedForceComponents(
  document: BodyDocument,
  system: CompiledBodySystem
): readonly FixedForceComponent[] {
  const ids = document.bodies
    .filter((body) => body.id !== WORLD && system.groups.get(system.groupOf.get(body.id)!)!.fixed)
    .map((body) => body.id)
    .sort(compareRecordIds);
  const adjacency = new Map(ids.map((id) => [id, new Set<BodyId>()]));
  for (const joint of document.joints)
    if (adjacency.has(joint.bodyA) && adjacency.has(joint.bodyB)) {
      adjacency.get(joint.bodyA)!.add(joint.bodyB);
      adjacency.get(joint.bodyB)!.add(joint.bodyA);
    }
  const visited = new Set<BodyId>(),
    components: FixedForceComponent[] = [];
  for (const root of ids) {
    if (visited.has(root)) continue;
    const queue = [root];
    visited.add(root);
    for (let i = 0; i < queue.length; i++)
      for (const neighbor of adjacency.get(queue[i])!)
        if (!visited.has(neighbor)) {
          queue.push(neighbor);
          visited.add(neighbor);
        }
    const bodies = queue.sort(compareRecordIds),
      owns = new Set([WORLD, ...bodies]);
    const joints = document.joints
      .filter((joint) => owns.has(joint.bodyA) && owns.has(joint.bodyB))
      .map((joint) => joint.id)
      .sort(compareRecordIds);
    components.push({ key: JSON.stringify(bodies), bodies, joints });
  }
  return components;
}
