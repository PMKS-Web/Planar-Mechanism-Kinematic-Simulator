import type { Link } from './link';

/** Primitive edges stay visible in a compound; their shared joints still identify connectivity. */
export function linkSkeletonPath(link: Link): string {
  const children = (link as Link & { subset?: Link[] }).subset;
  if (children?.length) return children.map(linkSkeletonPath).join(' ');
  const joints = link.joints;
  if (joints.length < 2) return '';
  return `M ${joints.map((joint) => `${joint.x} ${joint.y}`).join(' L ')}${joints.length > 2 ? ' Z' : ''}`;
}
