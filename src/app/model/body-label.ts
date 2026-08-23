import { Cylinder } from './cylinder';
import { PrisJoint } from './joint';
import { Link, RealLink, SliderBlock } from './link';

/**
 * What the panels call a body.
 *
 * A link's id is the letters of its joints, which is a fine key and a poor
 * name: a cylinder's rod is named after the pin buried inside it, and a slider
 * block after the sliding joint underneath it. Neither of those joints has a
 * marker, a hitbox, or a row in any panel — so a label built from the id
 * offered the reader a part they had never been shown and could not find.
 *
 * Always a complete noun phrase, so a caller can drop it into a sentence
 * without knowing which kind of body came back.
 */
export function labelForBody(body: Link, cylinder: Cylinder | undefined): string {
  if (cylinder) {
    // By identity, with no catch-all: a compound that merely *contains* a
    // cylinder part is a welded body of its own, not another sliding body.
    // "Piston" is banned (docs/ui-vocabulary.md): the block has no name of its
    // own, so it is described by what it does, matching the Edit panel's field.
    const role =
      body === cylinder.block
        ? 'Sliding body'
        : body === cylinder.barrel
          ? 'Barrel'
          : body === cylinder.rod
            ? 'Rod'
            : undefined;
    if (role) {
      const name =
        (cylinder.barrelFar.name || cylinder.barrelFar.id) +
        (cylinder.rodFar.name || cylinder.rodFar.id);
      return `${role} ${name}`;
    }
  }
  // A block by the joint a reader can see and click, not by its pair.
  if (body instanceof SliderBlock) {
    const pin = body.joints.find((joint) => !(joint instanceof PrisJoint));
    return pin ? `Block at ${pin.name || pin.id}` : `Block ${body.id}`;
  }
  return `Link ${(body as RealLink).name || body.id}`;
}
