import { Cylinder, cylindersEnclosing } from './cylinder';
import { Force } from './force';
import { PrisJoint, RealJoint, RevJoint } from './joint';
import { nextFreeLetter } from './joint-letters';
import { Link, RealLink } from './link';
import { weldComponents } from './weld-components';

export type SplitJointRefusal = 'needs-links' | 'welded' | 'cylinder';

export interface SplitJointChoice {
  count: number;
  refusal?: SplitJointRefusal;
  short?: string;
  long?: string;
}

/** Selected bodies share one new pin; the other bodies keep the original joint. */
export type SplitJointPlan =
  { kind: 'detach'; links: readonly string[] } | { kind: 'guide' } | { kind: 'all' };

export function splitJointBodies(joint: RealJoint, links: Link[]): Link[] {
  const roots = links.filter((link) => link.joints.some((candidate) => candidate.id === joint.id));
  if (!(joint instanceof PrisJoint) || joint.rotates) return roots;
  // A prismatic joint fuses its riders. Offer the bodies that releasing this
  // weld would reveal, while preserving any welds elsewhere in the compound.
  return roots.flatMap((root) => {
    if (!(root instanceof RealLink) || root.subset.length === 0) return [root];
    return weldComponents(
      root.subset.filter((one): one is RealLink => one instanceof RealLink),
      joint
    )
      .filter((members) => members.some((member) => member.joints.includes(joint)))
      .map((members) => {
        if (members.length === 1) return members[0];
        const points = [...new Set(members.flatMap((member) => member.joints))];
        return new Link(
          points
            .map((point) => point.id)
            .sort()
            .join(''),
          points
        );
      });
  });
}

function rootsAt(joint: RealJoint, links: Link[]): Link[] {
  const roots = splitJointBodies(joint, links);
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
  if (cylindersEnclosing(cylinders, joint).length > 0) {
    return {
      count,
      refusal: 'cylinder',
      short: 'inside a cylinder',
      long: 'A joint inside a cylinder cannot be split. Split a joint at one of its ends instead.',
    };
  }
  if (joint.isWelded && !(joint instanceof PrisJoint)) {
    return {
      count,
      refusal: 'welded',
      short: 'unweld first',
      long: 'Unweld this joint before splitting it.',
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

/** Checked again at commit, because a panel may have been opened before another edit. */
export function splitJointPlanRefusal(
  joint: RealJoint,
  links: Link[],
  cylinders: Cylinder[],
  plan: SplitJointPlan
): string | undefined {
  const refused = splitJointChoice(joint, links, cylinders);
  if (refused.refusal) return refused.long;
  if (plan.kind === 'guide') {
    return joint instanceof PrisJoint && joint.isFloating
      ? undefined
      : 'This joint has no slot carrier to disconnect.';
  }
  if (plan.kind === 'all') {
    return joint instanceof PrisJoint
      ? 'Choose which links to separate so the remaining links keep their slider.'
      : undefined;
  }
  const bodies = splitJointBodies(joint, links);
  const selected = new Set(plan.links);
  if (selected.size === 0) return 'Choose at least one link to separate.';
  if (
    plan.links.length !== selected.size ||
    plan.links.some((id) => !bodies.some((b) => b.id === id))
  ) {
    return 'The attached links have changed. Open Split Joint again.';
  }
  if (selected.size === bodies.length) {
    if (joint instanceof PrisJoint) {
      return joint.isFloating
        ? 'Keep at least one link on the slider, or disconnect its guide instead.'
        : 'Keep at least one link on the original slider.';
    }
    return 'Keep at least one link on the original joint, or choose Separate All.';
  }
  return undefined;
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

function rebindCarriers(joints: RealJoint[], source: RealJoint, pins: Map<Link, RealJoint>): void {
  joints.forEach((candidate) => {
    if (!(candidate instanceof PrisJoint) || !candidate.isFloating) return;
    const a = candidate.slotJointA!;
    const b = candidate.slotJointB!;
    const carrier = candidate.carrier!;
    const replacement = pins.get(carrier);
    if (!replacement) return;
    candidate.slideOn(
      carrier,
      a.id === source.id ? replacement : a,
      b.id === source.id ? replacement : b
    );
  });
}

function separateGroup(
  joint: RealJoint,
  joints: RealJoint[],
  bodies: Link[],
  forces: Force[],
  selected: readonly string[]
): { original: RealJoint; created: RevJoint[] } {
  const pin = new RevJoint(nextFreeLetter(new Set(joints.map((one) => one.id))), joint.x, joint.y);
  pin.locked = joint.locked;
  pin.r = joint.r;
  joints.push(pin);
  const pins = new Map<Link, RealJoint>();
  bodies.forEach((body) => {
    const replacement = selected.includes(body.id) ? pin : joint;
    pins.set(body, replacement);
    if (replacement === pin) replaceInBody(body, joint, pin, forces);
  });
  rebindCarriers(joints, joint, pins);
  return { original: joint, created: [pin] };
}

/** Split a chosen group, explicitly release a guide, or give each body its own pin. */
export function splitJoint(
  joint: RealJoint,
  joints: RealJoint[],
  links: Link[],
  forces: Force[],
  cylinders: Cylinder[],
  plan?: SplitJointPlan
): { original: RealJoint; created: RevJoint[] } | undefined {
  if (splitJointChoice(joint, links, cylinders).refusal) return undefined;
  if (plan && splitJointPlanRefusal(joint, links, cylinders, plan)) return undefined;
  if (plan?.kind === 'detach') {
    return separateGroup(joint, joints, splitJointBodies(joint, links), forces, plan.links);
  }
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
  rebindCarriers(joints, joint, new Map(bodies.map((body, index) => [body, replacements[index]])));
  return { original, created: replacements.slice(1) };
}
