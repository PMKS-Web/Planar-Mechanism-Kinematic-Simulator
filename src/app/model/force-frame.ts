import { Force } from './force';

/** The datum follows the owning body only for a local force. */
export function forceFrameAngle(force: Force): number {
  if (!force.local) return 0;
  // Joint positions are the displayed body. Cached link angles can lag a drag
  // or retain an imported value; the frame mark must stay on the actual bar.
  const [from, to] = force.link.joints;
  return from && to ? Math.atan2(to.y - from.y, to.x - from.x) : 0;
}

/** Match the signed angle edited in the force's own reference frame. */
export function forceFrameDirection(force: Force): number {
  const angle = force.angleRad - forceFrameAngle(force);
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export function forceAngleGuide(force: Force, scale: number) {
  const base = forceFrameAngle(force);
  const angle = forceFrameDirection(force);
  const at = force.startCoord;
  const point = (bearing: number, radius: number) => ({
    x: at.x + radius * Math.cos(bearing),
    y: at.y + radius * Math.sin(bearing),
  });
  const radius = 1.15 * scale;
  const start = point(base, radius);
  const end = point(base + angle, radius);
  return {
    at,
    axis: point(base, 1.8 * scale),
    along: point(base + angle, 1.8 * scale),
    arc: `M ${start.x} ${start.y} A ${radius} ${radius} 0 0 ${angle >= 0 ? 1 : 0} ${end.x} ${end.y}`,
    labelAt: point(base + angle / 2, radius + 0.25 * scale),
    angle,
  };
}
