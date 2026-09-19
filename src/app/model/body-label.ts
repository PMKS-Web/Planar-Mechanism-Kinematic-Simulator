import { Cylinder } from './cylinder';
import { Link, RealLink } from './link';

/**
 * What the panels call a body.
 *
 * A link's id is the letters of its joints, which is a fine key and a poor
 * name: a cylinder's rod is named after the sliding joint buried inside it,
 * which has no marker, no hitbox and no row in any panel — so a label built
 * from the id offered the reader a part they had never been shown and could
 * not find.
 *
 * Always a complete noun phrase, so a caller can drop it into a sentence
 * without knowing which kind of body came back.
 */
export function labelForBody(body: Link, cylinder: Cylinder | undefined): string {
  if (cylinder) {
    // By identity, with no catch-all: a compound that merely *contains* a
    // cylinder part is a welded body of its own, not another cylinder part.
    //
    // Two roles, where there were three. The sliding body used to be a link of
    // its own -- a zero-length block -- and had a label here because it could
    // turn up anywhere a body could; its mass is the sliding joint's own now
    // (Stage 1 of `docs/joint-type-and-cylinder-plan.md`), and a joint is
    // named by its letter rather than by this.
    const role = body === cylinder.barrel ? 'Barrel' : body === cylinder.rod ? 'Rod' : undefined;
    if (role) {
      const name =
        (cylinder.barrelFar.name || cylinder.barrelFar.id) +
        (cylinder.rodFar.name || cylinder.rodFar.id);
      return `${role} ${name}`;
    }
  }
  return `Link ${(body as RealLink).name || body.id}`;
}
