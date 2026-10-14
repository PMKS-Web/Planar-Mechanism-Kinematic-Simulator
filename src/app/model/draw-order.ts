import { Joint, PrisJoint } from './joint';
import { Link, RealLink } from './link';

/**
 * How deep in the stack each body sits, so nothing is drawn over something it
 * is supposed to be inside.
 *
 * Two rules, and they are not layers:
 *
 *   a block is above the carrier it slides in
 *   a link is above the block it is pinned to
 *
 * Fixed layers can only satisfy both when no link is ever both a carrier and a
 * rider — and the Scotch yoke's yoke is exactly that. Its own block is drawn
 * over it, its guide's block is drawn under it, and no assignment of the two to
 * "layer 2" and "layer 4" can express that. So the depth is derived from the
 * chain instead: a grounded guide's block starts at 1, its rider at 2, the
 * block riding *that* at 3, and so on for as far as the mechanism stacks.
 *
 * A link that is nothing's rider stays at 0 and is drawn with the ordinary
 * links, which is every link in a mechanism with no sliders in it.
 */
export interface DrawDepths {
  /** By link id. */
  link: Map<string, number>;
  /** By the id of the sliding joint the block belongs to. */
  block: Map<string, number>;
}

export function drawDepths(joints: Joint[]): DrawDepths {
  const assemblies = joints
    .filter((joint): joint is PrisJoint => joint instanceof PrisJoint)
    .map((slider) => ({ slider, riders: ridersOf(slider) }));

  const link = new Map<string, number>();
  const block = new Map<string, number>();
  const depthOf = (id: string, from: Map<string, number>) => from.get(id) ?? 0;

  // Relaxed rather than sorted: a mechanism can in principle wire two
  // assemblies to ride each other, which is a cycle with no correct answer, and
  // a fixed number of passes settles every acyclic case while refusing to spin
  // on a cyclic one.
  for (let pass = 0; pass <= assemblies.length; pass++) {
    let moved = false;
    for (const { slider, riders } of assemblies) {
      const carrier = slider.isFloating ? slider.carrier : undefined;
      const wanted = (carrier ? depthOf(carrier.id, link) : 0) + 1;
      if (wanted > depthOf(slider.id, block)) {
        block.set(slider.id, wanted);
        moved = true;
      }
      const above = depthOf(slider.id, block) + 1;
      for (const rider of riders) {
        if (above > depthOf(rider.id, link)) {
          link.set(rider.id, above);
          moved = true;
        }
      }
    }
    if (!moved) break;
  }

  return { link, block };
}

/**
 * The links pinned to a slider.
 *
 * Its own links, and that is the whole of it. A slider used to be a prismatic
 * joint, a coincident pin and a block joining them, so the riders were the
 * *pin's* links and had to be reached through the block -- and a slider with no
 * pin had no answer at all. One joint carries them now (Stage 1 of
 * `docs/joint-type-and-cylinder-plan.md`), so there is always an answer and it
 * is never empty by accident.
 */
function ridersOf(slider: PrisJoint): Link[] {
  return slider.links.filter((member): member is RealLink => member instanceof RealLink);
}
