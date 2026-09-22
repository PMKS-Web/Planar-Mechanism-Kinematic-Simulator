import { Joint, RealJoint } from './joint';
import { Link } from './link';

/** Remove real joints left without a body after a topology deletion. */
export function pruneUnlinkedJoints(
  joints: Joint[],
  links: Link[],
  removed: readonly Joint[]
): Joint[] {
  return joints.filter(
    (joint) =>
      !removed.includes(joint) ||
      !(joint instanceof RealJoint) ||
      links.some((link) => link.joints.includes(joint))
  );
}
