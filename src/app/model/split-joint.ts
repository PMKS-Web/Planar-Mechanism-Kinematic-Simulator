import { Cylinder, cylindersEnclosing } from './cylinder';
import { Force } from './force';
import { PrisJoint, RealJoint, RevJoint } from './joint';
import { nextFreeLetter } from './joint-letters';
import { Link, RealLink } from './link';

export type SplitJointRefusal = 'needs-links' | 'welded' | 'cylinder' | 'dangling';

export interface SplitJointChoice {
  count: number;
  refusal?: SplitJointRefusal;
  short?: string;
  long?: string;
}

function rootsAt(joint: RealJoint, links: Link[]): Link[] {
  const roots = links.filter((link) => link.joints.some((candidate) => candidate.id === joint.id));
  if (
    joint instanceof PrisJoint &&
    joint.isFloating &&
    joint.carrier &&
    !roots.includes(joint.carrier)
  ) {
    roots.push(joint.carrier);
  }
  return roots;
}

export function splitJointChoice(
  joint: RealJoint,
  links: Link[],
  cylinders: Cylinder[]
): SplitJointChoice {
  const count = rootsAt(joint, links).length;
  if (joint instanceof PrisJoint && joint.isDangling) {
    return {
      count,
      refusal: 'dangling',
      short: 'nowhere to slide',
      long: 'This slider has nowhere to slide. Drag it onto a link or ground it first.',
    };
  }
  if (cylindersEnclosing(cylinders, joint).length > 0) {
    return {
      count,
      refusal: 'cylinder',
      short: 'inside a cylinder',
      long: 'A joint inside a cylinder cannot be split. Split a joint at one of its ends instead.',
    };
  }
  if (joint.isWelded || (joint instanceof PrisJoint && !joint.rotates && !joint.isFloating)) {
    return {
      count,
      refusal: 'welded',
      short: 'unweld first',
      long: 'Set this joint to Revolute before splitting it.',
    };
  }
  if (count < 2) {
    return {
      count,
      refusal: 'needs-links',
      short: 'needs 2 links',
      long:
        count === 0
          ? 'No links are on this joint, so there is nothing to split.'
          : 'Only one link is on this joint, so there is nothing to split.',
    };
  }
  return { count };
}

function renameLink(link: Link, from: string, to: string, forces: Force[]): void {
  const oldId = link.id;
  const oldName = link.name;
  link.id = link.joints
    .map((joint) => joint.id)
    .sort()
    .join('');
  if (oldName === oldId) link.name = link.id;
  link.fixedLocations = link.fixedLocations.map((location) =>
    location.id === from ? { id: to, label: to } : location
  );
  if (link.fixedLocation.fixedPoint === from) link.fixedLocation.fixedPoint = to;
  if (link instanceof RealLink) {
    if (link.comOffset) {
      link.comOffset.frame = link.comOffset.frame.map((id) => (id === from ? to : id)) as [
        string,
        string,
      ];
    }
    if (typeof link.comAnchor === 'object' && link.comAnchor.joint === from) {
      link.comAnchor = { joint: to };
    }
  }
  forces.forEach((force) => {
    if (force.anchoredTo === oldId) force.anchoredTo = link.id;
  });
}

function replaceInBody(
  link: Link,
  source: RealJoint,
  replacement: RevJoint,
  forces: Force[]
): void {
  if (link instanceof RealLink) {
    link.subset.forEach((member) => replaceInBody(member, source, replacement, forces));
  }
  const at = link.joints.findIndex((candidate) => candidate.id === source.id);
  if (at < 0) return;
  link.joints[at] = replacement;
  renameLink(link, source.id, replacement.id, forces);
}

/** Give each body its own pin, or detach a floating slider from its carrier. */
export function splitJoint(
  joint: RealJoint,
  joints: RealJoint[],
  links: Link[],
  forces: Force[],
  cylinders: Cylinder[]
): { original: RealJoint; created: RevJoint[] } | undefined {
  if (splitJointChoice(joint, links, cylinders).refusal) return undefined;
  // A floating slider already belongs only to its rider bodies. Its carrier is
  // a constraint, not another joint membership: splitting releases that
  // constraint and leaves the same authored slider dangling.
  if (joint instanceof PrisJoint && joint.isFloating) {
    joint.detach();
    return { original: joint, created: [] };
  }
  const bodies = rootsAt(joint, links);
  const original = new RevJoint(joint.id, joint.x, joint.y, joint.input, joint.ground);
  original.name = joint.name;
  original.showCurve = joint.showCurve;
  original.colorFamily = joint.colorFamily;
  original.locked = joint.locked;
  original.r = joint.r;
  // Slider speed is linear. Carrying it onto the revolute pin would silently
  // reinterpret that number as rpm the next time the pin became an input.
  original.driveSpeed = joint instanceof PrisJoint ? 0 : joint.driveSpeed;
  original.machineName = joint.machineName;

  const at = joints.findIndex((candidate) => candidate === joint);
  joints[at] = original;
  const replacements = [original];
  const taken = new Set(joints.map((candidate) => candidate.id));
  for (let index = 1; index < bodies.length; index++) {
    const id = nextFreeLetter(taken);
    taken.add(id);
    const pin = new RevJoint(id, joint.x, joint.y);
    pin.locked = joint.locked;
    pin.r = joint.r;
    replacements.push(pin);
    joints.push(pin);
  }

  bodies.forEach((body, index) => {
    const replacement = replacements[index];
    replaceInBody(body, joint, replacement, forces);
  });
  joints.forEach((candidate) => {
    if (!(candidate instanceof PrisJoint) || !candidate.isFloating) return;
    const a = candidate.slotJointA!;
    const b = candidate.slotJointB!;
    const carrier = candidate.carrier!;
    const replacement = replacements[bodies.indexOf(carrier)];
    if (!replacement) return;
    candidate.slideOn(
      carrier,
      a.id === joint.id ? replacement : a,
      b.id === joint.id ? replacement : b
    );
  });
  return { original, created: replacements.slice(1) };
}
