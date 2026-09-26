import { describeActuator } from '../actuator';
import { cylindersIn } from '../cylinder';
import { PrisJoint, RealJoint } from '../joint';
import { capitalized, jointRef, linkRef, listOf, nameOf, Prose, prose } from '../prose';
import {
  diagnoseMobility,
  Drawing,
  MobilityDiagnosis,
  MobilityFix,
  StuckInput,
} from './free-motion';
import { MechanismPartition } from './mechanism-partition';
import { IssueSeverity, MOST_FIXES, MOST_STEPS, SetupIssue } from './setup-issue';

/**
 * What the setup drawer says about a mechanism with the wrong number of
 * degrees of freedom: which part, and which counted edit would fix it. The
 * counting is `free-motion.ts`; this is only the words.
 */

export { nameOf };

/**
 * One fix as a reader would do it, with its parts as links: "Ground joint D",
 * "Delete link BC". A verb first, one edit, and the words of the control that
 * makes it -- the Grounded switch, the Joint Type choice, Attach Link -- so the
 * reader can find it in the Edit panel or the right-click menu.
 */
export function fixProse(fix: MobilityFix, partition: MechanismPartition): Prose {
  switch (fix.kind) {
    case 'ground':
      return prose`Ground ${jointRef(fix.joint)}`;
    case 'unground':
      return prose`Turn off Grounded for ${jointRef(fix.joint)}`;
    case 'pin-in-slot':
      return prose`Set ${jointRef(fix.joint)} to Pin-in-slot`;
    case 'prismatic':
      return prose`Set ${jointRef(fix.joint)} to Prismatic`;
    case 'weld':
      return prose`Set ${jointRef(fix.joint)} to Welded`;
    case 'unweld':
      return prose`Set ${jointRef(fix.joint)} to Revolute`;
    case 'merge':
      return prose`Drag ${jointRef(fix.joint)} onto ${jointRef(fix.onto)}`;
    case 'connect':
      return prose`Attach Link from ${jointRef(fix.joint)} to ${jointRef(fix.to)}`;
    case 'delete-link':
      return prose`Delete ${linkRef(fix.link, cylindersIn(partition.joints))}`;
  }
}

/** The counted fixes, and any advice after them, cut to the most a list shows. */
export function fixesFrom(
  fixes: MobilityFix[],
  partition: MechanismPartition,
  ...advice: Prose[]
): Prose[] {
  return [...fixes.map((fix) => fixProse(fix, partition)), ...advice].slice(0, MOST_FIXES);
}

/** A free end finished the way a four-bar is: a link from it to the ground. */
export const attachAdvice = (joint: RealJoint): Prose =>
  prose`Attach Link at ${jointRef(joint)}, then ground its far end`;

/** The links that still move with the input held, as parts of a sentence. */
function looseLinks(diagnosis: MobilityDiagnosis, partition: MechanismPartition): Prose {
  const cylinders = cylindersIn(partition.joints);
  return listOf(diagnosis.looseLinks.map((link) => linkRef(link, cylinders)));
}

/**
 * The joint of *this machine* the reader has switched Driven Input on for.
 *
 * `ownJoints` rather than everything the partition was handed, and the reason
 * is that `ownJoints` is exactly the set `Mechanism` was given as
 * `ownJointIds`: it clears `input` on every copy outside that set, so this list
 * and the solver's answer are two readings of one fact. A machine solved
 * against a frame piece it shares with a neighbor is handed that neighbor's
 * driven pin in `joints`, and reading *that* would make "nothing drives this
 * mechanism" unsayable for a machine which genuinely has no drive of its own.
 */
export function drivenOwnJoint(partition: MechanismPartition): RealJoint | undefined {
  return partition.ownJoints.find((joint) => joint instanceof RealJoint && joint.input) as
    RealJoint | undefined;
}

/** Whether the driven joint is one the input can hold still, which a refused one is not. */
function holdsInput(partition: MechanismPartition): boolean {
  const driven = drivenOwnJoint(partition);
  return !!driven && typeof describeActuator(driven) !== 'string';
}

