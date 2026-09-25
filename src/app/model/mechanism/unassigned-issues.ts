import { cylindersIn } from '../cylinder';
import { Joint, RealJoint } from '../joint';
import { capitalized, jointRef, linkRef, listOf, nameOf, prose } from '../prose';
import { UnassignedGeometry } from './mechanism-partition';
import { besideIssue } from './mobility-sentences';
import { hiddenJoints, jointsBeside } from './mobility-edits';
import { shown } from './readiness';
import { SetupIssue } from './setup-issue';

/**
 * What to say about geometry that is in no mechanism.
 *
 * Split by cause, because each has its own way out: a floating chain needs
 * grounding, a joint on its own needs a link, a link grounded at every joint is
 * frame. Several parts with the same cause are one issue that names them all,
 * because a list of five identical rows reads as five problems.
 */
export function unassignedIssues(
  unassigned: UnassignedGeometry,
  drawing: Joint[] = []
): SetupIssue[] {
  const issues: SetupIssue[] = [];
  // Every joint this report can reach, so the cylinders among them can be
  // resolved: a cylinder is looked up from its seal, and the seal is not
  // always on the body being named. What that buys is the buried inner end
  // left out of these sentences, as it is left out of every other (D14, S11).
  const around = [
    ...unassigned.floatingChains.flatMap((chain) => chain.joints),
    ...unassigned.looseJoints,
    ...unassigned.fixedLinks.flatMap((link) => link.joints),
  ];
  const cylinders = cylindersIn(around);

  const beside = jointsBeside(drawing, hiddenJoints(drawing));
  unassigned.floatingChains.forEach((chain) => {
    const sorted = shown(chain.joints, around).sort((a, b) => a.id.localeCompare(b.id));
    // Dropped beside a joint it was meant to land on: joining it is the fix,
    // and grounding it would make a mechanism nobody drew.
    const inChain = new Set(chain.joints);
    const landing = beside
      .map(([a, b]) =>
        inChain.has(a) && !inChain.has(b)
          ? [a, b]
          : inChain.has(b) && !inChain.has(a)
            ? [b, a]
            : undefined
      )
      .find((pair): pair is [RealJoint, RealJoint] => pair !== undefined);
    if (landing) {
      issues.push(besideIssue(landing[0], landing[1], 'unassigned'));
      return;
    }
    const first = sorted[0] ? jointRef(sorted[0]) : undefined;
    if (chain.links.length === 1) {
      const link = linkRef(chain.links[0], cylinders);
      issues.push({
        severity: 'unassigned',
        title: `${capitalized(link.label)} is attached to nothing`,
        summary: prose`${link} reaches neither ground nor the rest of the drawing.`,
        explain:
          'Analysis only solves chains that are grounded somewhere. A link joined to nothing has nothing to move against.',
        fixes: [...(first ? [prose`Ground ${first}`] : []), prose`Delete ${link}`],
      });
      return;
    }
    issues.push({
      severity: 'unassigned',
      title:
        sorted.length <= 3
          ? `Joints ${sorted.map(nameOf).join(', ')} never reach ground`
          : `${sorted.length} joints never reach ground`,
      summary: prose`No joint in the chain is grounded, so it has nothing to move against.`,
      explain:
        "A mechanism needs ground to move against. Until a chain reaches it, analysis can't place any of its joints.",
      fixes: [
        ...(first ? [prose`Ground ${first}`] : []),
        prose`Attach Link from the chain to a grounded joint`,
      ],
    });
  });

  unassigned.fixedLinks.forEach((body) => {
    const link = linkRef(body, cylinders);
    const grounded = body.joints.find((joint) => joint instanceof RealJoint && joint.ground);
    issues.push({
      severity: 'unassigned',
      title: `${capitalized(link.label)} is grounded at ${body.joints.length === 2 ? 'both ends' : 'every joint'}`,
      summary: prose`Every joint on ${link} is grounded, so it's part of the frame.`,
      explain:
        "A link grounded at every joint can't move. That's fine for a fixed reference, and analysis leaves it out.",
      fixes: grounded ? [prose`Turn off Grounded for ${jointRef(grounded)}`] : [],
    });
  });

  const loose = unassigned.looseJoints;
  if (loose.length > 0) {
    const refs = loose.map(jointRef);
    const one = loose.length === 1;
    issues.push({
      severity: 'unassigned',
      title: one ? `Joint ${nameOf(loose[0])} has no link` : `${loose.length} joints have no link`,
      summary: prose`${listOf(refs)} ${one ? "isn't" : "aren't"} held by any link.`,
      explain: 'A joint only moves when a link holds it. Analysis leaves out a joint with no link.',
      fixes: one
        ? [prose`Attach Link to ${refs[0]}`, prose`Delete ${refs[0]}`]
        : [prose`Attach Link to each of them`, prose`Delete ${listOf(refs)}`],
    });
  }

  return issues;
}
