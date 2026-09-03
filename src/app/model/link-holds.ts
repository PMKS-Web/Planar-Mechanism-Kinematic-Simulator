import { Joint, RealJoint } from './joint';
import { Link, RealLink, LinkHold } from './link';
import { HoldBar, HoldJoint, reachedByHolds } from './hold-solver';

/**
 * What a bar's hold means on the drawing, in one place.
 *
 * `RealLink.hold` is a flag; these are the rules around it. A hold is only
 * meaningful on a plain two-joint bar, so a link that has since been welded
 * or given a third joint reads as holding nothing, whatever its flag says --
 * which is also why nothing has to clear the flag when a bar stops being one.
 */

/** Whether this is the kind of link a hold can mean something on. */
export function holdableBar(link: Link | undefined): link is RealLink {
  return (
    link instanceof RealLink &&
    link.joints.length === 2 &&
    link.subset.length === 0 &&
    link.joints.every((joint) => joint instanceof RealJoint)
  );
}

/** The hold this link is under, if it is a bar and has one. */
export function holdOf(link: Link | undefined): LinkHold {
  return holdableBar(link) ? link.hold : undefined;
}

/** Every bar holding a value, as the solver sees it, at the drawing's current geometry. */
export function heldBars(links: readonly Link[]): HoldBar[] {
  const bars: HoldBar[] = [];
  for (const link of links) {
    const hold = holdOf(link);
    if (!hold) continue;
    const bar = link as RealLink;
    const [a, b] = bar.joints;
    bars.push({
      id: bar.id,
      a: a.id,
      b: b.id,
      hold,
      length: Math.hypot(b.x - a.x, b.y - a.y),
      angle: Math.atan2(b.y - a.y, b.x - a.x),
    });
  }
  return bars;
}

/** The drawing's joints as the solver sees them; `fixed` says which never move. */
export function holdJoints(
  joints: readonly Joint[],
  fixed: (joint: RealJoint) => boolean
): HoldJoint[] {
  return joints
    .filter((joint): joint is RealJoint => joint instanceof RealJoint)
    .map((joint) => ({ id: joint.id, x: joint.x, y: joint.y, fixed: fixed(joint) }));
}

/** The held bars this joint is an end of. */
export function heldBarsAt(joint: Joint, links: readonly Link[]): RealLink[] {
  return links.filter(
    (link): link is RealLink => holdOf(link) !== undefined && link.joints.includes(joint)
  );
}

/** The held bars a move of this joint would have to respect, nearest first. */
export function heldBarsReaching(joint: Joint, links: readonly Link[]): RealLink[] {
  const reached = reachedByHolds([joint.id], heldBars(links)).bars.map((bar) => bar.id);
  const at = heldBarsAt(joint, links);
  const beyond = links.filter(
    (link): link is RealLink => reached.includes(link.id) && !at.includes(link as RealLink)
  );
  return [...at, ...beyond];
}

/** "fixed length AB", the way the menu and the refusals name a hold. */
export function describeHold(link: RealLink): string {
  return `fixed ${holdOf(link) === 'angle' ? 'angle' : 'length'} ${link.name || link.id}`;
}

/** "fixed length AB and fixed angle BC": the holds, as a list. */
export function holdList(bars: readonly RealLink[]): string {
  const names = bars.map(describeHold);
  return names.length <= 1
    ? names.join('')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** "Locked by fixed length AB and fixed angle BC", for a refusal. */
export function heldBySentence(bars: readonly RealLink[]): string {
  return `Locked by ${holdList(bars)}`;
}
