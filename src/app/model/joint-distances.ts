import { PrisJoint, RealJoint } from './joint';
import { Link, RealLink } from './link';
import { selectableLinks } from './selection';

/** Binary bars expose length/angle; dimensions belong only to the same multi-pin primitive. */
export function distanceNeighbors(
  selected: RealJoint,
  roots: Link[],
  isCylinderMember: (link: RealLink) => boolean
): RealJoint[] {
  const leaves = selectableLinks(roots).filter(
    (link) =>
      !link.isCompound &&
      link.joints.length >= 3 &&
      link.joints.includes(selected) &&
      !isCylinderMember(link)
  );
  return [...new Set(leaves.flatMap((link) => link.joints))].filter(
    (joint): joint is RealJoint =>
      joint instanceof RealJoint && !(joint instanceof PrisJoint) && joint !== selected
  );
}
