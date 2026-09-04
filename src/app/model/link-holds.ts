import { Joint, RealJoint } from './joint';
import { Link, RealLink, LinkHold } from './link';
import { Cylinder, sealedCylinderStructures } from './cylinder';
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

/**
 * The cylinder each member link belongs to, for a whole drawing.
 *
 * Keyed by link id, because that is what every caller has. Built from the
 * drawing rather than from a link, and it has to be: a cylinder resolves from
 * the joints of its *slide* -- the welded pin, the block -- and the barrel
 * carries neither. The barrel's only tie to the rest of the part is the slot
 * cut into it, an edge that points from the prismatic joint outward, so there
 * is no walk from a barrel to its own assembly. Asking the drawing is the only
 * honest way, and every caller either has it or can reach it.
 */
export function cylinderMembers(joints: readonly Joint[]): Map<string, Cylinder> {
  return membersOf(sealedCylinderStructures(joints as Joint[]));
}

/**
 * The same map from cylinders already found.
 *
 * Resolving them walks the whole drawing, and these questions are asked from
 * template methods on every change-detection pass -- so the caller that has a
 * cached list (`MechanismService.sealedStructures`) hands it over rather than
 * paying for the walk per frame.
 */
export function membersOf(cylinders: readonly Cylinder[]): Map<string, Cylinder> {
  const members = new Map<string, Cylinder>();
  for (const sealed of cylinders) {
    for (const part of [sealed.barrel, sealed.rod, sealed.block]) {
      if (part) members.set(part.id, sealed);
    }
  }
  return members;
}

/**
 * The joints of every link handed in.
 *
 * `heldBars` is given links and needs the drawing to resolve a cylinder. The
 * two are the same thing: a member's joints include the welded pin the
 * assembly resolves from, so the union of what the links carry is enough.
 */
function jointsOf(links: readonly Link[]): Joint[] {
  const seen = new Map<string, Joint>();
  for (const link of links) {
    for (const joint of link.joints) seen.set(joint.id, joint);
  }
  return [...seen.values()];
}

/**
 * The cylinder this link is a member of, if the drawing says it is one.
 *
 * Any member answers for the whole part, so a hold asked of the rod and a hold
 * asked of the barrel are the same hold.
 */
export function cylinderOf(
  link: Link | undefined,
  joints: readonly Joint[],
  cylinders?: readonly Cylinder[]
): Cylinder | undefined {
  if (!link) return undefined;
  // Any member, including the block, which is a SliderBlock rather than a
  // RealLink and is as clickable as the other two.
  return (cylinders ? membersOf(cylinders) : cylinderMembers(joints)).get(link.id);
}

/**
 * Where a cylinder's hold is written down: on the barrel.
 *
 * So the rod and the barrel give the same answer whichever the reader clicked,
 * and a URL carries one entry for one part.
 */
export function cylinderHoldCarrier(sealed: Cylinder): RealLink | undefined {
  return sealed.barrel instanceof RealLink ? sealed.barrel : undefined;
}

/**
 * Whether this link is a cylinder that can hold the direction it points in.
 *
 * A cylinder has one angle -- mount to mount -- exactly as a bar does, and its
 * panel already states it in a field of its own. It has no *length* to hold:
 * the distance between its mounts is the stroke, which is the thing the drive
 * moves, so a hold on that would be a hold against the drive.
 */
export function holdableCylinder(link: Link | undefined, joints: readonly Joint[]): boolean {
  return cylinderOf(link, joints) !== undefined;
}

/**
 * The hold this link is under, if it is something a hold can mean and has one.
 *
 * `joints` is how a cylinder is recognized; without it this answers about bars
 * only, which is what it has always answered and what most callers want. The
 * service passes the drawing, and everything that has to know about a cylinder
 * asks the service.
 */
export function holdOf(
  link: Link | undefined,
  joints?: readonly Joint[],
  cylinders?: readonly Cylinder[]
): LinkHold {
  // A cylinder first: its barrel is a two-joint link in its own right, so the
  // bar test below would answer about the barrel's own ends rather than about
  // the part the reader is looking at.
  const sealed = joints ? cylinderOf(link, joints, cylinders) : undefined;
  if (sealed) {
    return cylinderHoldCarrier(sealed)?.hold === 'angle' ? 'angle' : undefined;
  }
  return holdableBar(link) ? link.hold : undefined;
}