/**
 * More than one degree of freedom: say which parts are loose and what would fix
 * it, from the drawing itself (`free-motion.ts`).
 *
 * "Ground another joint, or connect a free joint to a second link" was advice
 * for no drawing in particular, and on the simplest loose chain -- A-B-C
 * grounded at A -- grounding C leaves it rigid. Every fix named here has been
 * counted; where none of the simple edits works, what is left is said as
 * advice, and the label over the list says it is a suggestion.
 */
export function tooFree(dof: number, partition: MechanismPartition, drawing?: Drawing): SetupIssue {
  const diagnosis = diagnoseMobility(partition, drawing);
  if (diagnosis.stuck) return stuckIssue(diagnosis.stuck, diagnosis, partition, dof);
  const beside = besideIssueOf(diagnosis);
  if (beside) return beside;
  const summary =
    holdsInput(partition) && diagnosis.looseLinks.length > 0
      ? prose`With the input held still, ${looseLinks(diagnosis, partition)} can still move.`
      : prose`The mechanism can move in ${dof} independent ways.`;
  // No single edit gets there: each loose part needs one of its own, and the
  // reader is told what each can have rather than one piece of advice.
  const steps = diagnosis.steps ?? [];
  const freeEnds = diagnosis.freeEnds ?? [];
  if (diagnosis.fixes.length === 0 && steps.length + freeEnds.length > 0) {
    return {
      severity: 'blocker',
      title: `${dof} degrees of freedom, needs 1`,
      summary,
      explain:
        'One input drives one motion, and each part that moves on its own adds another. Each of these takes one away, so make one for each loose part.',
      fixes: [...steps.map((fix) => fixProse(fix, partition)), ...freeEnds.map(attachAdvice)].slice(
        0,
        MOST_STEPS
      ),
    };
  }
  // A link left hanging is as likely the first bar of more linkage as a
  // mistake, so finishing it is offered beside deleting it.
  const attach = diagnosis.attachAt ? [attachAdvice(diagnosis.attachAt)] : [];
  const fixes = diagnosis.fixes.length
    ? fixesFrom(diagnosis.fixes, partition, ...attach)
    : attach.length
      ? attach
      : [prose`Ground another joint`, prose`Attach Link to a joint that moves freely`];
  return {
    severity: 'blocker',
    title: `${dof} degrees of freedom, needs 1`,
    summary,
    explain:
      'One input drives one motion. With more degrees of freedom than inputs, part of the mechanism can move on its own.',
    fixes,
  };
}

/**
 * None, or fewer: say which one edit would let it move, counted the same way.
 * Where no single edit counts, the kinds of edit that take a constraint away.
 */
export function overConstrained(
  dof: number,
  partition: MechanismPartition,
  drawing?: Drawing
): SetupIssue {
  const diagnosis = diagnoseMobility(partition, drawing);
  const beside = besideIssueOf(diagnosis);
  if (beside) return beside;
  const welded = partition.ownJoints.some((joint) => joint instanceof RealJoint && joint.isWelded);
  const fixes = diagnosis.fixes.length
    ? fixesFrom(diagnosis.fixes, partition)
    : [
        prose`Delete a link`,
        prose`Turn off Grounded for a joint`,
        ...(welded ? [prose`Set a welded joint to Revolute`] : []),
      ];
  return {
    severity: 'blocker',
    title: "Over-constrained, can't move",
    summary: prose`The count comes to ${dof} degrees of freedom, so nothing can move.`,
    explain:
      'Each link adds freedom and each joint takes some away. When the joints take more than the links add, the links hold each other still, like a truss.',
    fixes,
  };
}

/**
 * The input's own part cannot move, whatever the count says (`stuckInput` in
 * `free-motion.ts`): said instead of "a dead position", whose advice -- drag a
 * joint off the limit -- no drag can follow, and instead of a count that reads
 * one only because a link hangs loose somewhere else.
 */
