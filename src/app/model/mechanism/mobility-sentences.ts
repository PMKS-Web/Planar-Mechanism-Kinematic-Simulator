import { visibleBodyName } from '../body-label';
import { cylindersIn } from '../cylinder';
import { Joint, PrisJoint, RealJoint } from '../joint';
import {
  diagnoseMobility,
  Drawing,
  MobilityDiagnosis,
  MobilityFix,
  StuckInput,
} from './free-motion';
import { MechanismPartition } from './mechanism-partition';
import type { ReadinessCheck, ReadinessWay } from './readiness';

/**
 * What the setup drawer says about a mechanism with the wrong number of
 * degrees of freedom: which part, and which counted edit would fix it. The
 * counting is `free-motion.ts`; this is only the words.
 */

export const nameOf = (joint: Joint): string => (joint as RealJoint).name || joint.id;

/** "A", "A or B", "A, B, or C" -- the way a sentence offers alternatives. */
const either = (items: string[]): string =>
  items.length <= 2 ? items.join(' or ') : `${items.slice(0, -1).join(', ')}, or ${items.at(-1)}`;

/**
 * "A", "A and B", "A, B, C and D", "A, B, C and 3 more" -- the way a sentence
 * lists what it found. Never "and 1 more": the one it would stand for is as
 * short as the phrase.
 */
const both = (items: string[], most = 3): string => {
  const shownItems =
    items.length > most + 1 ? [...items.slice(0, most), `${items.length - most} more`] : items;
  return shownItems.length <= 1
    ? (shownItems[0] ?? '')
    : `${shownItems.slice(0, -1).join(', ')} and ${shownItems.at(-1)}`;
};

/** One fix as the reader would do it: "grounding joint D". */
function fixPhrase(fix: MobilityFix, partition: MechanismPartition): string {
  switch (fix.kind) {
    case 'ground':
      return `grounding joint ${nameOf(fix.joint)}`;
    case 'unground':
      return `ungrounding joint ${nameOf(fix.joint)}`;
    case 'pin-in-slot':
      return `making joint ${nameOf(fix.joint)} a Pin-in-slot`;
    case 'prismatic':
      return `making joint ${nameOf(fix.joint)} Prismatic`;
    case 'weld':
      return `welding joint ${nameOf(fix.joint)}`;
    case 'unweld':
      return `unwelding joint ${nameOf(fix.joint)}`;
    case 'merge':
      return `dragging joint ${nameOf(fix.joint)} onto joint ${nameOf(fix.onto)}`;
    case 'connect':
      return `attaching a link from joint ${nameOf(fix.joint)} to joint ${nameOf(fix.to)}`;
    case 'delete-link':
      return `deleting link ${visibleBodyName(fix.link, cylindersIn(partition.joints))}`;
  }
}

/**
 * The fixes, as one sentence that says they were counted: "Grounding joint D, or
 * ungrounding joint A, would each leave one degree of freedom."
 */
export function fixSentence(
  fixes: MobilityFix[],
  partition: MechanismPartition,
  outcome = 'leave one degree of freedom'
): string {
  const phrases = fixes.map((fix) => fixPhrase(fix, partition));
  if (phrases.length === 0) return '';
  const sentence = either(phrases);
  const each = phrases.length > 1 ? ' each' : '';
  return `${sentence[0].toUpperCase()}${sentence.slice(1)} would${each} ${outcome}.`;
}

/** One fix as an instruction, the way it heads a line of its own: "Ground joint D". */
function instruction(fix: MobilityFix, partition: MechanismPartition): string {
  const phrase = fixPhrase(fix, partition)
    .replace(/^grounding/, 'ground')
    .replace(/^ungrounding/, 'unground')
    .replace(/^making/, 'make')
    .replace(/^unwelding/, 'unweld')
    .replace(/^welding/, 'weld')
    .replace(/^dragging/, 'drag')
    .replace(/^attaching/, 'attach')
    .replace(/^deleting/, 'delete');
  return `${phrase[0].toUpperCase()}${phrase.slice(1)}`;
}

/** The part a fix is about, and the button that goes to it. */
function wayTo(fix: MobilityFix): Pick<ReadinessWay, 'at' | 'action'> {
  return fix.kind === 'delete-link'
    ? { at: fix.link, action: 'Go To Link' }
    : { at: fix.joint, action: 'Go To Joint' };
}

/**
 * The counted fixes -- and a piece of advice beside them, where there is one --
 * said the way a reader can choose between them.
 *
 * One is a sentence and a button. Several are a list, each with a button of
 * its own: every one of them runs, and which is right depends on what the
 * reader meant, which the drawing cannot say. Ranking them by a guess -- the
 * edit made last, say -- would put back the drawing the reader already had,
 * which is what Undo is for.
 */
