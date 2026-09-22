import { Link, RealLink } from './link';
import { Joint, RealJoint } from './joint';
import { Cylinder } from './cylinder';

/** Visible joints which lose their final supporting primitive. */
export function orphanedByLinkRemoval(
  link: Link,
  links: Link[],
  visible: RealJoint[],
  cylinders: Cylinder[]
): RealJoint[] {
  // Everything the deletion actually takes, worked out the way the deletion
  // works it out: the body's own leaves, plus the bars of every ram the body
  // owns, because deleting a body takes its rams whole. Asking the body's
  // own joint list alone missed the ram's *opposite* mount -- a joint at the
  // far end of the drawing, plainly visible, that the row did not mention
  // and the click removed.
  const doomed = new Set<string>(
    [link, ...(link instanceof RealLink ? link.subset : [])].map((one) => one.id)
  );
  for (const sealed of cylinders) {
    for (const bar of [sealed.barrel, sealed.rod]) doomed.add(bar.id);
  }
  const survives = (candidate: Link): boolean => {
    if (doomed.has(candidate.id)) return false;
    if (!(candidate instanceof RealLink) || candidate.subset.length === 0) return true;
    // A compound survives only as much of it as is left.
    return candidate.subset.some((leaf) => !doomed.has(leaf.id));
  };
  const held = (joint: Joint) =>
    links.some(
      (candidate) =>
        survives(candidate) &&
        (candidate.joints.includes(joint) ||
          (candidate instanceof RealLink &&
            candidate.subset.some((leaf) => !doomed.has(leaf.id) && leaf.joints.includes(joint))))
    );
  // Only what the reader can see (D14): saying "and 2 joints" about points
  // nobody is shown would be a number they cannot check against the screen.
  // That is one joint per cylinder now, its derived inner end -- the seal is
  // the square on the skin, so a click that takes it is a click that takes
  // something visible away.
  return visible.filter((joint) => !held(joint));
}
