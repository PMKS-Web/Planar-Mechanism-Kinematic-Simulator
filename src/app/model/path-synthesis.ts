import { ModelPoint } from '../model-frame.directive';

/** The target is ordered, so deleting or reordering a point cannot leave broken neighbor links. */
export class PathSynthesisDesign {
  points: ModelPoint[] = [];
  closed = true;
  smooth = true;

  get curve(): string {
    return pathCurve(this.points, this.closed, this.smooth);
  }

  convertLengths(scale: number): void {
    this.points = this.points.map((p) => ({ x: p.x * scale, y: p.y * scale }));
  }
}

/** PMKSConversion's Catmull–Rom preview, with wrapped neighbors at a closed seam. */
export function pathCurve(points: readonly ModelPoint[], closed: boolean, smooth: boolean): string {
  if (points.length < 2) return '';
  const count = points.length;
  const at = (index: number) =>
    points[closed ? (index + count) % count : Math.max(0, Math.min(count - 1, index))];
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < (closed ? count : count - 1); i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    if (smooth && count > 2) {
      d += ` C ${p1.x + (p2.x - p0.x) / 6} ${p1.y + (p2.y - p0.y) / 6}`;
      d += ` ${p2.x - (p3.x - p1.x) / 6} ${p2.y - (p3.y - p1.y) / 6} ${p2.x} ${p2.y}`;
    } else {
      d += ` L ${p2.x} ${p2.y}`;
    }
  }
  return d + (closed ? ' Z' : '');
}

export const PATH_PRESETS = [
  'Horizontal Line',
  'Vertical Line',
  'Rising Line',
  'Falling Line',
  'Bean',
  'Figure Eight',
  'Infinity',
] as const;
export type PathPreset = (typeof PATH_PRESETS)[number];

/** Shape choices recovered from PMKSConversion's 19596bd shape picker. */
export function pathPreset(
  name: PathPreset,
  center: ModelPoint,
  radius: number
): PathSynthesisDesign {
  const result = new PathSynthesisDesign();
  result.closed = !name.endsWith('Line');
  result.smooth = result.closed;
  const line: Record<string, ModelPoint> = {
    'Horizontal Line': { x: 1, y: 0 },
    'Vertical Line': { x: 0, y: 1 },
    'Rising Line': { x: 1, y: 1 },
    'Falling Line': { x: 1, y: -1 },
  };
  const direction = line[name];
  const normalized = direction
    ? [-1, 0, 1].map((t) => ({ x: t * direction.x, y: t * direction.y }))
    : Array.from({ length: 12 }, (_, i) => {
        const t = (i * Math.PI * 2) / 12;
        if (name === 'Bean')
          return { x: Math.cos(t), y: 0.65 * Math.sin(t) - 0.3 * Math.cos(2 * t) };
        const p = { x: Math.cos(t), y: Math.sin(2 * t) * 0.55 };
        return name === 'Figure Eight' ? { x: p.y, y: p.x } : p;
      });
  result.points = normalized.map((p) => ({
    x: center.x + p.x * radius,
    y: center.y + p.y * radius,
  }));
  return result;
}
