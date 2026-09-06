/**
 * Where on a link a force may be applied.
 *
 * A force acts on a body, and the only part of a body the drawing is sure
 * about is the region its joints span: a bar is the line between its two
 * joint centers, and a plate is the polygon those centers enclose. The
 * drawn outline is wider than that -- a bar has a width, a plate rounds its
 * corners -- but a load out at the drawn edge is a load on the skin rather
 * than on the linkage, and it is the linkage the solver balances. So an
 * anchor is kept to the centers: on the line for a bar, inside the polygon
 * for a plate, and for a compound welded out of several, on any of its
 * pieces. It is drawn to the lines between joints when it comes close to one,
 * because those are the places a reader means when they aim at a link.
 *
 * Pure geometry: the canvas asks it under a drag, the service asks it when a
 * force is made and again whenever the drawing is rebuilt, so that a joint
 * dragged out from under a load takes the load with it rather than leaving
 * it standing in the air where the link used to be.
 */
import { Coord } from './coord';
import { RealLink } from './link';
import { point_on_line_segment_closest_to_point } from './utils';

interface Point {
  x: number;
  y: number;
}

/**
 * The rigid pieces of a link, each as the joint centers that span it.
 *
 * A compound is its constituent links: a force sits on one of them, not in
 * the space between two bars welded at an angle. A plain link is itself.
 */
export function anchorBodiesOf(link: RealLink): Point[][] {
  const pieces =
    link.subset.length > 0
      ? link.subset.filter((piece): piece is RealLink => piece instanceof RealLink)
      : [link];
  return (pieces.length > 0 ? pieces : [link]).map((piece) => distinctCenters(piece.joints));
}

/**
 * The point nearest `wanted` that a force on `link` may be anchored at.
 *
 * Inside a plate the answer is the point itself; off a bar or outside a plate
 * it is the nearest point of the nearest piece. `snapWithin` is how close the
 * point has to come to the line between two of a piece's joints to be drawn
 * onto it; zero draws nothing, which is what a rebuild wants, since a rebuild
 * is not a gesture.
 */
export function constrainForceAnchor(link: RealLink, wanted: Point, snapWithin: number): Coord {
  const bodies = anchorBodiesOf(link);
  let best: Point = wanted;
  let bestBody: Point[] = [];
  let bestGap = Infinity;
  for (const body of bodies) {
    const candidate = nearestInBody(body, wanted);
    if (!candidate) continue;
    const gap = Math.hypot(candidate.x - wanted.x, candidate.y - wanted.y);
    if (gap < bestGap) {
      bestGap = gap;
      best = candidate;
      bestBody = body;
    }
  }
  if (snapWithin > 0 && bestBody.length >= 3) {
    const onLine = nearestOnCenterLines(bestBody, best);
    if (onLine && Math.hypot(onLine.x - best.x, onLine.y - best.y) <= snapWithin) best = onLine;
  }
  return new Coord(best.x, best.y);
}

/** Whether `point` is somewhere a force on `link` may be anchored, to `tolerance`. */
export function anchorIsOnLink(link: RealLink, point: Point, tolerance: number): boolean {
  const kept = constrainForceAnchor(link, point, 0);
  return Math.hypot(kept.x - point.x, kept.y - point.y) <= tolerance;
}

/** The centers of a piece's joints, each once: two joints on one spot span nothing. */
function distinctCenters(joints: Point[]): Point[] {
  const centers: Point[] = [];
  for (const joint of joints) {
    if (!centers.some((center) => Math.hypot(center.x - joint.x, center.y - joint.y) < 1e-9)) {
      centers.push({ x: joint.x, y: joint.y });
    }
  }
  return centers;
}

/**
 * The nearest point of one piece: the point itself inside a plate, else the
 * nearest point on the plate's edge, on the bar, or at the lone center.
 */
function nearestInBody(centers: Point[], wanted: Point): Point | undefined {
  if (centers.length === 0) return undefined;
  if (centers.length === 1) return centers[0];
  const hull = convexHull(centers);
  if (hull.length < 3) {
    // A bar, or a boom whose joints all lie on one line: the hull is the
    // segment between its two extreme points.
    const [a, b] = hull.length === 2 ? hull : extremes(centers);
    return onSegment(wanted, a, b);
  }
  if (insidePolygon(hull, wanted)) return wanted;
  return nearestOnEdges(hull, wanted);
}

/** The nearest point on any line between two of the piece's joints. */
function nearestOnCenterLines(centers: Point[], wanted: Point): Point | undefined {
  let best: Point | undefined;
  let bestGap = Infinity;
  for (let first = 0; first < centers.length; first++) {
    for (let second = first + 1; second < centers.length; second++) {
      const candidate = onSegment(wanted, centers[first], centers[second]);
      const gap = Math.hypot(candidate.x - wanted.x, candidate.y - wanted.y);
      if (gap < bestGap) {
        bestGap = gap;
        best = candidate;
      }
    }
  }
  return best;
}

function nearestOnEdges(polygon: Point[], wanted: Point): Point {
  let best = polygon[0];
  let bestGap = Infinity;
  for (let index = 0; index < polygon.length; index++) {
    const candidate = onSegment(wanted, polygon[index], polygon[(index + 1) % polygon.length]);
    const gap = Math.hypot(candidate.x - wanted.x, candidate.y - wanted.y);
    if (gap < bestGap) {
      bestGap = gap;
      best = candidate;
    }
  }
  return best;
}

function onSegment(point: Point, a: Point, b: Point): Point {
  if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-12) return { x: a.x, y: a.y };
  const [x, y] = point_on_line_segment_closest_to_point(point.x, point.y, a.x, a.y, b.x, b.y);
  return { x, y };
}

/** Counterclockwise, with collinear points left off: Andrew's monotone chain. */
function convexHull(points: Point[]): Point[] {
  const sorted = [...points].sort((p, q) => p.x - q.x || p.y - q.y);
  if (sorted.length < 3) return sorted;
  const cross = (o: Point, a: Point, b: Point) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  for (const point of sorted) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 1e-12
    ) {
      lower.pop();
    }
    lower.push(point);
  }
  const upper: Point[] = [];
  for (const point of [...sorted].reverse()) {
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 1e-12
    ) {
      upper.pop();
    }
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

/** The two points furthest apart, for a set that lies on one line. */
function extremes(points: Point[]): [Point, Point] {
  let best: [Point, Point] = [points[0], points[points.length - 1]];
  let bestSpan = -1;
  for (const a of points) {
    for (const b of points) {
      const span = Math.hypot(b.x - a.x, b.y - a.y);
      if (span > bestSpan) {
        bestSpan = span;
        best = [a, b];
      }
    }
  }
  return best;
}

/** Inside or on the edge of a counterclockwise convex polygon. */
function insidePolygon(polygon: Point[], point: Point): boolean {
  for (let index = 0; index < polygon.length; index++) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    const side = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
    if (side < -1e-9) return false;
  }
  return true;
}