export function stuckIssue(
  stuck: StuckInput,
  diagnosis: MobilityDiagnosis,
  partition: MechanismPartition,
  /** The count a reader is shown, where it is the drawing's; undefined where it is not. */
  dof?: number
): SetupIssue {
  const driven = drivenOwnJoint(partition);
  const verb = driven instanceof PrisJoint ? 'slide' : 'turn';
  const cylinders = cylindersIn(partition.joints);
  const links = stuck.links.map((link) => linkRef(link, cylinders));
  const one = links.length === 1;
  // The count a reader can see is the one thing this has to explain: it reads
  // right, and it is not the input's.
  const countsOne = diagnosis.looseLinks.length > 0 && dof !== undefined && dof >= 1;
  return {
    severity: 'blocker',
    title: driven ? `Input at joint ${nameOf(driven)} can't ${verb}` : `The input can't ${verb}`,
    summary: one
      ? prose`${links[0]} is locked in place by the ground.`
      : prose`${listOf(links)} are locked in place by the ground.`,
    explain: countsOne
      ? 'An input can only move a link that is free to move. If the count still says 1, that freedom belongs to another part moving on its own.'
      : 'An input can only move a link that is free to move. A link held still by the ground, or by other links, gives it nothing to turn.',
    fixes: stuck.fixes.length
      ? fixesFrom(stuck.fixes, partition)
      : one
        ? [
            prose`Delete a link that holds ${links[0]}`,
            prose`Turn off Grounded for a joint of ${links[0]}`,
          ]
        : [prose`Delete one of the locked links`, prose`Turn off Grounded for one of their joints`],
  };
}

/**
 * A part held by nothing but its own joints while the count reads one: the
 * drawing moves in more ways than it counts.
 */
export function looseIssue(
  ways: number,
  diagnosis: MobilityDiagnosis,
  partition: MechanismPartition
): SetupIssue {
  const cylinders = cylindersIn(partition.joints);
  const loose = diagnosis.looseLinks;
  const attach = diagnosis.attachAt ? [attachAdvice(diagnosis.attachAt)] : [];
  const first = loose[0] ? linkRef(loose[0], cylinders) : undefined;
  const fixes = diagnosis.fixes.length
    ? fixesFrom(diagnosis.fixes, partition, ...attach)
    : [
        ...attach,
        ...(first ? [prose`Ground a joint of ${first}`, prose`Delete ${first}`] : []),
      ].slice(0, MOST_FIXES);
  return {
    severity: 'blocker',
    title: first
      ? loose.length === 1
        ? `${capitalized(first.label)} moves on its own`
        : 'Some links move on their own'
      : 'Part of the mechanism moves freely',
    summary: loose.length
      ? prose`With the input held still, ${looseLinks(diagnosis, partition)} can still move.`
      : prose`The count reads 1, but the drawing can move in ${ways} ways.`,
    explain:
      "The count of degrees of freedom can read 1 while a part still swings freely. The input alone can't say where that part goes.",
    fixes: fixes.length ? fixes : [prose`Attach Link from the loose part to the mechanism`],
  };
}

/**
 * Two joints drawn one beside the other, where one was meant: said before
 * anything the count would make of it, because the count is a symptom. Only
 * when the merge is the first fix the diagnosis counted.
 */
export function besideIssueOf(diagnosis: MobilityDiagnosis): SetupIssue | undefined {
  const fix = diagnosis.fixes[0];
  if (fix?.kind !== 'merge') return undefined;
  return besideIssue(fix.joint, fix.onto);
}

/** Two joints beside each other, as one issue. */
export function besideIssue(
  joint: RealJoint,
  onto: RealJoint,
  severity: IssueSeverity = 'blocker'
): SetupIssue {
  return {
    severity,
    title: `Joint ${nameOf(joint)} isn't joined to joint ${nameOf(onto)}`,
    summary: prose`${jointRef(joint)} sits almost on top of ${jointRef(onto)}, but they're two joints.`,
    explain:
      'Links move together only where they share one joint. Two joints drawn in the same place still let their links come apart.',
    fixes: [prose`Drag ${jointRef(joint)} onto ${jointRef(onto)}`],
  };
}
