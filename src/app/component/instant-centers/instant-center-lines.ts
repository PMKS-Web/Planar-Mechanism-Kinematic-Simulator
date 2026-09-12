import { CenterGeometry } from '../../model/mechanism/instant-center-solver';
import { ModelPoint } from '../../model-frame.directive';

export interface ConstructionLine {
  id: string;
  sources: [string, string];
  start: ModelPoint;
  end: ModelPoint;
}

/** Clip the solver's actual Kennedy lines to the view, including finite-to-infinite pairs. */
export function instantCenterLines(
  geometry: CenterGeometry,
  corner: ModelPoint,
  opposite: ModelPoint,
  selectedIds?: ReadonlySet<string>
): ConstructionLine[] {
  const centers = new Map(geometry.centers.map((center) => [center.id, center]));
  const used = new Set<string>();
  const result: ConstructionLine[] = [];
  const left = (Math.min(corner.x, opposite.x) - geometry.origin[0]) / geometry.scale;
  const right = (Math.max(corner.x, opposite.x) - geometry.origin[0]) / geometry.scale;
  const bottom = (Math.min(corner.y, opposite.y) - geometry.origin[1]) / geometry.scale;
  const top = (Math.max(corner.y, opposite.y) - geometry.origin[1]) / geometry.scale;
  if (!(right > left && top > bottom)) return result;
  for (const center of geometry.centers) {
    if (selectedIds && !selectedIds.has(center.id)) continue;
    for (const sources of center.construction ?? []) {
      const id = JSON.stringify([...sources].sort());
      if (used.has(id)) continue;
      used.add(id);
      const p = centers.get(sources[0])?.point;
      const q = centers.get(sources[1])?.point;
      if (!p || !q) continue;
      const a = p[1] * q[2] - p[2] * q[1];
      const b = p[2] * q[0] - p[0] * q[2];
      const c = p[0] * q[1] - p[1] * q[0];
      const norm = Math.hypot(a, b);
      // Two infinite centers give the line at infinity, which has no visible segment.
      if (!(norm > 1e-12)) continue;
      const points: ModelPoint[] = [];
      const add = (x: number, y: number) => {
        const epsilon = 1e-8 * Math.max(right - left, top - bottom);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        if (x < left - epsilon || x > right + epsilon) return;
        if (y < bottom - epsilon || y > top + epsilon) return;
        if (points.some((point) => Math.hypot(point.x - x, point.y - y) < epsilon)) return;
        points.push({ x, y });
      };
      if (Math.abs(b) > norm * 1e-12) {
        add(left, -(a * left + c) / b);
        add(right, -(a * right + c) / b);
      }
      if (Math.abs(a) > norm * 1e-12) {
        add(-(b * bottom + c) / a, bottom);
        add(-(b * top + c) / a, top);
      }
      if (points.length < 2) continue;
      const model = (point: ModelPoint): ModelPoint => ({
        x: geometry.origin[0] + geometry.scale * point.x,
        y: geometry.origin[1] + geometry.scale * point.y,
      });
      result.push({ id, sources, start: model(points[0]), end: model(points[1]) });
    }
  }
  return result;
}
