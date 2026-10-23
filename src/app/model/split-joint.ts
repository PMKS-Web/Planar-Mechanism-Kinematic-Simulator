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
  return links.filter((link) => link.joints.some((candidate) => candidate.id === joint.id));
}

/**
 * A slider block is a part in its own right: splitting takes every rider off
 * it, so one rider is already two things to separate. A pin is only a meeting
 * point, so it needs two links before there is anything to split.
 */
export function splitJointChoice(
  joint: RealJoint,
  links: Link[],
  cylinders: Cylinder[]
): SplitJointChoice {
  const count = rootsAt(joint, links).length;
  const slider = joint instanceof PrisJoint;
  if (slider && joint.isDangling) {
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
  // A Prismatic block welds two riders into one body through itself, so they
  // are a single rigid part rather than links that happen to meet at it.
  if (slider && joint.isWelded) {
    return {
      count,
      refusal: 'welded',
      short: 'riders welded',
      long: `The links on joint ${joint.name} are welded to its block. Set it to Pin-in-slot to split them.`,
    };
  }
  if (joint.isWelded) {
    return {
      count,
      refusal: 'welded',
      short: 'welded',
      long: `Joint ${joint.name} is welded. Set it to Revolute to split it.`,
    };
  }
  if (count < (slider ? 1 : 2)) {
    return {
      count,
      refusal: 'needs-links',
      short: slider ? 'no links' : 'needs 2 links',
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

function newPin(id: string, joint: RealJoint): RevJoint {
  const pin = new RevJoint(id, joint.x, joint.y);
  pin.locked = joint.locked;
  pin.r = joint.r;
  return pin;
}

/** Slots that end at the split joint follow their carrier onto its new pin. */
function rebindSlots(joints: RealJoint[], source: RealJoint, pinOf: Map<Link, RealJoint>): void {
  joints.forEach((candidate) => {
    if (!(candidate instanceof PrisJoint) || !candidate.isFloating) return;
    const a = candidate.slotJointA!;
    const b = candidate.slotJointB!;
    const carrier = candidate.carrier!;
    const replacement = pinOf.get(carrier);
    if (!replacement) return;
    candidate.slideOn(
      carrier,
      a.id === source.id ? replacement : a,
      b.id === source.id ? replacement : b
    );
  });
}

export interface SplitJointResult {
  /** The joint that keeps the source's id: a pin with one body, or the bare slider block. */
  original: RealJoint;
  created: RevJoint[];
  /** Each body that was at the joint, with the pin it holds now. */
  pinOf: Map<Link, RealJoint>;
}

/**
 * Give each body its own pin. A slider block stays where it is, on its slot,
 * and every rider leaves it for a Revolute pin of its own.
 */
export function splitJoint(
  joint: RealJoint,
  joints: RealJoint[],
  links: Link[],
  forces: Force[],
  cylinders: Cylinder[]
): SplitJointResult | undefined {
  if (splitJointChoice(joint, links, cylinders).refusal) return undefined;
  const bodies = rootsAt(joint, links);
  const taken = new Set(joints.map((candidate) => candidate.id));
  const fresh = (): RevJoint => {
    const id = nextFreeLetter(taken);
    taken.add(id);
    const pin = newPin(id, joint);
    joints.push(pin);
    return pin;
  };
  const pinOf = new Map<Link, RealJoint>();

  if (joint instanceof PrisJoint) {
    const created = bodies.map((body) => {
      const pin = fresh();
      pinOf.set(body, pin);
      replaceInBody(body, joint, pin, forces);
      return pin;
    });
    rebindSlots(joints, joint, pinOf);
    return { original: joint, created, pinOf };
  }

  const original = new RevJoint(joint.id, joint.x, joint.y, joint.input, joint.ground);
  original.name = joint.name;
  original.showCurve = joint.showCurve;
  original.colorFamily = joint.colorFamily;
  original.locked = joint.locked;
  original.r = joint.r;
  original.driveSpeed = joint.driveSpeed;
  joints[joints.findIndex((candidate) => candidate === joint)] = original;
  const created: RevJoint[] = [];
  bodies.forEach((body, index) => {
    const pin = index === 0 ? original : fresh();
    if (pin !== original) created.push(pin);
    pinOf.set(body, pin);
    replaceInBody(body, joint, pin, forces);
  });
  rebindSlots(joints, joint, pinOf);
  return { original, created, pinOf };
}
