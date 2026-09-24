import { Joint, PrisJoint, RealJoint } from '../joint';
import { Link } from '../link';
import { cylindersIn } from '../cylinder';
import { describeFrozenCylinderStroke, isFrozenCylinder } from '../cylinder-frozen';
import { visibleBodyName } from '../body-label';
import { canDrive, describeActuator, framePieceAt, groundPinsElsewhere } from '../actuator';
import { Mechanism, MechanismFailure } from './mechanism';
import { MechanismPartition, UnassignedGeometry } from './mechanism-partition';
import { assignBodies } from './bodies';
import { diagnoseMobility, MobilityDiagnosis, MobilityFix } from './free-motion';

/**
 * A blocker stops the mechanism running at all. A warning means it runs, and
 * there is something about the result worth knowing before trusting it.
 */
export type CheckState = 'blocker' | 'warning';

export interface ReadinessCheck {
  state: CheckState;
  /** A short sentence-case phrase naming the situation. */
  title: string;
  /** What is wrong and what to do about it. */
  body: string;
  /** The part at fault, so the panel can offer to go to it. */
  at?: Joint | Link;
  /** Title Case, because it labels a button. */
  action?: string;
}

/** A named number about a mechanism, for the overview grid. */
export interface MechanismFact {
  label: string;
  value: string;
  /** A number that is wrong for a machine, drawn as a fault rather than a fact. */
  bad?: boolean;
}

export interface MechanismReadiness {
  id: string;
  ready: boolean;
  checks: ReadinessCheck[];
  /** What this mechanism *is*, for a reader whose question is not "why is it broken". */
  facts: MechanismFact[];
}

/** The two strings only the service can produce, passed in rather than reached for. */
export interface ReadinessHelpers {
  /** What to call a cylinder identified by its slider joint's id. */
  cylinderName(sliderId: string): string;
  /** Why this mechanism's driven joint cannot be driven, if it cannot. */
  drivenRefusal(partition: MechanismPartition): string | undefined;
  /** The cylinder-cannot-use-its-whole-stroke warning for this mechanism. */
  strokeWarning(partition: MechanismPartition): string | undefined;
  /** This mechanism's input speed, in the units the panel shows it in. */
  describeSpeed(partition: MechanismPartition): string;
}

/**
 * The joints of this list a reader has been shown.
 *
 * A cylinder's buried inner end is a joint of its barrel like any other, so it
 * arrives in `ownJoints` and in a floating chain's own list — and it has no
 * marker, no hitbox and no letter anyone can read (D14, S11). Naming it, or
 * counting it, offers a joint the drawing never draws.
 */
const shown = (joints: readonly Joint[], from: readonly Joint[] = joints): Joint[] => {
  const buried = new Set(cylindersIn([...from]).map((cylinder) => cylinder.inner.id));
  return joints.filter((joint) => !buried.has(joint.id));
};

const names = (joints: Joint[]): string =>
  joints.map((joint) => (joint as RealJoint).name || joint.id).join(', ');

const nameOf = (joint: Joint): string => (joint as RealJoint).name || joint.id;

/** "A", "A or B", "A, B, or C" -- the way a sentence offers alternatives. */
const either = (items: string[]): string =>
  items.length <= 2 ? items.join(' or ') : `${items.slice(0, -1).join(', ')}, or ${items.at(-1)}`;

/** "A", "A and B", "A, B and 2 more" -- the way a sentence lists what it found. */
const both = (items: string[], most = 3): string => {
  const shownItems =
    items.length > most ? [...items.slice(0, most), `${items.length - most} more`] : items;
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
    case 'delete-link':
      return `deleting link ${visibleBodyName(fix.link, cylindersIn(partition.joints))}`;
  }
}

/**
 * The fixes, as one sentence that says they were counted: "Grounding joint D, or
 * ungrounding joint A, would leave one degree of freedom."
 */
function fixSentence(diagnosis: MobilityDiagnosis, partition: MechanismPartition): string {
  const phrases = diagnosis.fixes.map((fix) => fixPhrase(fix, partition));
  if (phrases.length === 0) return '';
  const sentence = either(phrases);
  const each = phrases.length > 1 ? ' each' : '';
  return `${sentence[0].toUpperCase()}${sentence.slice(1)} would${each} leave one degree of freedom.`;
}

