/**
 * Hand-built cylinder graphs, for the parts of the model that are pure.
 *
 * The resolver and the pose planner are both pure functions of the joint
 * graph, so the graph is built here directly -- mirroring what the service's
 * own rebuild leaves behind -- rather than driven through the editor. That was
 * originally because the editor refused a welded mount; it no longer does, and
 * these are kept because a pure function is better tested against a graph than
 * against everything that has to happen to produce one.
 */

import { Joint, PrisJoint, RealJoint, RevJoint } from '../app/model/joint';
import { Link, RealLink, SliderBlock } from '../app/model/link';
import { cylinderBetween } from './verification/slot-fixtures';

/**
 * What `rebuildJointGraph` and `reconcileSlots` leave behind, in miniature.
 *
 * Every joint points at the *top-level* link it is on, so a leaf swallowed by
 * a compound stops being anything any joint names; and a floating slot follows
 * its carrier up to that top level too. Both are what the service does after
 * every structural edit, and a fixture that skipped them would be testing a
 * graph the app never produces.
 */
export function rewire(joints: Joint[], links: Link[]): void {
  joints.forEach((joint) => {
    if (joint instanceof RealJoint) joint.links = [];
  });
  links.forEach((link) =>
    link.joints.forEach((joint) => {
      if (joint instanceof RealJoint && !joint.links.includes(link)) joint.links.push(link);
    })
  );
  const owns = (root: Link, wanted: Link): boolean =>
    root.id === wanted.id ||
    (root instanceof RealLink && root.subset.some((leaf) => owns(leaf, wanted)));
  joints.forEach((joint) => {
    if (!(joint instanceof PrisJoint) || !joint.isFloating) return;
    const root = links.find((link) => owns(link, joint.carrier!));
    if (root && root.id !== joint.carrier!.id) {
      joint.slideOn(root, joint.slotJointA!, joint.slotJointB!);
    }
  });
}

/**
 * A ram lying along y = 0 from its barrel mount at (0,0) to its rod mount at
 * (10,0), laid out by the model's own rule so barrel and rod come out equal.
 *
 * Built through `cylinderBetween` rather than by hand: a ram whose two bodies
 * are different lengths is not a shape the app can produce, and asserting
 * behavior against one proves something about a drawing nobody has.
 */
export function ram(suffix: string = '') {
  const mount = { x: 0, y: 0 };
  const eye = { x: 10, y: 0 };
  const laid = cylinderBetween(mount, eye, 0.5);

  const barrelFar = new RevJoint(`A${suffix}`, mount.x, mount.y);
  const barrelNear = new RevJoint(`B${suffix}`, laid.barrelEnd.x, laid.barrelEnd.y);
  const pin = new RevJoint(`C${suffix}`, laid.pin.x, laid.pin.y);
  const rodFar = new RevJoint(`D${suffix}`, eye.x, eye.y);
  const slider = new PrisJoint(`P${suffix}`, laid.pin.x, laid.pin.y);

  const barrel = new RealLink(`A${suffix}B${suffix}`, [barrelFar, barrelNear]);
  const rod = new RealLink(`C${suffix}D${suffix}`, [pin, rodFar]);
  const block = new SliderBlock(`C${suffix}P${suffix}`, [pin, slider]);

  slider.slideOn(barrel, barrelFar, barrelNear);
  slider.isSealed = true;
  pin.isWelded = true;

  const joints: Joint[] = [barrelFar, barrelNear, pin, rodFar, slider];
  const links: Link[] = [barrel, rod, block];
  rewire(joints, links);

  return {
    barrelFar,
    barrelNear,
    pin,
    rodFar,
    slider,
    barrel,
    rod,
    block,
    joints,
    links,
    layout: laid,
  };
}

/**
 * Weld a two-joint bracket onto `mount`, the way the app's weld does: the
 * member bar and the bracket become one compound, and that compound replaces
 * both in the top-level link list.
 */
export function weldBracketOnto(
  parts: ReturnType<typeof ram>,
  mount: RealJoint,
  member: RealLink,
  id: string,
  at: { x: number; y: number }
) {
  const far = new RevJoint(`${id}far`, at.x, at.y);
  const bracket = new RealLink(id, [mount, far]);
  const compound = new RealLink(
    `${member.id}${id}`,
    [...member.joints, far],
    undefined,
    undefined,
    undefined,
    [member, bracket]
  );
  mount.isWelded = true;
  parts.joints.push(far);
  parts.links = parts.links.filter((link) => link.id !== member.id);
  parts.links.push(compound);
  rewire(parts.joints, parts.links);
  return { bracket, far, compound };
}
