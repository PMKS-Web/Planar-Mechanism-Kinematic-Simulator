import { Joint, RealJoint } from './joint';
import { Link, RealLink, LinkHold } from './link';
import { Cylinder, cylindersIn } from './cylinder';
import { visibleBodyName } from './body-label';
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
  return membersOf(cylindersIn(joints as Joint[]));
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
    for (const part of [sealed.barrel, sealed.rod]) {
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
  // Either member: a hold asked of the rod and a hold asked of the barrel are
  // the same hold. There was a third until Stage 1 of
  // `docs/joint-type-and-cylinder-plan.md` -- the sliding body, a zero-length
  // block link -- which was as clickable as the other two; it is the sliding
  // joint's own now, and a joint carries no hold.
  return (cylinders ? membersOf(cylinders) : cylinderMembers(joints)).get(link.id);
}

/**
 * A cylinder's two members, as links a hold can be written on.
 *
 * The barrel is typed as a `Link` on the record because a welded compound can
 * stand where one should be; only a `RealLink` carries a `hold`.
 */
export function cylinderMemberLinks(sealed: Cylinder): { barrel?: RealLink; rod: RealLink } {
  return { barrel: sealed.barrel instanceof RealLink ? sealed.barrel : undefined, rod: sealed.rod };
}

/**
 * Which member is carrying the cylinder's angle, if either is.
 *
 * **Either member holds it for the whole part** (decision S5). A member holds
 * one thing, like any bar, and the URL's `H` entry is still one per link — so a
 * rod fixed at its length and a barrel fixed at the cylinder's angle is two
 * ordinary entries rather than a new kind of record. The barrel is preferred
 * when a hold is being *written*, which is where every drawing made before this
 * put it, so those keep behaving exactly as they did.
 *
 * It replaced `cylinderHoldCarrier`, which named the barrel unconditionally:
 * true of where a flag is put and wrong about where one may be found, and the
 * difference is a rod-carried angle that nothing downstream could see.
 */
export function cylinderAngleCarrier(sealed: Cylinder): RealLink | undefined {
  const { barrel, rod } = cylinderMemberLinks(sealed);
  if (barrel?.hold === 'angle') return barrel;
  return rod.hold === 'angle' ? rod : undefined;
}

/** Whether the cylinder is holding the direction it points in. */
export function cylinderHoldsAngle(sealed: Cylinder): boolean {
  return cylinderAngleCarrier(sealed) !== undefined;
}

/**
 * Whether one of a member's two rows reads as held (decision S5).
 *
 * The two answers come from different places, which is the whole reason this
 * exists: `length` is the member's own flag and `angle` is the *cylinder's*,
 * carried by whichever member happens to have it written on. So both rows of
 * one member can read held at once — its own length, and the part's angle from
 * the other member — and `holdOf`, which answers with one value, cannot say so.
 */
export function memberHoldReads(
  sealed: Cylinder,
  member: Link,
  which: 'length' | 'angle'
): boolean {
  if (which === 'angle') return cylinderHoldsAngle(sealed);
  return member instanceof RealLink && member.hold === 'length';
}

/**
 * What each member's flag becomes for one press on one member's row.
 *
 * The whole transition table, in one place, because the two doors into it —
 * a member's padlock and the plain `setHold` a bar uses — have to agree. The
 * rules it encodes (decision S5):
 *
 * - **Fix the angle** writes it on a member holding nothing, the barrel first,
 *   so a rod can keep its length while the part keeps its bearing. With both
 *   lengths already fixed there is nowhere free, and the pressed member's
 *   length gives way — which is what a bar's own second padlock does.
 * - **Release the angle** clears it from both, because it was one hold shown
 *   on two rows and releasing it from either is the same release.
 * - **Fix a length** on the member carrying the angle hands the angle to the
 *   other member first, if that member is free. It is the part's angle, not
 *   this member's, and there is no reason for it to fall off a row the reader
 *   was not looking at.
 *
 * Returns nothing when the press would change neither flag.
 */
