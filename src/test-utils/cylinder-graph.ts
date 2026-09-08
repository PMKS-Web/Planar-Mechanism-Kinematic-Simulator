/**
 * Hand-built cylinder graphs, for the parts of the model that are pure.
 *
 * A welded mount cannot be made through the app yet -- the ban comes off in
 * step 5 of `docs/cylinder-mount-joints-plan.md` -- and the resolver and the
 * pose planner are both pure functions of the joint graph. So the graph is
 * built here directly, mirroring what the service's own rebuild leaves behind,
 * rather than driven through an edit path that would refuse it.
 */

import { Joint, PrisJoint, RealJoint, RevJoint } from '../app/model/joint';
import { Link, RealLink, SliderBlock } from '../app/model/link';

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

/** A ram lying along y = 0 from `barrelFar` at x = 0 to `rodFar` at x = 10. */
export function ram(suffix: string = '') {
  const barrelFar = new RevJoint(`A${suffix}`, 0, 0);
  const barrelNear = new RevJoint(`B${suffix}`, 6, 0);
  const pin = new RevJoint(`C${suffix}`, 6, 0);
  const rodFar = new RevJoint(`D${suffix}`, 10, 0);
  const slider = new PrisJoint(`P${suffix}`, 6, 0);

  const barrel = new RealLink(`A${suffix}B${suffix}`, [barrelFar, barrelNear]);
  const rod = new RealLink(`C${suffix}D${suffix}`, [pin, rodFar]);
  const block = new SliderBlock(`C${suffix}P${suffix}`, [pin, slider]);

  slider.slideOn(barrel, barrelFar, barrelNear);
  slider.isSealed = true;
  pin.isWelded = true;

  const joints: Joint[] = [barrelFar, barrelNear, pin, rodFar, slider];
  const links: Link[] = [barrel, rod, block];
  rewire(joints, links);

  return { barrelFar, barrelNear, pin, rodFar, slider, barrel, rod, block, joints, links };
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
