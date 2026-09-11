import { validGeometry } from './body-geometry-validation';
import { BodyDocument } from './body-document';
import { BodyId } from './body-id';
import { add, finitePoint, localToWorld, Point, Pose, scale, subtract } from './body-frame';
import { resolveMass, ResolvedMass } from './body-properties';
import { BodyUnits, unitFactors } from './body-units';
import { applyGroupMassOverride } from './group-properties';
import { compileWeldFrames, WeldFrameFailure, WeldFrameGroup } from './weld-frames';

export interface WeldGroup extends WeldFrameGroup {
  /** kg, kg*m², and SI centers in the group-local axes; pose/members use document units. */
  readonly materialMass: ResolvedMass;
  readonly mass: ResolvedMass;
}

export type WeldCompilation =
  | WeldFrameFailure
  | {
      readonly ok: false;
      readonly code: 'invalid-properties' | 'invalid-group-annotation';
      readonly bodyId?: BodyId;
    }
  | {
      readonly ok: true;
      readonly groups: readonly WeldGroup[];
      readonly groupOf: ReadonlyMap<BodyId, WeldGroup>;
    };

/** Geometry compilation remains available when properties need an authoring correction. */
export function compileWeldGroups(document: BodyDocument): WeldCompilation {
  const frames = compileWeldFrames(document);
  if (!frames.ok) return frames;
  const annotated = new Set<string>();
  for (const annotation of document.groups) {
    const group = frames.groupOf.get(annotation.frameBody);
    if (
      !group ||
      annotated.has(group.key) ||
      annotation.members.length !== group.members.size ||
      new Set(annotation.members).size !== annotation.members.length ||
      annotation.members.some((id) => !group.members.has(id))
    )
      return { ok: false, code: 'invalid-group-annotation' };
    annotated.add(group.key);
  }
  const groups: WeldGroup[] = [];
  const groupOf = new Map<BodyId, WeldGroup>();
  for (const frame of frames.groups) {
    let materialMass: ResolvedMass;
    let mass: ResolvedMass;
    try {
      materialMass = aggregateMaterialMass(document, frame.members);
      const annotation = document.groups.find((item) => frame.members.has(item.frameBody));
      mass = applyGroupMassOverride(materialMass, annotation, frame.members, document.units);
      if (![materialMass, mass].every(validResolvedMass))
        throw new Error('Invalid mass properties');
    } catch {
      return { ok: false, code: 'invalid-properties', bodyId: frame.frameBody };
    }
    const group = { ...frame, materialMass, mass };
    groups.push(group);
    for (const id of frame.members.keys()) groupOf.set(id, group);
  }
  return { ok: true, groups, groupOf };
}

/** A document pose cannot directly transform an SI mass center. */
export function groupPoseSI(group: WeldFrameGroup, units: BodyUnits): Pose {
  return { ...scale(group.pose, unitFactors(units).length), angle: group.pose.angle };
}

function validResolvedMass(value: ResolvedMass): boolean {
  return (
    Number.isFinite(value.mass) &&
    value.mass >= 0 &&
    Number.isFinite(value.inertia) &&
    value.inertia >= 0 &&
    finitePoint(value.displayCenter) &&
    (value.center === null || finitePoint(value.center))
  );
}

export function aggregateMaterialMass(
  document: Pick<BodyDocument, 'units' | 'bodies'>,
  members: ReadonlyMap<BodyId, Pose>
): ResolvedMass {
  const length = unitFactors(document.units).length;
  const material = new Map(document.bodies.map((body) => [body.id, body]));
  const entries: { properties: ResolvedMass; center: Point }[] = [];
  for (const [id, transform] of members) {
    const body = material.get(id)!;
    if (body.kind === 'world') continue;
    if (!validGeometry(body.geometry)) throw new Error('Invalid material geometry');
    const properties = resolveMass(body, document.units);
    if (!validResolvedMass(properties)) throw new Error('Invalid material mass');
    const frameSI = { ...scale(transform, length), angle: transform.angle };
    entries.push({ properties, center: localToWorld(frameSI, properties.displayCenter) });
  }
  const mass = entries.reduce((sum, item) => sum + item.properties.mass, 0);
  const first = entries.reduce((sum, item) => add(sum, scale(item.center, item.properties.mass)), {
    x: 0,
    y: 0,
  });
  const displayCenter =
    mass === 0
      ? scale(
          entries.reduce((sum, item) => add(sum, item.center), { x: 0, y: 0 }),
          1 / Math.max(1, entries.length)
        )
      : scale(first, 1 / mass);
  const inertia = entries.reduce((sum, item) => {
    const d = subtract(item.center, displayCenter);
    return sum + item.properties.inertia + item.properties.mass * (d.x ** 2 + d.y ** 2);
  }, 0);
  return { mass, center: mass === 0 ? null : displayCenter, displayCenter, inertia };
}
