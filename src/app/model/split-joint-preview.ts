import { PrisJoint, RealJoint } from './joint';
import { Link } from './link';
import { SplitJointPlan } from './split-joint';

/** A description of the topology to be committed, without staging changes to the drawing. */
export function splitJointPreview(
  joint: RealJoint,
  bodies: Link[],
  plan: SplitJointPlan,
  newId: string
): string {
  if (plan.kind === 'all') return 'Each attached link will have its own Revolute joint.';
  if (plan.kind === 'guide') {
    return `Joint ${joint.name} and its attached links will disconnect from the slot on ${joint instanceof PrisJoint ? joint.carrier?.name : ''}. The slider will need a new slot, a ground, or conversion to Revolute.`;
  }
  const moving = bodies.filter((body) => plan.links.includes(body.id)).map((body) => body.name);
  const staying = bodies.filter((body) => !plan.links.includes(body.id)).map((body) => body.name);
  if (!moving.length) return 'Choose the links that should share a new Revolute joint.';
  const type =
    joint instanceof PrisJoint ? (joint.rotates ? 'Pin-in-slot' : 'Prismatic') : 'Revolute';
  return `${moving.join(' and ')} will share new Revolute joint ${newId}. ${staying.length ? staying.join(' and ') : 'No links'} will stay on ${type} joint ${joint.name}${joint instanceof PrisJoint && !joint.isDangling ? ', keeping its guide' : ''}.`;
}
