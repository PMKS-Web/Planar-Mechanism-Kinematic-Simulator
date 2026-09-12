import { MechanismPartition } from './mechanism-partition';
import { RealJoint, PrisJoint, RevJoint } from '../joint';
import { RealLink, SliderBlock } from '../link';

export function solveFingerprint(
  partition: MechanismPartition,
  unitStr: string,
  gravity: boolean,
  inputVelocity: number,
  icCount: number
): string {
  const joints = partition.joints.map((joint) => {
    const real = joint instanceof RealJoint ? joint : undefined;
    const slide = joint instanceof PrisJoint ? joint.angle_rad : '';
    // Spelled, not read off the class: a production build renames classes.
    const kind = joint instanceof PrisJoint ? 'P' : joint instanceof RevJoint ? 'R' : 'J';
    const flags = [real?.ground && 'g', real?.input && 'i', real?.isWelded && 'w']
      .filter(Boolean)
      .join('');
    return `${joint.id}@${joint.x},${joint.y}:${kind}${flags}${slide}`;
  });
  const links = partition.links.map((link) => {
    const body = link instanceof RealLink ? link : undefined;
    const pins = link.joints.map((joint) => joint.id).join('');
    const subset = body?.subset.map((part) => part.id).join('+') ?? '';
    const shape = `${body?.isCircle ? 'o' : ''}d${body?.d.length ?? ''}`;
    const center = `${body?.CoM.x ?? ''},${body?.CoM.y ?? ''}`;
    const inertia = `m${link.mass}I${body?.massMoI ?? ''}`;
    const kind = body ? 'L' : link instanceof SliderBlock ? 'S' : 'K';
    return `${link.id}[${pins}]${kind}${inertia}c${center}${shape}s${subset}`;
  });
  const forces = partition.forces.map((force) => {
    const from = `${force.startCoord.x},${force.startCoord.y}`;
    const to = `${force.endCoord.x},${force.endCoord.y}`;
    const at = `${from}-${to}`;
    return `${force.id}>${force.link.id}@${at}m${force.mag}${force.local ? 'l' : ''}`;
  });
  return [
    joints.join('|'),
    links.join('|'),
    forces.join('|'),
    gravity,
    unitStr,
    inputVelocity,
    icCount,
  ].join('#');
}