/** Where the Go To button should land: the fix first, then the loose part. */
function focusOf(diagnosis: MobilityDiagnosis): Pick<ReadinessCheck, 'at' | 'action'> {
  const fix = diagnosis.fixes[0];
  if (fix?.kind === 'delete-link') return { at: fix.link, action: 'Go To Link' };
  const joint = fix?.joint ?? diagnosis.attachAt ?? diagnosis.looseJoints[0];
  return joint ? { at: joint, action: 'Go To Joint' } : {};
}

/** "link BC can" / "links BC and CD can": what is loose, as the subject of a sentence. */
function looseSubject(diagnosis: MobilityDiagnosis, partition: MechanismPartition): string {
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
function drivenOwnJoint(partition: MechanismPartition): RealJoint | undefined {
  return partition.ownJoints.find((joint) => joint instanceof RealJoint && joint.input) as
    RealJoint | undefined;
}

/**
 * The joint the reader set as this machine's input: its own, or one on a frame
 * bar it hangs from, which is set even though it cannot turn anything.
 *
 * Asked by every surface that would otherwise say "set an input" -- the
 * playback row, the facts under the list -- because the one thing those
 * sentences must never do is ask for an input the reader can see.
 */
export function inputSetFor(partition: MechanismPartition): RealJoint | undefined {
  return drivenOwnJoint(partition) ?? inputOnTheFrame(partition)?.joint;
}

/**
 * What to say when a machine will not run and nothing above can say why.
 *
 * Two ways here. A `MechanismFailure` with no sentence of its own -- which the
 * exhaustive switch below makes a compile error, so in practice only a value
 * from outside the type could reach it -- and a build that came back invalid
 * carrying no failure at all. Either way the reader is looking at a red chip,
 * and the old code put nothing under it.
 *
 * So it says what *is* known rather than apologizing: the mobility the count
 * came to, which joint drives it, and one thing to try. "Nothing to report" is
 * not a finding, and neither is an error code.
 */
function unexplainedBlocker(partition: MechanismPartition, mechanism: Mechanism): ReadinessCheck {
  const driven = drivenOwnJoint(partition);
  const dof = mechanism.dof;
  const freedoms = Number.isFinite(dof)
    ? `${dof} ${Math.abs(dof) === 1 ? 'degree' : 'degrees'} of freedom`
    : 'no ground to move against';
  const drive = driven
    ? `has its input at joint ${driven.name || driven.id}`
    : 'has no input joint';
  return {
    state: 'blocker',
    title: 'This mechanism could not be solved',
    body:
      `It has ${freedoms} and ${drive}, and no motion came out of the pose it starts in. ` +
      'Drag a joint to start it somewhere else, or undo the last change and make it a step at a time.',
    at: driven,
    action: driven ? 'Go To Joint' : undefined,
  };
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
function tooFree(dof: number, partition: MechanismPartition): ReadinessCheck {
  const title = `This mechanism has ${dof} degrees of freedom`;
  const diagnosis = diagnoseMobility(partition);
  const driven = drivenOwnJoint(partition);
  const fixes = fixSentence(diagnosis, partition);
  const wayOut =
    fixes ||
    wayOutOf(
      diagnosis,
      'Ground another joint, or connect a free joint to a second link, until this reads 1.'
    );

  if (driven && diagnosis.looseLinks.length > 0) {
    const one = diagnosis.looseLinks.length === 1;
    return {
      state: 'blocker',
      title,
      body: `With the input held still, ${looseSubject(diagnosis, partition)} can still move, so the input alone cannot say where ${one ? 'it goes' : 'they go'}. ${wayOut}`,
      ...focusOf(diagnosis),
    };
  }
  return {
    state: 'blocker',
    title,
    body: `One input controls only one degree of freedom, and this mechanism can move in ${dof} independent ways. ${wayOut}`,
    ...focusOf(diagnosis),
  };
}

/** Advice for the case no single counted edit fixes: a link to ground at a free end. */
function wayOutOf(diagnosis: MobilityDiagnosis, otherwise: string): string {
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
function overConstrained(dof: number, partition: MechanismPartition): ReadinessCheck {
  const diagnosis = diagnoseMobility(partition);
  const fixes = fixSentence(diagnosis, partition);
  const welded = partition.ownJoints.some((joint) => joint instanceof RealJoint && joint.isWelded);
  return {
    state: 'blocker',
    title: `This mechanism has ${dof} degrees of freedom`,
    body:
      'It is over-constrained, so nothing can move at all. ' +
      (fixes ||
        'Remove a link, or unground a joint, until this reads 1.' +
          (welded ? ' A weld also removes freedom — unwelding a joint is another way out.' : '')),
    ...focusOf(diagnosis),
  };
}

/**
 * The one blocker a named failure earns, worst first.
 *
 * **The switch is exhaustive on purpose.** `default` narrows `failure` to
 * `never`, so adding a member to `MechanismFailure` without a sentence for it
 * is a compile error rather than a red chip with nothing under it. The runtime
 * fallback stands behind that for a value the types cannot see -- an older
 * saved state, a string from outside.
 */
function blockerForFailure(
  failure: MechanismFailure,
  partition: MechanismPartition,
  mechanism: Mechanism,
  helpers: ReadinessHelpers
): ReadinessCheck {
  switch (failure) {
    case 'dangling-slider': {
      const dangling = partition.joints.filter(
        (joint) => joint instanceof PrisJoint && joint.isDangling
      );
      return {
        state: 'blocker',
        title: 'A slider has nothing to slide along',
        body: `Slider ${names(dangling)} has no slot and no ground, so there is no direction for it to move in. Drag it onto a link to cut a slot, or ground it to fix its direction.`,
        at: dangling[0],
        action: 'Go To Slider',
      };
    }

    case 'mobility': {
      const dof = mechanism.dof;
      if (Number.isNaN(dof)) {
        return {
          state: 'blocker',
          title: 'Nothing holds this mechanism in place',
          body: 'It has no ground, so every part of it is free to drift. Ground a joint, or ground a slider’s guide.',
        };
      }
      if (dof > 1) {
        return tooFree(dof, partition);
      }
      return overConstrained(dof, partition);
    }

    case 'not-driven': {
      // The one sentence in this file that can be *false about the drawing the
      // reader is looking at*, so it is the one sentence asked twice. The
      // solver's copy said no joint of this machine is driven; the editable
      // drawing is what the reader sees, and if it has a driven joint then
      // whatever went wrong is not that. Telling somebody to switch on the
      // input they have already switched on is how this was reported.
      const alreadyDriven = drivenOwnJoint(partition);
      if (alreadyDriven) return unexplainedBlocker(partition, mechanism);
      // Point at a joint that could actually take the job, so the button is an
      // answer rather than a place to start looking.
      const candidate = partition.ownJoints.find(
        (joint) => joint instanceof RealJoint && canDrive(joint)
      );
      return {
        state: 'blocker',
        title: 'No input is set',
        body: candidate
          ? `There is no time to solve against until one joint is set as the input. Right-click joint ${(candidate as RealJoint).name || candidate.id} and set it as the input.`
          : 'There is no time to solve against until one joint is set as the input. Right-click a grounded joint and set it as the input.',
        at: candidate,
        action: candidate ? 'Go To Joint' : undefined,
      };
    }

    case 'cylinder-has-no-travel': {
      const id = mechanism.unusableCylinder;
      const subject = id ? `Cylinder ${helpers.cylinderName(id)}` : 'This cylinder';
      return {
        state: 'blocker',
        title: 'A cylinder has no travel',
        body: `${subject} has a barrel too short for its rod to slide in at all. Increase Barrel Length to provide room for the piston to travel.`,
      };
    }

    case 'dead-position':
      return {
        state: 'blocker',
        title: 'This mechanism starts at a dead position',
        body: 'The input joint is at a limit of its travel and cannot turn away from it in either direction. Drag a joint to move the mechanism off the limit.',
      };

    case 'hidden-freedom': {
      const ways = mechanism.hiddenFreedoms ?? 2;
      const diagnosis = diagnoseMobility(partition);
      if (diagnosis.looseLinks.length === 0) {
        return {
          state: 'blocker',
          title: 'A part of this mechanism is tied to nothing',
          body: `It counts as one degree of freedom, but the drawing can move in ${ways} independent ways: some part is held by nothing but its own joints, so the input alone cannot say where it goes. Attach its free end, ground it, or remove it.`,
        };
      }
      const one = diagnosis.looseLinks.length === 1;
      return {
        state: 'blocker',
        title: 'A part of this mechanism is tied to nothing',
        body:
          `It counts as one degree of freedom, but with the input held still ${looseSubject(diagnosis, partition)} can still move: ${one ? 'it is' : 'they are'} held by nothing but ${one ? 'its' : 'their'} own joints. ` +
          (fixSentence(diagnosis, partition) ||
            wayOutOf(diagnosis, 'Attach its free end, ground it, or remove it.')),
        ...focusOf(diagnosis),
      };
    }

    case 'cycle-never-closes': {
      const gap = mechanism.cycleGap;
      return {
        state: 'blocker',
        title: 'The motion never repeats',
        body:
          'This mechanism never comes back to the pose it started in, so there is no cycle to animate.' +
          (gap !== undefined && Number.isFinite(gap)
            ? gap < 0.5
              ? ` The closest it comes is ${gap.toFixed(2)} units away — a loop that only just fails to close usually has a link length slightly off.`
              : ` The closest it comes is ${gap.toFixed(1)} units away — the motion wanders rather than repeating. Check the link lengths.`
            : ' Check the link lengths — a loop that only just closes can wander instead of repeating.'),
      };
    }

    case 'nothing-can-move': {
      const unreachable = shown(
        partition.ownJoints.filter((joint) => mechanism.unreachableJoints.includes(joint.id)),
        partition.joints
      );
      return {
        state: 'blocker',
        title: 'Nothing moves when the input turns',
        body:
          unreachable.length > 0
            ? `The solver never finds a position for ${
                unreachable.length === 1 ? 'joint' : 'joints'
              } ${names(unreachable)} — the input joint cannot reach ${
                unreachable.length === 1 ? 'it' : 'them'
              } through the links. Check the connections between the input and ${
                unreachable.length === 1 ? 'that joint' : 'those joints'
              }.`
            : 'The input joint cannot reach the rest of the mechanism, so no other joint has a position to solve for. Check that it is connected through links to the parts you expect it to move.',
        at: unreachable[0],
        action: unreachable.length > 0 ? 'Go To Joint' : undefined,
      };
    }

    case 'solver-error':
      // The solve threw, so there is no finding to report -- only what the
      // drawing itself says, which is exactly what the fallback is made of.
      return unexplainedBlocker(partition, mechanism);

    default: {
      // Exhaustive: a new `MechanismFailure` with no sentence of its own lands
      // here and fails the build, which is the whole point of the assignment.
      const unhandled: never = failure;
      void unhandled;
      return unexplainedBlocker(partition, mechanism);
    }
  }
}

/**
 * An input set on a link that has since been grounded at its other end too.
 *
 * The link is then part of the frame, so the partition gives the joint to no
 * mechanism, and the machine it hangs off solved as if nothing drove it: "No
 * input is set", said beside the input's own arrow. The joint is still in this
 * mechanism's `joints` -- a frame piece is handed to the machine it touches --
 * so it is found there, and the refusal is the actuator model's own sentence.
 */
function inputOnTheFrame(
  partition: MechanismPartition
): { joint: RealJoint; refusal: string; unground?: RealJoint } | undefined {
  const own = new Set(partition.ownJoints.map((joint) => joint.id));
  for (const joint of partition.joints) {
    if (!(joint instanceof RealJoint) || !joint.input || own.has(joint.id)) continue;
    if (!framePieceAt(joint)) continue;
    const refusal = describeActuator(joint);
    if (typeof refusal !== 'string') continue;
    const link = joint.links[0];
    return { joint, refusal, unground: link ? groundPinsElsewhere(link, joint)[0] : undefined };
  }
  return undefined;
}

/**
 * Everything standing between one mechanism and its animation, worst first.
 *
 * Ordered the way the fixes depend on one another rather than by severity,
 * because a list a student works down should not send them to do something that
 * cannot help yet: a slider with nothing to slide along has no mobility worth
 * counting, and giving an input to a linkage whose mobility is wrong will not
 * make it run. Each blocker names the way out, not just the wall.
 */
export function readinessOf(
  partition: MechanismPartition,
  mechanism: Mechanism,
  helpers: ReadinessHelpers
): MechanismReadiness {
  const checks: ReadinessCheck[] = [];
  const add = (check: ReadinessCheck) => checks.push(check);

  // Asked first, and asked even of a mechanism the solver accepted: the toggle
  // refuses a joint it cannot describe, but nothing stops a later edit taking
  // the freedom away from a joint that was legitimately driven when it was
  // switched on -- a third body pinned to it, or a weld that shuts a driven
  // cylinder inside one body (decision S25).
  //
  // First because it is the *cause*. The solver, handed a drive that cannot
  // move, fails somewhere downstream and reports that: "Nothing moves when the
  // input turns" is true of such a drawing and tells the reader to go and check
  // connections that are perfectly sound. So where the drive itself is refused,
  // that refusal is the whole of the answer and the failure's own sentence is
  // left out rather than stacked on top of it.
  const driven = drivenOwnJoint(partition);
  const onFrame = driven ? undefined : inputOnTheFrame(partition);
  const refusal = helpers.drivenRefusal(partition) ?? onFrame?.refusal;
  if (onFrame) {
    add({
      state: 'blocker',
      title: `The input at joint ${nameOf(onFrame.joint)} cannot turn`,
      body: onFrame.refusal,
      at: onFrame.unground,
      action: onFrame.unground ? 'Go To Joint' : undefined,
    });
  } else if (refusal) {
    add({
      state: 'blocker',
      title: 'This joint cannot be an input',
      body: refusal,
      at: driven,
      action: driven ? 'Go To Joint' : undefined,
    });
  }

  const failure = mechanism.failure;
  if (refusal) {
    // The cause is already stated.
  } else if (failure !== undefined) {
    add(blockerForFailure(failure, partition, mechanism, helpers));
  } else if (!mechanism.isMechanismValid()) {
    // Invalid and carrying no reason. Nothing produces this today, and `ready`
    // read it as "not ready" with an empty list underneath -- a red chip with
    // nothing to act on, which is the state this blocker exists to make
    // impossible.
    add(unexplainedBlocker(partition, mechanism));
  }

  // Said before the stroke warning, and instead of it: a cylinder frozen inside
  // one body uses none of its travel, which the reach check would report as the
  // linkage binding on it (decision S25). It is not binding on anything; it is
  // the shape the reader welded.
  const { bodyOf } = assignBodies(partition.joints, partition.links);
  cylindersIn(partition.joints)
    .filter((cylinder) => isFrozenCylinder(cylinder, bodyOf))
    .forEach((cylinder) =>
      add({
        state: 'warning',
        title: 'A cylinder cannot extend',
        body: describeFrozenCylinderStroke(cylinder),
      })
    );

  const stroke = helpers.strokeWarning(partition);
  if (stroke) {
    add({ state: 'warning', title: 'A cylinder cannot use its whole stroke', body: stroke });
  }

  // Only a mechanism that needed cutting finer has one of these, and needing it
  // is the definition: the walk asks for a finer step exactly where a sample
  // moved further than a linkage should move in one frame.
  if (mechanism.hasAddedSamples) {
    add({
      state: 'warning',
      title: 'The linkage passes through a toggle',
      body:
        'Somewhere in the cycle this mechanism reaches a position where a very small movement of ' +
        'the input produces a very large one at the output — a toggle, or dead-center. The motion ' +
        'there is solved at a finer step so it can be animated smoothly, but it is genuinely fast: ' +
        'velocities and accelerations near that point are large and change quickly, and a real ' +
        'linkage built to this drawing would be hard to control through it.',
    });
  }

  return {
    id: partition.id,
    ready: mechanism.isMechanismValid() && checks.every((check) => check.state !== 'blocker'),
    checks,
    facts: factsOf(partition, mechanism, helpers),
  };
}

/**
 * What a mechanism is, as opposed to what is wrong with it.
 *
 * A reader who has just been told their linkage is ready still has questions —
 * which joint drives it, how long a cycle takes, whether it goes round or backs
 * up — and until now the app answered none of them anywhere.
 */
function factsOf(
  partition: MechanismPartition,
  mechanism: Mechanism,
  helpers: ReadinessHelpers
): MechanismFact[] {
  // Its own, not everything it is handed: a shared frame piece carries the
  // neighbor's driven pin along with it, and naming that as this machine's
  // "Driven joint" pointed the reader at a joint in another mechanism. An
  // input on a frame bar that belongs to nobody is this machine's, though, and
  // "Not set" beside its arrow is the sentence the blocker above replaced.
  const driven = inputSetFor(partition);
  const moving = partition.links.length;
  const dof = mechanism.dof;
  const facts: MechanismFact[] = [
    // One is the only mobility a machine with one input can have; anything
    // else is the fault the blockers above are about, and reads as one.
    {
      label: 'Degrees of freedom',
      value: Number.isFinite(dof) ? String(dof) : '—',
      bad: !Number.isFinite(dof) || dof !== 1,
    },
    {
      label: 'Links / joints',
      value: `${moving} / ${shown(partition.ownJoints, partition.joints).length}`,
    },
    { label: 'Input joint', value: driven ? driven.name || driven.id : 'Not set' },
  ];
  if (mechanism.isMechanismValid()) {
    facts.push({ label: 'Input speed', value: helpers.describeSpeed(partition) });
    facts.push({ label: 'Cycle time', value: `${mechanism.cyclePeriod.toFixed(2)} s` });
    facts.push({
      label: 'Motion',
      value: mechanism.reciprocates ? 'Reciprocating' : 'Continuous',
    });
  }
  return facts;
}

/** One condition force analysis needs, and whether the drawing meets it. */
export interface ForceRequirement {
  met: boolean;
  /**
   * Unmet-but-not-blocking: the analysis runs anyway, and the row is worth
   * reading before trusting the numbers. Warnings do not gate readiness and
   * are not counted by the "N to set" chips.
   */
  warning?: boolean;
  /** A short sentence-case phrase naming the condition. */
  title: string;
  /** Met: what is true. Unmet: what is missing, and how to supply it. */
  body: string;
  /**
   * A fix the panel can carry out itself, where there is one.
   *
   * Turning gravity back on is the only one so far, and only where it settles
   * the matter on its own. The other ways out of an unloaded drawing -- attach
   * a force, give a body mass -- are a gesture on the canvas and a row in the
   * table directly below, and a button here would stand in for neither.
   */
  act?: 'gravity';
}

export interface UnassignedReport {
  /** The part at fault, so the panel can offer to go to it. */
  at?: Joint;
  title: string;
  body: string;
}

/**
 * What to say about geometry that is in no mechanism.
 *
 * Split by cause, because the two have different ways out: a floating chain
 * needs grounding, a joint on its own needs connecting.
 */
export function describeUnassigned(unassigned: UnassignedGeometry): UnassignedReport[] {
  const reports: UnassignedReport[] = [];
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

  unassigned.floatingChains.forEach((chain) => {
    const sorted = shown(chain.joints, around).sort((a, b) => a.id.localeCompare(b.id));
    reports.push({
      at: sorted[0],
      title: `Joints ${names(sorted)} never reach ground`,
      body: 'Nothing anchors this chain, so there is nothing for it to move against and no position to solve for. Ground one of its joints to make it a mechanism.',
    });
  });

  unassigned.fixedLinks.forEach((link) => {
    reports.push({
      title: `Link ${visibleBodyName(link, cylinders)} is fixed at both ends`,
      body: 'Every joint on it is grounded, so it is part of the frame and nothing about it can move. Unground one of its joints to make it a mechanism, or leave it as a fixed reference.',
    });
  });

  unassigned.looseJoints.forEach((joint) => {
    reports.push({
      at: joint,
      title: `Joint ${(joint as RealJoint).name || joint.id} has no link`,
      body: 'A joint on its own is not part of any mechanism and is skipped by analysis. Attach a link to it, or delete it.',
    });
  });

  return reports;
}
