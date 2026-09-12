import { PrisJoint, RealJoint } from './joint';
import { RealLink, SliderBlock } from './link';
import { hasFriction } from './joint-friction';
import { slideAssemblyAt } from './slide-assembly';

/** A guide couple needs separated contact loads before Coulomb friction can be inferred. */
export function guideFrictionRefusal(joint: RealJoint): string | undefined {
  if (!(joint instanceof PrisJoint)) return undefined;
  const welded = joint.links.some((link) =>
    link.joints.some((one) => slideAssemblyAt(one)?.slider === joint)
  );
  return welded
    ? `Guide ${joint.name} carries a couple. Its friction needs bearing spacing and contact loads, which this model does not yet support.`
    : undefined;
}

/** The selectable pin also owns the controls for the guide its block rides in. */
export function frictionContactsOf(joint: RealJoint): RealJoint[] {
  if (joint instanceof PrisJoint) return [joint];
  const guides = joint.links.flatMap((link) =>
    link instanceof SliderBlock
      ? link.joints.filter((one): one is PrisJoint => one instanceof PrisJoint)
      : []
  );
  const simplePin =
    !joint.isWelded &&
    (joint.ground
      ? joint.links.length === 1 && joint.links[0] instanceof RealLink
      : joint.links.length === 2 && joint.links.every((link) => link instanceof RealLink));
  return [...(simplePin || hasFriction(joint.friction) ? [joint] : []), ...guides];
}
