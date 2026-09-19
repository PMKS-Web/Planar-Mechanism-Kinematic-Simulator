import { Cylinder } from './cylinder';
import { Link, RealLink } from './link';

/**
 * A body's label in its two halves: the noun, and the name beside it.
 *
 * The Edit panel's title is the one caller that needs them apart — the block
 * takes the noun as its content and the name as `displayName`, so that Rename
 * replaces one of them and not the sentence. Everything else asks for the
 * phrase, which is built from this, so S10 is written once.
 */
export function bodyLabelParts(
  body: Link,
  cylinder: Cylinder | undefined
): { noun: string; name: string } {
  if (cylinder) {
    // By identity, with no catch-all: a compound that merely *contains* a
    // cylinder part is a welded body of its own, not another cylinder part.
    //
    // Two roles, where there were three. The sliding body used to be a link of
    // its own -- a zero-length block -- and had a label here because it could
    // turn up anywhere a body could; its mass is the sliding joint's own now
    // (Stage 1 of `docs/joint-type-and-cylinder-plan.md`), and a joint is
    // named by its letter rather than by this.
    // Each member by its own two joints (decision S10). They were both named
    // after the cylinder's two ends, because the joint between them had no
    // letter and no marker — so the barrel and the rod, two bodies with two
    // panels and two sets of numbers, answered to the same name. The seal wears
    // a letter now, so each member can say which half of the part it is.
    const named = (joint: { name: string; id: string }) => joint.name || joint.id;
    const ends =
      body === cylinder.barrel
        ? ([cylinder.mountA, cylinder.seal] as const)
        : body === cylinder.rod
          ? ([cylinder.seal, cylinder.mountB] as const)
          : undefined;
    if (ends) {
      const role = body === cylinder.barrel ? 'Barrel' : 'Rod';
      return { noun: role, name: `${named(ends[0])}${named(ends[1])}` };
    }
  }
  return { noun: 'Link', name: (body as RealLink).name || body.id };
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
export function labelForBody(body: Link, cylinder: Cylinder | undefined): string {
  const { noun, name } = bodyLabelParts(body, cylinder);
  return `${noun} ${name}`;
}