export function memberHoldTransition(
  sealed: Cylinder,
  pressed: Link,
  which: 'length' | 'angle',
  on: boolean
): { barrel: LinkHold; rod: LinkHold } | undefined {
  const { barrel, rod } = cylinderMemberLinks(sealed);
  const was = { barrel: barrel?.hold, rod: rod.hold };
  const next = { ...was };
  const isBarrel = !!barrel && pressed.id === barrel.id;
  const isRod = !isBarrel && pressed.id === rod.id;
  if (!isBarrel && !isRod) return undefined;

  if (which === 'angle') {
    if (!on) {
      if (next.barrel === 'angle') next.barrel = undefined;
      if (next.rod === 'angle') next.rod = undefined;
    } else if (cylinderHoldsAngle(sealed)) {
      return undefined;
    } else if (barrel && next.barrel === undefined) {
      next.barrel = 'angle';
    } else if (next.rod === undefined) {
      next.rod = 'angle';
    } else if (isBarrel && barrel) {
      next.barrel = 'angle';
    } else {
      next.rod = 'angle';
    }
  } else if (!on) {
    if (isBarrel && next.barrel === 'length') next.barrel = undefined;
    if (isRod && next.rod === 'length') next.rod = undefined;
  } else if (isBarrel) {
    if (next.barrel === 'angle' && next.rod === undefined) next.rod = 'angle';
    next.barrel = 'length';
  } else {
    if (next.rod === 'angle' && barrel && next.barrel === undefined) next.barrel = 'angle';
    next.rod = 'length';
  }
  return next.barrel === was.barrel && next.rod === was.rod ? undefined : next;
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
    // Its angle, or nothing. A member's own `'length'` is never the *part's*
    // hold: it constrains a length the layout picks and is honored there
    // (decision S5), and reporting it here would hand the solver a bar across
    // two joints inside the part.
    return cylinderHoldsAngle(sealed) ? 'angle' : undefined;
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
    const hold = sealed ? (cylinderHoldsAngle(sealed) ? 'angle' : undefined) : holdOf(link);
    if (!hold) continue;
    // A cylinder's angle is measured mount to mount -- the pair the reader sees
    // and the pair its Angle field states -- not the barrel's own two joints,
    // which are inside the part and which the normalizer re-derives anyway. So
    // holding those held nothing a reader could see.
    const [a, b] = sealed ? [sealed.mountA, sealed.mountB] : link.joints;
    if (!a || !b) continue;
    // One entry per part: every member reports the whole assembly's hold.
    const id = sealed ? (cylinderAngleCarrier(sealed)?.id ?? link.id) : link.id;
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
    const carrier = sealed ? cylinderAngleCarrier(sealed) : undefined;
    if (sealed ? carrier === undefined : holdOf(link) === undefined) continue;
    const ends = sealed ? [sealed.mountA.id, sealed.mountB.id] : link.joints.map((end) => end.id);
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
 *
 * `nameOf` is for the one caller that wants a *member* named rather than the
 * part: with both lengths fixed the reader has two padlocks to choose between,
 * and naming the part twice over names neither.
 *
 * The last fallback is `visibleBodyName` and not the link's own name, which is
 * its id: a body welded to a barrel mount carries the cylinder's buried inner
 * end in that id (D14, S11), so every caller that let this fall through -- a
 * cylinder edit refused by a hold, a drag refused by one -- named a joint the
 * drawing never shows. With no joints to hand there are no cylinders to know
 * about, and the answer is the id again, unchanged.
 */
export function describeHold(
  link: RealLink,
  joints?: readonly Joint[],
  nameOf?: (bar: RealLink) => string
): string {
  const cylinders = joints ? cylindersIn([...joints]) : [];
  const sealed = joints ? cylinderOf(link, joints, cylinders) : undefined;
  const name = nameOf
    ? nameOf(link)
    : sealed
      ? `${sealed.mountA.name || sealed.mountA.id}${sealed.mountB.name || sealed.mountB.id}`
      : visibleBodyName(link, cylinders);
  return `fixed ${holdOf(link) === 'angle' ? 'angle' : 'length'} ${name}`;
}

/** "fixed length AB and fixed angle BC": the holds, as a list. */
export function holdList(
  bars: readonly RealLink[],
  joints?: readonly Joint[],
  nameOf?: (bar: RealLink) => string
): string {
  const names = bars.map((bar) => describeHold(bar, joints, nameOf));
  return names.length <= 1
    ? names.join('')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * "Held by fixed length AB and fixed angle BC", for a refusal.
 *
 * "Held", not "Locked": a Lock is the mark that pins a joint where it is, and
 * one word for two different rules is what made a reader look for the padlock
 * they had not pressed. The padlock inside a field says Fixed, the menu rows
 * say Fixed Length and Fixed Angle, and the way out of one is Release.
 */
export function heldBySentence(
  bars: readonly RealLink[],
  joints?: readonly Joint[],
  nameOf?: (bar: RealLink) => string
): string {
  return `Held by ${holdList(bars, joints, nameOf)}`;
}
