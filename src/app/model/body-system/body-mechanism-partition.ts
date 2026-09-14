import { BodyDocument } from './body-document';
import { BodyEditCommand, BodySelectionRef } from './body-edit-types';
import { BodyId, WORLD, compareRecordIds } from './body-id';
import { nativeCommand } from './body-joint-interaction';

/**
 * One machine on a native drawing: the material bodies joined to each other,
 * with ground left out of the joining.
 *
 * The public menu offers "Delete entire mechanism" on any part of a machine and
 * names the machine and its joint count before the click. It asks
 * `MechanismService.partitions` for that; the native document has no solver
 * standing behind the menu, so the same question is answered here from the
 * connections themselves. Two cranks on a shared frame are two machines because
 * the frame is ground, exactly as the public partitioner has it.
 */
export interface NativeMechanism {
  /** M1, M2 ... in stored order, the way the public partitions are named. */
  readonly id: string;
  readonly bodies: readonly BodyId[];
  /** How many joint marks a reader can see on it — a shared pin counted once. */
  readonly joints: number;
}

export function nativeMechanisms(document: BodyDocument): readonly NativeMechanism[] {
  const material = document.bodies
    .filter((body) => body.kind === 'material')
    .map((body) => body.id)
    .sort(compareRecordIds);
  const parent = new Map<BodyId, BodyId>(material.map((id) => [id, id]));
  const find = (id: BodyId): BodyId => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    return root;
  };
  for (const joint of document.joints) {
    if (joint.bodyA === WORLD || joint.bodyB === WORLD) continue;
    const a = find(joint.bodyA),
      b = find(joint.bodyB);
    if (a !== b) parent.set(a, b);
  }
  const groups = new Map<BodyId, BodyId[]>();
  for (const id of material) {
    const root = find(id);
    groups.set(root, [...(groups.get(root) ?? []), id]);
  }
  return [...groups.values()].map((bodies, index) => ({
    id: `M${index + 1}`,
    bodies,
    joints: countJoints(document, new Set(bodies)),
  }));
}

/** The machine this body belongs to, or nothing when it is joined to none. */
export function nativeMechanismOf(
  document: BodyDocument,
  bodyId: BodyId | undefined
): NativeMechanism | undefined {
  if (!bodyId) return undefined;
  const found = nativeMechanisms(document).find((one) => one.bodies.includes(bodyId));
  // A body joined to nothing is a part rather than a machine, and the row says
  // so instead of offering to delete a mechanism of one.
  return found && found.joints > 0 ? found : undefined;
}

/** Everything in the machine, as targets a cylinder's members survive. */
export function nativeMechanismDelete(
  document: BodyDocument,
  machine: NativeMechanism
): BodyEditCommand {
  const targets: BodySelectionRef[] = [];
  const seen = new Set<string>();
  for (const id of machine.bodies) {
    // A cylinder's barrel and rod refuse to go one at a time: the assembly is
    // the part, so it is the target.
    const assembly = document.assemblies.find((one) => one.barrel === id || one.rod === id);
    const target: BodySelectionRef = assembly
      ? { kind: 'assembly', id: assembly.id }
      : { kind: 'body', id };
    const key = `${target.kind}:${'id' in target ? target.id : ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push(target);
  }
  return nativeCommand({ kind: 'delete', targets });
}

/** A pin shared by several members draws one mark, so it counts once here too. */
function countJoints(document: BodyDocument, bodies: ReadonlySet<BodyId>): number {
  const seen = new Set<string>();
  for (const joint of document.joints) {
    if (!bodies.has(joint.bodyA) && !bodies.has(joint.bodyB)) continue;
    const junction = document.junctions.find((pin) => pin.joints.includes(joint.id));
    seen.add(junction?.id ?? joint.id);
  }
  return seen.size;
}
