import { Cylinder, cylinderOfBarIn, isCylinderInner } from './cylinder';
import { Joint } from './joint';
import { Link, RealLink } from './link';

/**
 * The name a reader sees on a body: what somebody typed, or the letters of the
 * joints it runs between.
 *
 * A link's id is the concatenated ids of its joints, which is a fine key and a
 * poor name the moment one of those joints is a cylinder's buried inner end.
 * N has no marker, no letter and no hitbox, and is left out of every count the
 * app shows (D14, S11) — so a bracket welded to a barrel mount was headed
 * `Edit Link AA1D` and tagged `AA1D` on the canvas, offering the reader a joint
 * they had never been shown and could not find. It is left out of the *name*
 * too, and `AA1D` reads `AD`.
 *
 * Three answers in order:
 *
 * - A cylinder member is named by its own two ends (decision S10), never by an
 *   id that holds N — and never by the last rule here either, which on a barrel
 *   would leave the single letter of its mount. A name somebody typed on a
 *   member still wins, as it does below; `memberEnds` says how.
 * - A name somebody typed is theirs, and is returned untouched. "Typed" is a
 *   name that differs from the id, which is what `mergeLinks` already means by
 *   it when it decides whether a weld carries a name forward.
 * - Otherwise the visible joints' ids, in the order the id puts them —
 *   `mergeLinks` sorts, and this sorts the same way, so a body with nothing
 *   hidden in it comes back with exactly the name it has today. That is
 *   checked rather than assumed: with nothing to drop, the id is returned as
 *   it stands.
 */
export function visibleBodyName(body: Link, cylinders: readonly Cylinder[]): string {
  const member = memberEnds(body, cylinderOfBarIn(cylinders, body));
  if (member) return member.name;
  const written = (body as RealLink).name;
  if (written && written !== body.id) return written;
  return nameFromVisibleJoints(body, cylinders);
}

/**
 * Every joint at or under a body, once each.
 *
 * `mergeLinks` already flattens a compound's leaves into its own `joints`, so
 * for every body the app builds this is that list — but a name built from
 * fewer joints than the id was built from would be a different name, and the
 * walk is what says so out loud rather than relying on the flattening.
 */
function jointsUnder(body: Link): Joint[] {
  const found = new Map<string, Joint>();
  const visit = (link: Link) => {
    link.joints.forEach((joint) => found.set(joint.id, joint));
    if (link instanceof RealLink) link.subset.forEach(visit);
  };
  visit(body);
  return [...found.values()];
}

function nameFromVisibleJoints(body: Link, cylinders: readonly Cylinder[]): string {
  const joints = jointsUnder(body);
  const shown = joints.filter(
    (joint) => !cylinders.some((cylinder) => isCylinderInner(cylinder, joint))
  );
  // Nothing hidden: the id is the name, to the character.
  if (shown.length === joints.length || shown.length === 0) return body.name;
  return shown
    .map((joint) => joint.id)
    .sort()
    .join('');
}

/**
 * The two ends a cylinder member is named after, or nothing for any other body.
 *
 * By id rather than by identity, which is how every other consumer names a
 * member (`cylinderOfBarIn`, `paintCylinderMember`): a compound's leaf and a
 * solved sample are copies of the editable bar, so the record a caller holds
 * need not be that object.
 *
 * Two roles, where there were three. The sliding body used to be a link of its
 * own -- a zero-length block -- and had a label here because it could turn up
 * anywhere a body could; its mass is the sliding joint's own now (Stage 1 of
 * `docs/joint-type-and-cylinder-plan.md`), and a joint is named by its letter
 * rather than by this.
 *
 * Each member by its own two joints (decision S10). They were both named after
 * the cylinder's two ends, because the joint between them had no letter and no
 * marker — so the barrel and the rod, two bodies with two panels and two sets
 * of numbers, answered to the same name. The seal wears a letter now, so each
 * member can say which half of the part it is.
 */
function memberEnds(
  body: Link,
  cylinder: Cylinder | undefined
): { role: 'Barrel' | 'Rod'; name: string } | undefined {
  if (!cylinder) return undefined;
  const named = (joint: { name: string; id: string }) => joint.name || joint.id;
  // A name somebody typed is theirs on a member too: both panels offer Rename,
  // and a Rename that changed nothing a reader could see was a button that did
  // not work. "Typed" is a name that differs from the id, as it is for any
  // body -- with one exception, a name that only repeats the role. A library
  // drawing calls its two members `Barrel` and `Rod`, which said something
  // while a cylinder had one panel and says `Barrel Barrel` now that the role
  // is the noun in front of it.
  const typed = (role: string): string | undefined => {
    const written = (body as RealLink).name;
    if (!written || written === body.id) return undefined;
    return written.trim().toLowerCase() === role.toLowerCase() ? undefined : written;
  };
  if (body.id === cylinder.barrel.id) {
    return {
      role: 'Barrel',
      name: typed('Barrel') ?? `${named(cylinder.mountA)}${named(cylinder.seal)}`,
    };
  }
  if (body.id === cylinder.rod.id) {
    return {
      role: 'Rod',
      name: typed('Rod') ?? `${named(cylinder.seal)}${named(cylinder.mountB)}`,
    };
  }
  return undefined;
}

/**
 * A body's label in its two halves: the noun, and the name beside it.
 *
 * The Edit panel's title is the one caller that needs them apart — the block
 * takes the noun as its content and the name as `displayName`, so that Rename
 * replaces one of them and not the sentence. Everything else asks for the
 * phrase, which is built from this, so S10 is written once.
 *
 * `cylinder` is the one this body is a bar of, which the caller has already
 * looked up; `cylinders` is the whole drawing's, because naming an ordinary
 * body means knowing which of its joints no reader can see. Both are required,
 * and the second is the reason: a compound holding a barrel is not a bar of any
 * cylinder, so the first is `undefined` there and would have left the buried
 * joint in the name.
 */
export function bodyLabelParts(
  body: Link,
  cylinder: Cylinder | undefined,
  cylinders: readonly Cylinder[]
): { noun: string; name: string } {
  const member = memberEnds(body, cylinder);
  if (member) return { noun: member.role, name: member.name };
  return { noun: 'Link', name: visibleBodyName(body, cylinders) };
}

/**
 * What the panels call a body.
 *
 * A link's id is the letters of its joints, which is a fine key and a poor
 * name: a cylinder's members are named after joints the reader is not thinking
 * about when they point at the part, and the barrel's is the buried end that
 * nothing draws — so a label built from the id offered the reader a joint they
 * had never been shown and could not find.
 *
 * Always a complete noun phrase, so a caller can drop it into a sentence
 * without knowing which kind of body came back.
 */
export function labelForBody(
  body: Link,
  cylinder: Cylinder | undefined,
  cylinders: readonly Cylinder[]
): string {
  const { noun, name } = bodyLabelParts(body, cylinder, cylinders);
  return `${noun} ${name}`;
}