export function resolution(
  fixes: MobilityFix[],
  partition: MechanismPartition,
  outcome = 'leave one degree of freedom',
  advice?: ReadinessWay
): Pick<ReadinessCheck, 'at' | 'action' | 'ways'> & { sentence: string } {
  if (fixes.length === 0) return { sentence: '' };
  if (fixes.length === 1 && !advice) {
    return { sentence: fixSentence(fixes, partition, outcome), ...wayTo(fixes[0]) };
  }
  const ways: ReadinessWay[] = [
    ...fixes.map((fix) => ({ text: instruction(fix, partition), ...wayTo(fix) })),
    ...(advice ? [advice] : []),
  ];
  return { sentence: `Any one of these would ${outcome}:`, ways, ...wayTo(fixes[0]) };
}

/** Where the Go To button should land: the fix first, then the loose part. */
export function focusOf(diagnosis: MobilityDiagnosis): Pick<ReadinessCheck, 'at' | 'action'> {
  const fix = diagnosis.fixes[0];
  if (fix?.kind === 'delete-link') return { at: fix.link, action: 'Go To Link' };
  const joint = fix?.joint ?? diagnosis.attachAt ?? diagnosis.looseJoints[0];
  return joint ? { at: joint, action: 'Go To Joint' } : {};
}

