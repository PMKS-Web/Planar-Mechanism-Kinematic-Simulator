import { BodyDocument } from './body-document';
import { MaterialBody } from './material-body';
import { localToWorld } from './body-frame';
import { INK_FLIPS_AT, luminanceOf } from '../contrast';
import { resolveMass } from './body-properties';

/** Labels sit on material, not on a custom mass center that may lie outside it. */
export function bodyLabelMark(
  document: BodyDocument,
  body: MaterialBody,
  showCenter: boolean,
  pixel: number
) {
  const cylinder = document.assemblies.find(
    (assembly) => assembly.barrel === body.id || assembly.rod === body.id
  );
  if (cylinder?.rod === body.id) return undefined;
  const geometry = body.geometry;
  const vertices = geometry.kind === 'circle' ? [geometry.center] : geometry.vertices;
  const points = vertices.map((point) => localToWorld(body.pose, point));
  const point = {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
  const name = cylinder?.label ?? body.label;
  let angle = 0;
  if (geometry.kind === 'bar') {
    const dx = points[1].x - points[0].x,
      dy = points[1].y - points[0].y;
    const span = Math.hypot(dx, dy);
    if (name.length > 2) {
      angle = (-Math.atan2(dy, dx) * 180) / Math.PI;
      if (angle > 90) angle -= 180;
      if (angle < -90) angle += 180;
      angle = Math.round(angle * 10) / 10;
    }
    if (!cylinder && showCenter && resolveMass(body, document.units).mass > 0 && span > 0) {
      const up = dy > 1e-9 || (Math.abs(dy) <= 1e-9 && dx > 0) ? 1 : -1;
      const axis = { x: (up * dx) / span, y: (up * dy) / span };
      const font = document.settings.objectScale * 0.2;
      const half = angle
        ? name.length * font * 0.32
        : Math.abs(axis.x) * name.length * font * 0.32 + Math.abs(axis.y) * font * 0.4;
      const offset = document.settings.objectScale * 0.16 + 4 * pixel + half;
      point.x += axis.x * offset;
      point.y += axis.y * offset;
    }
  }
  return {
    point,
    name,
    angle,
    ink: luminanceOf(body.presentation.fill) > INK_FLIPS_AT ? 'black' : 'white',
  };
}
