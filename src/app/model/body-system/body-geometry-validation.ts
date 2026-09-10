import { cross, finitePoint, Point, subtract } from './body-frame';
import { areaProperties } from './body-properties';
import { BodyGeometry } from './material-body';

export function validGeometry(geometry: BodyGeometry): boolean {
  if (geometry.kind === 'circle')
    return finitePoint(geometry.center) && Number.isFinite(geometry.radius) && geometry.radius > 0;
  if (!['polygon', 'bar'].includes(geometry.kind) || !geometry.vertices.every(finitePoint))
    return false;
  if (geometry.kind === 'bar')
    return (
      geometry.vertices.length === 2 &&
      Number.isFinite(geometry.width) &&
      geometry.width > 0 &&
      (geometry.vertices[0].x !== geometry.vertices[1].x ||
        geometry.vertices[0].y !== geometry.vertices[1].y)
    );
  if (geometry.kind === 'polygon' && !simplePolygon(geometry.vertices)) return false;
  try {
    const properties = areaProperties(geometry);
    return (
      Number.isFinite(properties.area) &&
      properties.area > 0 &&
      finitePoint(properties.center) &&
      Number.isFinite(properties.meanSquaredRadius)
    );
  } catch {
    return false;
  }
}

function simplePolygon(points: readonly Point[]): boolean {
  if (points.length < 3) return false;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (a.x === b.x && a.y === b.y) return false;
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      if (intersects(a, b, points[j], points[(j + 1) % points.length])) return false;
    }
  }
  return true;
}

function intersects(a: Point, b: Point, c: Point, d: Point): boolean {
  const side = (p: Point, q: Point, r: Point) => Math.sign(cross(subtract(q, p), subtract(r, p)));
  const inBounds = (p: Point, q: Point, r: Point) =>
    r.x >= Math.min(p.x, q.x) &&
    r.x <= Math.max(p.x, q.x) &&
    r.y >= Math.min(p.y, q.y) &&
    r.y <= Math.max(p.y, q.y);
  const ac = side(a, b, c),
    ad = side(a, b, d),
    ca = side(c, d, a),
    cb = side(c, d, b);
  return (
    (ac * ad < 0 && ca * cb < 0) ||
    (ac === 0 && inBounds(a, b, c)) ||
    (ad === 0 && inBounds(a, b, d)) ||
    (ca === 0 && inBounds(c, d, a)) ||
    (cb === 0 && inBounds(c, d, b))
  );
}
