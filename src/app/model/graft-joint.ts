import { RealJoint } from './joint';
import { RealLink } from './link';

/** Add a rigid attachment to a body and the primitive it was placed on. */
export function graftJoint(joint: RealJoint, link: RealLink): void {
  link.joints.forEach((member) => {
    if (!(member instanceof RealJoint)) return;
    member.connectedJoints.push(joint);
    joint.connectedJoints.push(member);
  });
  // A welded compound is drawn from its leaves, so the leaf the user actually
  // clicked has to grow too or the new joint belongs to a body nothing draws.
  if (link.isWelded && link.lastSelectedSublink) {
    link.lastSelectedSublink.id = link.lastSelectedSublink.id.concat(joint.id);
    link.lastSelectedSublink.fixedLocations.push({ id: joint.id, label: joint.id });
    link.lastSelectedSublink.joints.push(joint);
  }
  joint.links.push(link);
  link.joints.push(joint);
  link.id += joint.id;
  link.d = link.getPathString();
}
