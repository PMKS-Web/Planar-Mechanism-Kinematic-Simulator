import { BodyDocument } from './body-document';
import { MaterialBody } from './material-body';
import { Point, localToWorld } from './body-frame';

/** Paths follow authored material, never the number or order of relationships attached to it. */
export function bodyMaterialPath(body: MaterialBody): string {
  const g = body.geometry;
  if (g.kind === 'circle') {
    const { x, y } = g.center,
      r = g.radius;
    return `M ${x - r} ${y} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0`;
  }
  if (g.kind === 'polygon')
    return g.vertices.map((v, i) => `${i ? 'L' : 'M'} ${v.x} ${v.y}`).join(' ') + ' Z';
  const [a, b] = g.vertices,
    dx = b.x - a.x,
    dy = b.y - a.y,
    length = Math.hypot(dx, dy);
  const r = g.width / 2,
    nx = (-dy / length) * r,
    ny = (dx / length) * r;
  return `M ${a.x + nx} ${a.y + ny} L ${b.x + nx} ${b.y + ny} A ${r} ${r} 0 0 0 ${b.x - nx} ${b.y - ny} L ${a.x - nx} ${a.y - ny} A ${r} ${r} 0 0 0 ${a.x + nx} ${a.y + ny} Z`;
}

export function bodyDrawingPoints(document: BodyDocument): readonly Point[] {
  return document.bodies.flatMap((b) => {
    if (b.kind === 'world' || b.presentation.hidden) return [];
    const g = b.geometry;
    if (g.kind === 'circle') {
      const center = localToWorld(b.pose, g.center);
      return [
        { x: center.x - g.radius, y: center.y - g.radius },
        { x: center.x + g.radius, y: center.y + g.radius },
      ];
    }
    const points = g.vertices.map((p) => localToWorld(b.pose, p));
    if (g.kind === 'bar') {
      const radius = g.width / 2;
      return points.flatMap((p) => [
        { x: p.x - radius, y: p.y - radius },
        { x: p.x + radius, y: p.y + radius },
      ]);
    }
    return points;
  });
}
