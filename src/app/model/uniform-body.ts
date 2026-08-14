import { Coord } from './coord';

/**
 * Mass properties of a link modeled as a uniform body over its own joints.
 *
 * Derived from the joint skeleton alone, never from the drawn outline: bar
 * width, pin radius and fillets all follow Object Scale, and a moment of
 * inertia that changed when someone adjusted a display slider would be physics
 * depending on cosmetics. Joint positions are real geometry; these numbers
 * move only when the mechanism does.
 *
 * The idealization by shape:
 *
 *   - two joints — a slender rod between them: centroid at the midpoint,
 *     k² = L²/12;
 *   - three or more — a uniform plate over the convex hull of the joints,
 *     which is the same hull the link is drawn as: polygon centroid, polygon
 *     second moment;
 *   - a degenerate hull (collinear joints, e.g. a tracer on the bar's own
 *     axis) — the rod again, between the two farthest joints.
 *
 * Everything is expressed per unit mass: `gyrationSq` is k², the squared
 * radius of gyration, in squared model units. MoI = mass × k², converted to
 * whatever unit the store keeps inertia in — mass stays the one number a
 * person chooses, and these follow it.
 */
export interface UniformBody {
  /** Centroid, in model coordinates. */
  centroid: Coord;
  /** Squared radius of gyration about the centroid, in squared model units. */
  gyrationSq: number;
}

export function uniformBodyOf(joints: { x: number; y: number }[]): UniformBody {
  const points = dedupe(joints);
  if (points.length === 0) {
    return { centroid: new Coord(0, 0), gyrationSq: 0 };
  }
  if (points.length === 1) {
    return { centroid: new Coord(points[0].x, points[0].y), gyrationSq: 0 };
  }
  if (points.length >= 3) {
    const hull = convexHull(points);
    if (hull.length >= 3) {
      const plate = platedPolygon(hull);
      if (plate) return plate;
    }
  }
  return rod(points);
}

/** The slender rod between the two farthest of the points. */
function rod(points: { x: number; y: number }[]): UniformBody {
  let a = points[0];
  let b = points[1] ?? points[0];
  let longest = -1;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const span = (points[i].x - points[j].x) ** 2 + (points[i].y - points[j].y) ** 2;
      if (span > longest) {
        longest = span;
        a = points[i];
        b = points[j];
      }
    }
  }
  return {
    centroid: new Coord((a.x + b.x) / 2, (a.y + b.y) / 2),
    gyrationSq: Math.max(longest, 0) / 12,
  };
}

/**
 * Uniform plate over a convex polygon: centroid and k² by the standard
 * shoelace second-moment formulas. Returns undefined for a degenerate area,
 * so the caller can fall back to the rod.
 */
function platedPolygon(points: { x: number; y: number }[]): UniformBody | undefined {
  // In the first vertex's frame, not the world's: the polar terms below grow
  // with distance⁴ from the origin, and a small link far from (0,0) loses its
  // own second moment to cancellation. Translation changes neither area, nor
  // centroid (shifted back at the end), nor the centroidal moment.
  const origin = points[0];
  const hull = points.map((p) => ({ x: p.x - origin.x, y: p.y - origin.y }));
  let area2 = 0;
  let cx = 0;
  let cy = 0;
  let inertia = 0; // polar second moment about the origin, times 6/area2 pending
  for (let i = 0; i < hull.length; i++) {
    const p = hull[i];
    const q = hull[(i + 1) % hull.length];
    const cross = p.x * q.y - q.x * p.y;
    area2 += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
    inertia += cross * (p.x * p.x + p.x * q.x + q.x * q.x + p.y * p.y + p.y * q.y + q.y * q.y);
  }
  const area = area2 / 2;
  const span = hull.reduce(
    (widest, p) => Math.max(widest, Math.abs(p.x - hull[0].x), Math.abs(p.y - hull[0].y)),
    0
  );
  // Degenerate: the hull encloses next to nothing compared to its own reach.
  if (Math.abs(area) < 1e-9 * Math.max(span * span, 1)) return undefined;

  const centroidX = cx / (3 * area2);
  const centroidY = cy / (3 * area2);
  // Polar second moment per unit mass about the origin, then moved to the
  // centroid by the parallel-axis theorem.
  const polarOverMass = inertia / (6 * area2);
  const gyrationSq = polarOverMass - (centroidX * centroidX + centroidY * centroidY);
  return {
    centroid: new Coord(centroidX + origin.x, centroidY + origin.y),
    gyrationSq: Math.max(gyrationSq, 0),
  };
}

/** Andrew's monotone chain; returns the hull counterclockwise. */
function convexHull(points: { x: number; y: number }[]): { x: number; y: number }[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (
    o: { x: number; y: number },
    a: { x: number; y: number },
    b: { x: number; y: number }
  ) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (list: { x: number; y: number }[]) => {
    const chain: { x: number; y: number }[] = [];
    for (const p of list) {
      while (chain.length >= 2 && cross(chain[chain.length - 2], chain[chain.length - 1], p) <= 0) {
        chain.pop();
      }
      chain.push(p);
    }
    chain.pop();
    return chain;
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

function dedupe(points: { x: number; y: number }[]): { x: number; y: number }[] {
  const seen = new Set<string>();
  return points.filter((p) => {
    const key = `${p.x},${p.y}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
