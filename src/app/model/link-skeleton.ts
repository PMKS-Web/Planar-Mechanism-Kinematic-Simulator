import hull from 'hull.js';
import type { Joint } from './joint';
import { Link, RealLink } from './link';

/**
 * Primitive edges stay visible in a compound; their shared joints still identify connectivity.
 *
 * A plate of three or more joints is traced round its outside, the same convex
 * hull its filled body in the other styles is drawn around. Joint order is
 * creation order, so joining the joints in that order drew a rectangle whose
 * corners were placed diagonally as a bow tie.
 *
 * A link drawn as a disc is a disc here too. Traced as its joints, a flywheel
 * came out as a line through its axle.
 */
export function linkSkeletonPath(link: Link): string {
  const children = (link as Link & { subset?: Link[] }).subset;
  if (children?.length) return children.map(linkSkeletonPath).join(' ');
  const joints = link.joints;
  if (joints.length < 2) return '';
  const center = link instanceof RealLink ? link.discCenter() : undefined;
  const disc = center && discSkeletonPath(center, joints);
  if (disc) return disc;
  if (joints.length === 2) return `M ${joints[0].x} ${joints[0].y} L ${joints[1].x} ${joints[1].y}`;
  const ring = hull(
    joints.map((joint) => [joint.x, joint.y]),
    Infinity
  ) as number[][];
  // hull.js closes the ring by repeating its first point; Z closes it here.
  const corners = ring.slice(0, -1);
  return `M ${corners.map(([x, y]) => `${x} ${y}`).join(' L ')} Z`;
}

/**
 * A disc is its rim and its spokes.
 *
 * The rim runs through the outermost joint's center, as a plate's outline runs
 * through its corner joints, so a crank pin on the rim sits on the line the way
 * a pin sits on every other schematic body. Standard's rim reaches past it by
 * a bar's half-width, which a line has no use for.
 *
 * A spoke runs from the pivot to each of the other joints. The pivot is at the
 * middle and never on the rim, so without them it was a loose pin inside a
 * ring; and a ring looks the same at every angle, so they are also what shows
 * the wheel turning.
 */
function discSkeletonPath(center: Joint, joints: readonly Joint[]): string {
  const { x, y } = center;
  const spokes = joints.filter((joint) => joint.x !== x || joint.y !== y);
  const r = Math.max(0, ...spokes.map((joint) => Math.hypot(joint.x - x, joint.y - y)));
  if (r === 0) return '';
  const rim = `M ${x - r} ${y} A ${r} ${r} 0 0 1 ${x + r} ${y} A ${r} ${r} 0 0 1 ${x - r} ${y} Z`;
  return [rim, ...spokes.map((joint) => `M ${x} ${y} L ${joint.x} ${joint.y}`)].join(' ');
}
