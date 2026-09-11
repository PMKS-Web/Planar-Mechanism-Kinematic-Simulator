import { add, localToWorld, Point, rotate, scale, subtract, worldToLocal } from './body-frame';
import { VertexId, compareRecordIds } from './body-id';
import { areaProperties } from './body-properties';
import { BodyGeometry, MaterialBody, MassSpecification } from './material-body';

type ExplicitCenter = Extract<MassSpecification['center'], { mode: 'explicit' }>;
type Axis = readonly [VertexId, VertexId];

export function geometryCenter(geometry: BodyGeometry): Point {
  return geometry.kind === 'bar'
    ? scale(add(geometry.vertices[0], geometry.vertices[1]), 0.5)
    : areaProperties(geometry).center;
}

/** A custom center follows one named shape direction, never whichever pair happens to be longest today. */
export function deformBodyCenter(
  before: MaterialBody,
  after: MaterialBody,
  center: ExplicitCenter
): ExplicitCenter {
  const axis = center.editAxis ?? geometryAxis(before.geometry);
  const oldAngle = axis && axisAngle(before.geometry, axis),
    newAngle = axis && axisAngle(after.geometry, axis);
  const { editAxis, ...rest } = center;
  if (axis && (oldAngle === undefined || newAngle === undefined)) {
    const nextAxis = geometryAxis(after.geometry);
    return {
      ...rest,
      point: worldToLocal(after.pose, localToWorld(before.pose, center.point)),
      ...(nextAxis ? { editAxis: nextAxis } : {}),
    };
  }
  return {
    ...rest,
    point: add(
      geometryCenter(after.geometry),
      rotate(
        subtract(center.point, geometryCenter(before.geometry)),
        (newAngle ?? 0) - (oldAngle ?? 0)
      )
    ),
    ...(axis ? { editAxis: axis } : {}),
  };
}
function geometryAxis(geometry: BodyGeometry): Axis | undefined {
  if (geometry.kind === 'circle') return undefined;
  const vertices = [...geometry.vertices].sort((a, b) => compareRecordIds(a.id, b.id));
  let length = 0,
    axis: Axis | undefined;
  for (let i = 0; i < vertices.length; i++)
    for (let j = i + 1; j < vertices.length; j++) {
      const a = vertices[i],
        b = vertices[j],
        span = Math.hypot(b.x - a.x, b.y - a.y);
      if (span > length) {
        length = span;
        axis = [a.id, b.id];
      }
    }
  return axis;
}
function axisAngle(geometry: BodyGeometry, axis: Axis): number | undefined {
  if (geometry.kind === 'circle') return undefined;
  const a = geometry.vertices.find((v) => v.id === axis[0]),
    b = geometry.vertices.find((v) => v.id === axis[1]);
  return a && b && (a.x !== b.x || a.y !== b.y) ? Math.atan2(b.y - a.y, b.x - a.x) : undefined;
}
