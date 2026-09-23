import hull from 'hull.js';
import type { Link } from './link';

/**
 * Primitive edges stay visible in a compound; their shared joints still identify connectivity.
 *
 * A plate of three or more joints is traced round its outside, the same convex
 * hull its filled body in the other styles is drawn around. Joint order is
 * creation order, so joining the joints in that order drew a rectangle whose
 * corners were placed diagonally as a bow tie.
 */
export function linkSkeletonPath(link: Link): string {
  const children = (link as Link & { subset?: Link[] }).subset;
  if (children?.length) return children.map(linkSkeletonPath).join(' ');
  const joints = link.joints;
  if (joints.length < 2) return '';
  if (joints.length === 2) return `M ${joints[0].x} ${joints[0].y} L ${joints[1].x} ${joints[1].y}`;
  const ring = hull(
    joints.map((joint) => [joint.x, joint.y]),
    Infinity
  ) as number[][];
  // hull.js closes the ring by repeating its first point; Z closes it here.
  const corners = ring.slice(0, -1);
  return `M ${corners.map(([x, y]) => `${x} ${y}`).join(' L ')} Z`;
}