/**
 * Every bar holding a value, as the solver sees it, at the drawing's current
 * geometry. `cylinders` is the drawing's rams when the caller has them cached.
 */
export function heldBars(links: readonly Link[], cylinders?: readonly Cylinder[]): HoldBar[] {
  const bars: HoldBar[] = [];
  const seen = new Set<string>();
  const members = cylinders ? membersOf(cylinders) : cylinderMembers(jointsOf(links));
  for (const link of links) {
    const sealed = members.get(link.id);
    const hold = sealed
      ? cylinderHoldCarrier(sealed)?.hold === 'angle'
        ? 'angle'
        : undefined
      : holdOf(link);
    if (!hold) continue;
    // A cylinder's angle is measured mount to mount -- the pair the reader sees
    // and the pair its Angle field states -- not the barrel's own two joints,
    // which are inside the part and which the normalizer re-derives anyway. So
    // holding those held nothing a reader could see.
    const [a, b] = sealed ? [sealed.barrelFar, sealed.rodFar] : link.joints;
    if (!a || !b) continue;
    // One entry per part: every member reports the whole assembly's hold.
    const id = sealed ? (cylinderHoldCarrier(sealed)?.id ?? link.id) : link.id;
    if (seen.has(id)) continue;
    seen.add(id);
    bars.push({
      id,
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

/**
 * The held bars this joint is an end of.
 *
 * A cylinder's ends are its two mounts, not the barrel's own joints -- so a
 * reader who grabbed a mount is told about the cylinder, and one who grabbed
 * the interior is told about nothing, which is right: the interior is placed
 * by the layout and is not somewhere a hold puts it.
 */
export function heldBarsAt(
  joint: Joint,
  links: readonly Link[],
  cylinders?: readonly Cylinder[]
): RealLink[] {
  const members = cylinders ? membersOf(cylinders) : cylinderMembers(jointsOf(links));
  const held: RealLink[] = [];
  const seen = new Set<string>();
  for (const link of links) {
    const sealed = members.get(link.id);
    const carrier = sealed ? cylinderHoldCarrier(sealed) : undefined;
    if (sealed ? carrier?.hold !== 'angle' : holdOf(link) === undefined) continue;
    const ends = sealed
      ? [sealed.barrelFar.id, sealed.rodFar.id]
      : link.joints.map((end) => end.id);
    if (!ends.includes(joint.id)) continue;
    const bar = sealed ? carrier! : (link as RealLink);
    if (seen.has(bar.id)) continue;
    seen.add(bar.id);
    held.push(bar);
  }
  return held;
}

/** The held bars a move of this joint would have to respect, nearest first. */
export function heldBarsReaching(
  joint: Joint,
  links: readonly Link[],
  cylinders?: readonly Cylinder[]
): RealLink[] {
  const reached = reachedByHolds([joint.id], heldBars(links, cylinders)).bars.map((bar) => bar.id);
  const at = heldBarsAt(joint, links, cylinders);
  const beyond = links.filter(
    (link): link is RealLink => reached.includes(link.id) && !at.includes(link as RealLink)
  );
  return [...at, ...beyond];
}

/**
 * "fixed length AB", the way the menu and the refusals name a hold.
 *
 * With the drawing, a cylinder is named the way its panel names it -- by its
 * two mounts -- rather than by the barrel the flag happens to be written on,
 * which is a link id no reader has seen.
 */
export function describeHold(link: RealLink, joints?: readonly Joint[]): string {
  const sealed = joints ? cylinderOf(link, joints) : undefined;
  const name = sealed
    ? `${sealed.barrelFar.name || sealed.barrelFar.id}${sealed.rodFar.name || sealed.rodFar.id}`
    : link.name || link.id;
  return `fixed ${holdOf(link) === 'angle' ? 'angle' : 'length'} ${name}`;
}

/** "fixed length AB and fixed angle BC": the holds, as a list. */
export function holdList(bars: readonly RealLink[], joints?: readonly Joint[]): string {
  const names = bars.map((bar) => describeHold(bar, joints));
  return names.length <= 1
    ? names.join('')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** "Locked by fixed length AB and fixed angle BC", for a refusal. */
export function heldBySentence(bars: readonly RealLink[], joints?: readonly Joint[]): string {
  return `Locked by ${holdList(bars, joints)}`;
}
