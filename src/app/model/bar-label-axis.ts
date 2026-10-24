import { Joint } from './joint';
import { Link, RealLink } from './link';

/** Direction along the bar used to separate its name from center marks. */
export function barLabelAxis(
  link: Link,
  reference: readonly Joint[] = link.joints
): { x: number; y: number } | undefined {
  if ((link.joints?.length ?? 0) !== 2) return undefined;
  if (link instanceof RealLink && link.subset.length > 0) return undefined;
  const [from, to] = link.joints;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const span = Math.hypot(dx, dy);
  if (span < 1e-9) return undefined;
  const a = reference.find((joint) => joint.id === from.id) ?? from;
  const b = reference.find((joint) => joint.id === to.id) ?? to;
  const up = b.y - a.y > 1e-9 || (Math.abs(b.y - a.y) <= 1e-9 && b.x > a.x) ? 1 : -1;
  return { x: (up * dx) / span, y: (up * dy) / span };
}
