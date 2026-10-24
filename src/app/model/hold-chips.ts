/**
 * Which held values wear a chip on the drawing, and what each one is measured
 * between.
 *
 * **Built from what reads as held, not from what the solver is fed.** For a
 * bar the two lists are the same. For a cylinder they are deliberately
 * different: a member's `'length'` hold constrains a length the *layout*
 * chooses, so it is never handed to the hold solver (decision S5) and
 * `heldBars` leaves it out on purpose. A chip list built from that list
 * therefore drew nothing at all on a barrel or a rod whose padlock the reader
 * had just pressed — the panel said Fixed, the menu said Fixed, and the canvas
 * said nothing.
 *
 * The angle is the other half of the same split. It belongs to the whole part
 * rather than to either member, so it is one chip across the two end joints,
 * however many members happen to be carrying the flag.
 */

import { Cylinder } from './cylinder';
import { Joint } from './joint';
import { Link, RealLink } from './link';
import { cylinderAngleCarrier, holdOf, memberHoldReads } from './link-holds';

/** One held value, and the span it labels. */
export interface HoldChip {
  /** The link the value is written on: what `data-hold-chip` names. */
  id: string;
  /** That link itself, for placing the chip along it and for asking about locks. */
  link: RealLink;
  hold: 'length' | 'angle';
  /** The two ends of the span this value is about. */
  a: Joint;
  b: Joint;
}

/**
 * Every chip the drawing should be wearing.
 *
 * `links` is the top-level list and `cylinders` the drawing's rams. The two are
 * asked separately rather than one from the other, because a member welded
 * into a neighbor survives as a subset leaf and is not in the top-level list at
 * all — and a fixed length is just as fixed once its mount has been welded to
 * a bracket.
 */
export function holdChips(links: readonly Link[], cylinders: readonly Cylinder[]): HoldChip[] {
  const memberIds = new Set(cylinders.flatMap((one) => [one.barrel.id, one.rod.id]));
  const chips: HoldChip[] = [];

  for (const link of links) {
    if (!(link instanceof RealLink) || memberIds.has(link.id)) continue;
    const hold = holdOf(link);
    const [a, b] = link.joints;
    if (hold && a && b) chips.push({ id: link.id, link, hold, a, b });
  }

  for (const sealed of cylinders) {
    for (const member of [sealed.barrel, sealed.rod]) {
      if (!(member instanceof RealLink)) continue;
      if (!memberHoldReads(sealed, member, 'length')) continue;
      // The member's own two joints: the barrel from its mount to the mouth,
      // the rod from the seal to the joint at its end. Which is the span its
      // Length field states, and the span its hover dimension draws.
      const [a, b] = member.joints;
      if (a && b) chips.push({ id: member.id, link: member, hold: 'length', a, b });
    }
    // One angle, once, on the pair the reader can see — not once per member,
    // and not across the barrel's own joints, one of which is buried.
    const carrier = cylinderAngleCarrier(sealed);
    if (carrier) {
      chips.push({
        id: carrier.id,
        link: carrier,
        hold: 'angle',
        a: sealed.mountA,
        b: sealed.mountB,
      });
    }
  }
  return chips;
}
