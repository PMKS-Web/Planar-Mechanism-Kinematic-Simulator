import { Link, RealLink } from './link';
import { uniformBodyOf } from './uniform-body';

/** The integration domain, read from the same calculation as the mass properties.
 * Compound members stay separate: overlaps are not a Boolean union of material. */
export function massGeometryOf(body: Link): MassGeometry[] {
  if (body instanceof RealLink && body.subset.length)
    return body.subset.filter((part) => part instanceof RealLink).flatMap(massGeometryOf);
  const shape = uniformBodyOf(body.joints);
  const c = shape.calculation;
  const kind = body instanceof RealLink ? c.kind : 'point';
  const points =
    kind === 'plate' && c.kind === 'plate'
      ? c.vertices.map((p) => ({ x: p.x + c.origin.x, y: p.y + c.origin.y }))
      : kind === 'rod' && c.kind === 'rod'
        ? c.endpoints
        : [shape.centroid];
  return [{ body, kind, points, center: shape.centroid }];
}

export interface MassGeometry {
  body: Link;
  kind: 'rod' | 'plate' | 'point';
  points: { x: number; y: number }[];
  center: { x: number; y: number };
}
