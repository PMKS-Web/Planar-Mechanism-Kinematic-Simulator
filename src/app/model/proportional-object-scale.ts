import type { Link } from './link';

/** A stable visual size from primitive spans, independent of the viewport and zoom. */
export function proportionalObjectScale(links: readonly Link[]): number | undefined {
  const spans: number[] = [];
  const visit = (link: Link): void => {
    const children = (link as Link & { subset?: Link[] }).subset;
    if (children?.length) {
      children.forEach(visit);
      return;
    }
    let span = 0;
    for (const a of link.joints)
      for (const b of link.joints) {
        span = Math.max(span, Math.hypot(a.x - b.x, a.y - b.y));
      }
    if (Number.isFinite(span) && span > 0) spans.push(span);
  };
  links.forEach(visit);
  if (!spans.length) return undefined;
  spans.sort((a, b) => a - b);
  // Median avoids a distant tracer or one long frame drowning the working links.
  return spans[Math.floor(spans.length / 2)] * 0.18;
}

/** Primitive edges stay visible in a compound; their shared joints still identify connectivity. */
export function linkSkeletonPath(link: Link): string {
  const children = (link as Link & { subset?: Link[] }).subset;
  if (children?.length) return children.map(linkSkeletonPath).join(' ');
  const joints = link.joints;
  if (joints.length < 2) return '';
  return `M ${joints.map((joint) => `${joint.x} ${joint.y}`).join(' L ')}${joints.length > 2 ? ' Z' : ''}`;
}
