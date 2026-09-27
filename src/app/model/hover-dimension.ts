/**
 * Which two points a hover dimension on a body is drawn between.
 *
 * One rule, because a dimension and the field that raised it are the same
 * statement said twice — once as a number and once on the drawing — and a
 * reader who cannot lay the two over each other has been told two things.
 */

import { Cylinder, cylinderOfBarIn } from './cylinder';
import { Joint } from './joint';
import { Link } from './link';

/**
 * The span the hover dimension measures on this body.
 *
 * A bar's is its own two joints, which is the only answer it has. A cylinder's
 * barrel and rod have two, and they belong to different fields: the Length
 * field states the *member's* own span — the barrel from its mount to the
 * mouth, the rod from the seal to the joint at its end — while the Angle field
 * states the one direction the whole part points in, which is a fact about the
 * part and is measured between its two end joints (decision D10).
 *
 * Both used to answer end joint to end joint, from the days when one panel
 * described the whole cylinder and its Length *was* that span. With a panel
 * per member the length answer stopped being true: the field read the rod at
 * 0.89 cm and hovering it drew 1.97 cm across the whole part.
 */
export function overlayBarEnds(
  link: Link,
  which: 'length' | 'angle',
  cylinders: readonly Cylinder[]
): [Joint, Joint] {
  const sealed = cylinderOfBarIn(cylinders, link);
  if (sealed && which === 'angle') return [sealed.mountA, sealed.mountB];
  const [from, to] = link.joints;
  return [from, to];
}