/** "link BC can" / "links BC and CD can": what is loose, as the subject of a sentence. */
export function looseSubject(diagnosis: MobilityDiagnosis, partition: MechanismPartition): string {
  const cylinders = cylindersIn(partition.joints);
  const linkNames = diagnosis.looseLinks.map((link) => visibleBodyName(link, cylinders));
  return `${linkNames.length === 1 ? 'link' : 'links'} ${both(linkNames)}`;
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

/**
 * More than one degree of freedom: say which parts are loose and what would fix
 * it, from the drawing itself (`free-motion.ts`).
 *
 * "Ground another joint, or connect a free joint to a second link" was advice
 * for no drawing in particular, and on the simplest loose chain -- A-B-C
 * grounded at A -- grounding C leaves it rigid. Every fix named here has been
 * counted; where none of the simple edits works, the one piece of advice left
 * is the link a four-bar is finished with, and it is said as advice.
 */
export function tooFree(
  dof: number,
  partition: MechanismPartition,
  drawing?: Drawing
): ReadinessCheck {
  const title = `This mechanism has ${dof} degrees of freedom`;
  const diagnosis = diagnoseMobility(partition, drawing);
  if (diagnosis.stuck) return stuckCheck(diagnosis.stuck, diagnosis, partition, dof);
  const beside = besideCheck(diagnosis);
  if (beside) return beside;
  const driven = drivenOwnJoint(partition);
  // A link left hanging is as likely the first bar of more linkage as a
  // mistake, so finishing it is offered beside deleting it.
  const attach = diagnosis.attachAt;
  const { sentence, ...focus } = resolution(
    diagnosis.fixes,
    partition,
    undefined,
    attach
      ? {
          text: `Attach a link from joint ${nameOf(attach)} to a new grounded joint`,
          at: attach,
          action: 'Go To Joint',
        }
      : undefined
  );
  const wayOut =
    sentence ||
    wayOutOf(
      diagnosis,
      'Ground another joint, or connect a free joint to a second link, until this reads 1.'
    );
  const pointer = sentence ? focus : focusOf(diagnosis);

  if (driven && diagnosis.looseLinks.length > 0) {
    const one = diagnosis.looseLinks.length === 1;
    return {
      state: 'blocker',
      title,
      body: `With the input held still, ${looseSubject(diagnosis, partition)} can still move, so the input alone cannot say where ${one ? 'it goes' : 'they go'}. ${wayOut}`,
      ...pointer,
    };
  }
  return {
    state: 'blocker',
    title,
    body: `One input controls only one degree of freedom, and this mechanism can move in ${dof} independent ways. ${wayOut}`,
    ...pointer,
  };
}

/**
 * The input's own part cannot move, whatever the count says (`stuckInput` in
 * `free-motion.ts`): said instead of "a dead position", whose advice -- drag a
 * joint off the limit -- no drag can follow, and instead of a count that reads
 * one only because a link hangs loose somewhere else.
 */
export function stuckCheck(
  stuck: StuckInput,
  diagnosis: MobilityDiagnosis,
  partition: MechanismPartition,
  /** The count a reader is shown, where it is the drawing's; undefined where it is not. */
  dof?: number
): ReadinessCheck {
  const driven = drivenOwnJoint(partition);
  const verb = driven instanceof PrisJoint ? 'slide' : 'turn';
  const cylinders = cylindersIn(partition.joints);
  const linkNames = stuck.links.map((link) => visibleBodyName(link, cylinders));
  const one = linkNames.length === 1;
  const rigid = one
    ? `Link ${linkNames[0]} is held fixed by the ground, so it cannot move.`
    : `Links ${both(linkNames)} form a rigid structure with the ground, so none of them can move.`;
  // The count a reader can see is the one thing this has to explain: it reads
  // right, and it is not the input's. Where the count is not what the drawing
  // measures, no number is said at all.
  const loose = diagnosis.looseLinks;
  const their = loose.length === 1 ? 'its' : 'their';
  const counted =
    loose.length === 0
      ? ''
      : dof !== undefined && Number.isFinite(dof) && dof >= 1
        ? ` The ${dof === 1 ? 'one degree' : `${dof} degrees`} of freedom it counts ${dof === 1 ? 'is' : 'are'} ${looseSubject(diagnosis, partition)}, moving on ${their} own.`
        : ` Only ${looseSubject(diagnosis, partition)} can move, on ${their} own.`;
  const { sentence, ...ways } = resolution(
    stuck.fixes,
    partition,
    `let the input move ${one ? 'it' : 'them'}`
  );
  const wayOut =
    sentence ||
    `Delete one of ${one ? 'its' : 'their'} links or unground one of ${one ? 'its' : 'their'} joints, so the input has something that can move.`;
  const focus: Pick<ReadinessCheck, 'at' | 'action' | 'ways'> = sentence
    ? ways
    : stuck.links[0]
      ? { at: stuck.links[0], action: 'Go To Link' }
      : {};
  return {
    state: 'blocker',
    title: `The input at joint ${driven ? nameOf(driven) : ''} cannot ${verb}`,
    body: `${rigid}${counted} ${wayOut}`,
    ...focus,
  };
}

/** Advice for the case no single counted edit fixes: a link to ground at a free end. */
export function wayOutOf(diagnosis: MobilityDiagnosis, otherwise: string): string {
  const at = diagnosis.attachAt;
  return at
    ? `Attach a link from joint ${nameOf(at)} to a new grounded joint, so it has something to move against.`
    : otherwise;
}

/**
 * None, or fewer: say which one edit would let it move, counted the same way.
 *
 * The weld sentence stays for the drawing no single edit frees -- a weld takes
 * freedom away, and unwelding is not an edit the count can make without
 * rebuilding the bodies, so it is said as a possibility rather than a result.
 */
export function overConstrained(
  dof: number,
  partition: MechanismPartition,
  drawing?: Drawing
): ReadinessCheck {
  const diagnosis = diagnoseMobility(partition, drawing);
  const beside = besideCheck(diagnosis);
  if (beside) return beside;
  const { sentence, ...ways } = resolution(diagnosis.fixes, partition);
  const welded = partition.ownJoints.some((joint) => joint instanceof RealJoint && joint.isWelded);
  return {
    state: 'blocker',
    title: `This mechanism has ${dof} degrees of freedom`,
    body:
      'It is over-constrained, so nothing can move at all. ' +
      (sentence ||
        'Remove a link, or unground a joint, until this reads 1.' +
          (welded ? ' A weld also removes freedom — unwelding a joint is another way out.' : '')),
    ...(sentence ? ways : focusOf(diagnosis)),
  };
}

/**
 * Two joints drawn one beside the other, where one was meant: said before
 * anything the count would make of it, because the count is a symptom. Only
 * when the merge is the first fix the diagnosis counted.
 */
export function besideCheck(diagnosis: MobilityDiagnosis): ReadinessCheck | undefined {
  const fix = diagnosis.fixes[0];
  if (fix?.kind !== 'merge') return undefined;
  return besideAdvice(fix.joint, fix.onto, 'would leave one degree of freedom.');
}

/** The sentence for two joints beside each other, ending in what joining them does. */
export function besideAdvice(joint: RealJoint, onto: RealJoint, joining: string): ReadinessCheck {
  return {
    state: 'blocker',
    title: `Joint ${nameOf(joint)} is not joined to joint ${nameOf(onto)}`,
    body: `The two are drawn almost on top of each other, so they look like one joint, but the links on each are not connected. Dragging joint ${nameOf(joint)} onto joint ${nameOf(onto)} ${joining}`,
    at: joint,
    action: 'Go To Joint',
  };
}
