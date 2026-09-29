import { Link, RealLink } from './link';
import { selectableLinks } from './selection';

/** The first click names the rigid body; subsequent clicks name its leaves. */
export function pickLink(
  roots: Link[],
  clicked: RealLink,
  selected: RealLink | undefined,
  containsPoint: (link: RealLink) => boolean
): RealLink {
  const root = roots.find((link) => selectableLinks([link]).includes(clicked));
  if (!(root instanceof RealLink) || !root.isCompound) return clicked;
  const members = selectableLinks([root]);
  if (!selected || !members.includes(selected)) return root;
  if (!clicked.isCompound) return clicked;
  return (
    members
      .filter((link) => !link.isCompound)
      .reverse()
      .find(containsPoint) ?? root
  );
}
