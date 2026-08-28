import {
  Cylinder,
  cylinderJoints,
  cylinderOfJointIn,
  cylinderOfLinkIn,
  sealedCylinderStructures,
} from './cylinder';
import { Joint, PrisJoint, RealJoint } from './joint';
import { frozenJointIds } from './lock-set';
import { Link, RealLink, SliderBlock } from './link';
import { SelectedPart } from './selection';

export interface CanonicalSelectionClosure {
  /** The selected parts after compound and cylinder roots are canonicalized. */
  parts: SelectedPart[];
  /** Every body carried by the selection, including compound leaves and blocks. */
  links: Link[];
  /** Every point moved by one affine group gesture. */
  joints: Joint[];
  jointIds: Set<string>;
  lockedJointIds: string[];
  canTransform: boolean;
}

function containsLink(root: Link, wanted: Link): boolean {
  return (
    root === wanted ||
    (root instanceof RealLink && root.subset.some((leaf) => containsLink(leaf, wanted)))
  );
}

function owningRoot(link: Link, roots: readonly Link[]): Link {
  return roots.find((root) => containsLink(root, link)) ?? link;
}

/**
 * Expand user-visible parts into the indivisible geometry a group transform carries.
 * The expansion is intentionally stronger than lock closure: a cylinder stays one part,
 * while lock implications retain their existing directed semantics.
 */
export function canonicalSelectionClosure(
  selected: readonly SelectedPart[],
  joints: readonly Joint[],
  links: readonly Link[]
): CanonicalSelectionClosure {
  const cylinders = sealedCylinderStructures([...joints]);
  const closureJoints: Joint[] = [];
  const closureLinks: Link[] = [];
  const canonicalParts: SelectedPart[] = [];
  const jointIds = new Set<string>();
  const linkObjects = new Set<Link>();
  const partObjects = new Set<SelectedPart>();

  const addJoint = (joint: Joint) => {
    if (jointIds.has(joint.id)) return;
    jointIds.add(joint.id);
    closureJoints.push(joint);
  };
  const addLink = (link: Link) => {
    if (linkObjects.has(link)) return;
    linkObjects.add(link);
    closureLinks.push(link);
    link.joints.forEach(addJoint);
    if (link instanceof RealLink) link.subset.forEach(addLink);
  };
  const addPart = (part: SelectedPart) => {
    if (partObjects.has(part)) return;
    partObjects.add(part);
    canonicalParts.push(part);
  };
  const addCylinder = (cylinder: Cylinder) => {
    [cylinder.barrel, cylinder.rod, cylinder.block].forEach(addLink);
    cylinderJoints(cylinder).forEach(addJoint);
  };

  selected.forEach((part) => {
    if (part instanceof RealLink) {
      const root = owningRoot(part, links);
      if (root instanceof RealLink) addPart(root);
      addLink(root);
      const cylinder = cylinderOfLinkIn(cylinders, root);
      if (cylinder) addCylinder(cylinder);
    } else {
      addPart(part);
      addJoint(part);
      const cylinder = cylinderOfJointIn(cylinders, part);
      if (cylinder) addCylinder(cylinder);
    }
  });

  // Slider pairs are coincident, and a floating slider follows its selected carrier.
  // Iterate because adding one member can reveal another composite one step away.
  let grew = true;
  while (grew) {
    const before = jointIds.size + linkObjects.size;
    [...closureJoints].forEach((joint) => {
      if (!(joint instanceof RealJoint)) return;
      joint.links
        .filter((link): link is SliderBlock => link instanceof SliderBlock)
        .forEach(addLink);
      const cylinder = cylinderOfJointIn(cylinders, joint);
      if (cylinder) addCylinder(cylinder);
    });
    joints
      .filter((joint): joint is PrisJoint => joint instanceof PrisJoint && joint.isFloating)
      .forEach((slider) => {
        if (!slider.carrier || !closureLinks.some((link) => containsLink(link, slider.carrier!))) {
          return;
        }
        addJoint(slider);
        slider.links
          .filter((link): link is SliderBlock => link instanceof SliderBlock)
          .forEach(addLink);
      });
    grew = before !== jointIds.size + linkObjects.size;
  }

  const frozen = frozenJointIds([...joints], [...links], cylinders);
  const lockedJointIds = closureJoints
    .map((joint) => joint.id)
    .filter((jointId) => frozen.has(jointId));
  return {
    parts: canonicalParts,
    links: closureLinks,
    joints: closureJoints,
    jointIds,
    lockedJointIds,
    canTransform: lockedJointIds.length === 0 && closureJoints.length > 0,
  };
}
