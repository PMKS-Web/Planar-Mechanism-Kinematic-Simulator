import { BodyDocument } from './body-document';
import { BodyId, compareRecordIds, JointId, WORLD } from './body-id';
import {
  add,
  compose,
  IDENTITY_POSE,
  inverse,
  localToWorld,
  Point,
  Pose,
  scale,
  subtract,
} from './body-frame';
import { resolveMass, ResolvedMass } from './body-properties';
import { unitFactors } from './body-units';
import { applyGroupMassOverride } from './group-properties';

export interface WeldGroup {
  readonly key: string;
  readonly frameBody: BodyId;
  readonly fixed: boolean;
  readonly pose: Pose;
  readonly members: ReadonlyMap<BodyId, Pose>;
  readonly materialMass: ResolvedMass;
  readonly mass: ResolvedMass;
}

export type WeldCompilation =
  | {
      readonly ok: true;
      readonly groups: readonly WeldGroup[];
      readonly groupOf: ReadonlyMap<BodyId, WeldGroup>;
    }
  | {
      readonly ok: false;
      readonly code: 'weld-cycle' | 'missing-body';
      readonly jointId?: JointId;
    };

interface Edge {
  readonly to: BodyId;
  readonly transform: Pose;
  readonly jointId: JointId;
}

/** Condensation changes solver coordinates; it never replaces a material record. */
export function compileWeldGroups(document: BodyDocument): WeldCompilation {
  const bodies = new Map(document.bodies.map((body) => [body.id, body]));
  const edges = new Map<BodyId, Edge[]>(document.bodies.map((body) => [body.id, []]));
  for (const joint of [...document.joints].sort((a, b) => compareRecordIds(a.id, b.id))) {
    if (joint.kind !== 'weld') continue;
    if (!bodies.has(joint.bodyA) || !bodies.has(joint.bodyB)) {
      return { ok: false, code: 'missing-body', jointId: joint.id };
    }
    edges.get(joint.bodyA)!.push({ to: joint.bodyB, transform: joint.rest, jointId: joint.id });
    edges
      .get(joint.bodyB)!
      .push({ to: joint.bodyA, transform: inverse(joint.rest), jointId: joint.id });
  }
  const groups: WeldGroup[] = [];
  const groupOf = new Map<BodyId, WeldGroup>();
  const order = [...bodies.keys()].sort((a, b) =>
    a === b ? 0 : a === WORLD ? -1 : b === WORLD ? 1 : compareRecordIds(a, b)
  );
  for (const root of order) {
    if (groupOf.has(root)) continue;
    const transforms = new Map<BodyId, Pose>([[root, IDENTITY_POSE]]);
    const queue = [root];
    for (let i = 0; i < queue.length; i++) {
      const from = queue[i];
      for (const edge of edges.get(from)!) {
        const candidate = compose(transforms.get(from)!, edge.transform);
        const previous = transforms.get(edge.to);
        if (previous) {
          if (!sameTransform(previous, candidate))
            return { ok: false, code: 'weld-cycle', jointId: edge.jointId };
        } else {
          transforms.set(edge.to, candidate);
          queue.push(edge.to);
        }
      }
    }
    const members = new Map([...transforms].sort(([a], [b]) => compareRecordIds(a, b)));
    const materialMass = aggregateMaterial(document, members);
    const annotation = document.groups.find(
      (item) => item.members.length === members.size && item.members.every((id) => members.has(id))
    );
    const group: WeldGroup = {
      key: JSON.stringify([...members.keys()]),
      frameBody: root,
      fixed: root === WORLD,
      pose: bodies.get(root)!.pose,
      members,
      materialMass,
      mass: applyGroupMassOverride(materialMass, annotation, members, document.units),
    };
    groups.push(group);
    for (const id of members.keys()) groupOf.set(id, group);
  }
  return { ok: true, groups, groupOf };
}

function sameTransform(a: Pose, b: Pose): boolean {
  const size = Math.max(1, Math.hypot(a.x, a.y), Math.hypot(b.x, b.y));
  return Math.hypot(a.x - b.x, a.y - b.y) <= 1e-10 * size && Math.abs(a.angle - b.angle) <= 1e-10;
}

function aggregateMaterial(
  document: BodyDocument,
  members: ReadonlyMap<BodyId, Pose>
): ResolvedMass {
  const length = unitFactors(document.units).length;
  const material = new Map(document.bodies.map((body) => [body.id, body]));
  const entries: { properties: ResolvedMass; center: Point }[] = [];
  for (const [id, transform] of members) {
    const body = material.get(id)!;
    if (body.kind === 'world') continue;
    const properties = resolveMass(body, document.units);
    const frameSI = { ...scale(transform, length), angle: transform.angle };
    entries.push({ properties, center: localToWorld(frameSI, properties.displayCenter) });
  }
  const mass = entries.reduce((sum, item) => sum + item.properties.mass, 0);
  const first = entries.reduce((sum, item) => add(sum, scale(item.center, item.properties.mass)), {
    x: 0,
    y: 0,
  });
  const displayCenter = mass === 0 ? { x: 0, y: 0 } : scale(first, 1 / mass);
  const inertia = entries.reduce((sum, item) => {
    const d = subtract(item.center, displayCenter);
    return sum + item.properties.inertia + item.properties.mass * (d.x ** 2 + d.y ** 2);
  }, 0);
  return { mass, center: mass === 0 ? null : displayCenter, displayCenter, inertia };
}
