import { RealJoint } from './joint';
import { RealLink } from './link';

/** A primitive changes shape; its compound owns the rigid-body connectivity. */
export function graftJoint(joint: RealJoint, selected: RealLink, root = selected): void {
  const primitive = selected === root ? (root.lastSelectedSublink ?? root) : selected;
  root.joints.forEach((member) => {
    if (!(member instanceof RealJoint)) return;
    member.connectedJoints.push(joint);
    joint.connectedJoints.push(member);
  });
  joint.links.push(root);
  const grow = (link: RealLink): boolean => {
    const contains =
      link === primitive || link.subset.some((child) => child instanceof RealLink && grow(child));
    if (!contains) return false;
    link.joints.push(joint);
    link.fixedLocations.push({ id: joint.id, label: joint.id });
    root.forces.forEach((force) => {
      if (force.anchoredTo === link.id) force.anchoredTo += joint.id;
    });
    link.id += joint.id;
    link.reComputeDPath();
    return true;
  };
  grow(root);
}
