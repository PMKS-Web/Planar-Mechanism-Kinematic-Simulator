import { Link, RealLink } from './link';

/** Direction along the bar used to separate its name from center marks. */
export function barLabelAxis(link: Link): { x: number; y: number } | undefined {
  if ((link.joints?.length ?? 0) !== 2) return undefined;
  if (link instanceof RealLink && link.subset.length > 0) return undefined;
  const [from, to] = link.joints;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const span = Math.hypot(dx, dy);
  if (span < 1e-9) return undefined;
  const up = dy > 1e-9 || (Math.abs(dy) <= 1e-9 && dx > 0) ? 1 : -1;
  return { x: (up * dx) / span, y: (up * dy) / span };
}
