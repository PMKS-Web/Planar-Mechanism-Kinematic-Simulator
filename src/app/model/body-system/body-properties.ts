import { add, cross, dot, Point, scale, subtract } from './body-frame';
import { BodyGeometry, MassSpecification, MaterialBody } from './material-body';
import { BodyUnits, unitFactors } from './body-units';

export interface AreaProperties {
  readonly area: number;
  readonly center: Point;
  readonly meanSquaredRadius: number;
}

export interface ResolvedMass {
  readonly mass: number;
  /** SI, expressed in the body's local axes. Zero mass has no physical center. */
  readonly center: Point | null;
  readonly displayCenter: Point;
  readonly inertia: number;
}

export function areaProperties(geometry: Exclude<BodyGeometry, { kind: 'bar' }>): AreaProperties {
  if (geometry.kind === 'circle') {
    return {
      area: Math.PI * geometry.radius ** 2,
      center: geometry.center,
      meanSquaredRadius: geometry.radius ** 2 / 2,
    };
  }
  const origin = geometry.vertices[0];
  let twiceArea = 0;
  let first = { x: 0, y: 0 };
  let polar = 0;
  for (let i = 0; i < geometry.vertices.length; i++) {
    // Translation avoids cancellation when a small shape has a distant local origin.
    const a = subtract(geometry.vertices[i], origin);
    const b = subtract(geometry.vertices[(i + 1) % geometry.vertices.length], origin);
    const wedge = cross(a, b);
    twiceArea += wedge;
    first = add(first, scale(add(a, b), wedge));
    polar += wedge * (dot(a, a) + dot(a, b) + dot(b, b));
  }
  if (twiceArea === 0) throw new Error('A material polygon must have nonzero area');
  const center = scale(first, 1 / (3 * twiceArea));
  return {
    area: Math.abs(twiceArea / 2),
    center: add(origin, center),
    meanSquaredRadius: Math.max(0, polar / (6 * twiceArea) - dot(center, center)),
  };
}

export function resolveMass(
  body: Pick<MaterialBody, 'geometry' | 'mass'>,
  units: BodyUnits
): ResolvedMass {
  const geometry = body.geometry;
  if (geometry.kind !== 'bar')
    return resolveSpecification(body.mass, areaProperties(geometry), units);
  if (body.mass.mass.mode === 'density') throw new Error('A centerline bar needs an explicit mass');
  const [a, b] = geometry.vertices;
  const d = subtract(b, a);
  // The established bar idealization is a slender rod; display thickness cannot change physics.
  return resolveSpecification(
    body.mass,
    { area: 0, center: scale(add(a, b), 0.5), meanSquaredRadius: dot(d, d) / 12 },
    units
  );
}

export function resolveSpecification(
  spec: MassSpecification,
  geometry: AreaProperties,
  units: BodyUnits
): ResolvedMass {
  const factors = unitFactors(units);
  const mass = spec.mass.value * factors.mass * (spec.mass.mode === 'density' ? geometry.area : 1);
  const center = spec.center.mode === 'automatic' ? geometry.center : spec.center.point;
  const offset = subtract(center, geometry.center);
  const inertia =
    spec.inertia.mode === 'explicit'
      ? spec.inertia.value * factors.inertia
      : mass * (geometry.meanSquaredRadius + dot(offset, offset)) * factors.length ** 2;
  const displayCenter = scale(center, factors.length);
  return { mass, center: mass === 0 ? null : displayCenter, displayCenter, inertia };
}
