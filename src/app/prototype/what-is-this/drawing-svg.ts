import { Cylinder } from '../../model/cylinder';
import { Joint, PrisJoint } from '../../model/joint';
import { Link } from '../../model/link';
import { isGroundPin, Samples } from './fact-math';

/**
 * PROTOTYPE -- a plain picture of one machine for a model that can see.
 *
 * The start pose, every joint's path faintly, and the traced paths boldly;
 * letters match the fact sheet. No template name, no backdrop, no colors from
 * the drawing, so the picture can only say what the geometry says.
 */
export interface DrawingContext {
  bodies: Link[];
  visible: Joint[];
  hidden: Set<string>;
  cylinders: Cylinder[];
  samples: Samples;
}

const W = 900;
const H = 650;
const PAD = 50;

export function drawingSvg(ctx: DrawingContext): string {
  const all = ctx.visible.flatMap((j) => ctx.samples.paths.get(j.id) ?? []);
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const k = Math.min(
    (W - 2 * PAD) / Math.max(maxX - minX, 1e-6),
    (H - 2 * PAD - 30) / Math.max(maxY - minY, 1e-6)
  );
  const px = (x: number) => PAD + (x - minX) * k;
  const py = (y: number) => PAD + (maxY - y) * k;
  const at0 = (j: Joint) => ctx.samples.paths.get(j.id)![0];
  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
  );
  out.push(`<rect width="${W}" height="${H}" fill="white"/>`);

  for (const joint of ctx.visible) {
    if (isGroundPin(joint)) continue;
    const path = ctx.samples.paths.get(joint.id)!;
    const traced = 'showCurve' in joint && (joint as { showCurve: boolean }).showCurve;
    out.push(
      `<polyline fill="none" stroke="${traced ? '#d62828' : '#b8b8b8'}" stroke-width="${traced ? 3 : 1.2}" ${traced ? '' : 'stroke-dasharray="4 3"'} points="${path.map(([x, y]) => `${px(x).toFixed(1)},${py(y).toFixed(1)}`).join(' ')}"/>`
    );
  }

  for (const joint of ctx.visible) {
    if (!(joint instanceof PrisJoint) || !joint.ground) continue;
    const path = ctx.samples.paths.get(joint.id)!;
    const ux = Math.cos(joint.angle_rad);
    const uy = Math.sin(joint.angle_rad);
    const along = path.map(([x, y]) => x * ux + y * uy);
    const [x0, y0] = path[0];
    const s0 = x0 * ux + y0 * uy;
    const lo = Math.min(...along) - s0 - 0.3;
    const hi = Math.max(...along) - s0 + 0.3;
    out.push(
      `<line x1="${px(x0 + lo * ux)}" y1="${py(y0 + lo * uy)}" x2="${px(x0 + hi * ux)}" y2="${py(y0 + hi * uy)}" stroke="#555" stroke-width="10" stroke-opacity="0.25"/>`
    );
  }

  for (const body of ctx.bodies) {
    const joints = body.joints.filter((j) => !ctx.hidden.has(j.id) && ctx.samples.paths.has(j.id));
    if (joints.length < 2) continue;
    const points = hull(joints.map(at0));
    if (points.length === 2) {
      const [[x1, y1], [x2, y2]] = points;
      out.push(
        `<line x1="${px(x1)}" y1="${py(y1)}" x2="${px(x2)}" y2="${py(y2)}" stroke="#2d6cdf" stroke-width="12" stroke-linecap="round" stroke-opacity="0.55"/>`
      );
    } else {
      out.push(
        `<polygon points="${points.map(([x, y]) => `${px(x)},${py(y)}`).join(' ')}" fill="#2d6cdf" fill-opacity="0.25" stroke="#2d6cdf" stroke-width="4" stroke-linejoin="round"/>`
      );
    }
  }

  for (const cylinder of ctx.cylinders) {
    const [x1, y1] = at0(cylinder.mountA);
    const [x2, y2] = at0(cylinder.mountB);
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    out.push(
      `<line x1="${px(x1)}" y1="${py(y1)}" x2="${px(mx)}" y2="${py(my)}" stroke="#333" stroke-width="16" stroke-linecap="round"/>`,
      `<line x1="${px(mx)}" y1="${py(my)}" x2="${px(x2)}" y2="${py(y2)}" stroke="#888" stroke-width="6" stroke-linecap="round"/>`
    );
  }

  for (const joint of ctx.visible) {
    const [x, y] = at0(joint);
    if (isGroundPin(joint)) {
      out.push(
        `<polygon points="${px(x)},${py(y)} ${px(x) - 12},${py(y) + 20} ${px(x) + 12},${py(y) + 20}" fill="#444"/>`
      );
    }
    out.push(
      `<circle cx="${px(x)}" cy="${py(y)}" r="6" fill="white" stroke="#111" stroke-width="2"/>`
    );
    out.push(
      `<text x="${px(x) + 9}" y="${py(y) - 9}" font-family="Helvetica, Arial" font-size="18" font-weight="bold" fill="#111">${joint.id}</text>`
    );
  }

  out.push(
    `<text x="${PAD}" y="${H - 14}" font-family="Helvetica, Arial" font-size="14" fill="#555">Start pose, y up. Blue: links. Triangles: ground pivots. Grey bars: slider guides. Red: traced paths.</text>`
  );
  out.push('</svg>');
  return out.join('\n');
}

/** Convex hull, so a ternary or welded body draws as one plate. */
function hull(points: [number, number][]): [number, number][] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length <= 2) return sorted;
  const cross = (o: number[], a: number[], b: number[]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (const p of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
