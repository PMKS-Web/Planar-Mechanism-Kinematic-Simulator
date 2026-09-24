import { Joint, PrisJoint, RealJoint } from '../joint';
import { Link } from '../link';
import { cylindersIn } from '../cylinder';
import { describeFrozenCylinderStroke, isFrozenCylinder } from '../cylinder-frozen';
import { visibleBodyName } from '../body-label';
import { canDrive, isFrameBar } from '../actuator';
import { Mechanism, MechanismFailure } from './mechanism';
import { MechanismPartition, UnassignedGeometry } from './mechanism-partition';
import { assignBodies } from './bodies';
import { diagnoseMobility, Drawing } from './free-motion';
import { hiddenJoints, jointsBeside } from './mobility-edits';
import {
  besideAnother,
  hangingLink,
  inputOnTheFrame,
  splitFromADrivenOne,
} from './readiness-situations';
import {
  besideAdvice,
  besideCheck,
  drivenOwnJoint,
  nameOf,
  overConstrained,
  stuckCheck,
  tooFree,
  focusOf,
  resolution,
  looseSubject,
  wayOutOf,
} from './mobility-sentences';

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
  /**
   * The ways out, where there is more than one and nothing in the drawing says
   * which was meant: each an instruction and the part it is about, for the
   * reader to choose from. `at` and `action` are the first of them.
   */
  ways?: ReadinessWay[];
}

/** One of several ways out of a blocker. */
export interface ReadinessWay {
  /** An instruction, as a reader would do it: "Delete link BC". */
  text: string;
  at: Joint | Link;
  /** Title Case, because it labels a button. */
  action: string;
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
  /**
   * The whole drawing, where the caller has it. A machine sees only its own
   * joints and links, and the commonest mistakes -- two joints dropped beside
   * each other, a moving joint grounded, a link deleted -- are exactly the ones
   * that split one linkage into several machines.
   */
  drawing?(): Drawing;
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
  // One of this machine's joints dropped beside a joint of another part of the
  // drawing instead of on it. That is the mistake whatever the count, the
  // solver or the missing input make of it: it splits one linkage into two
  // machines, and every other fix would make one of them run as something
  // nobody drew.
  if (['mobility', 'dead-position', 'hidden-freedom', 'not-driven'].includes(failure)) {
    const beside = besideAnother(partition, helpers.drawing?.().joints ?? []);
    if (beside) return besideAdvice(beside[0], beside[1], 'would join the two into one.');
  }
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
        return tooFree(dof, partition, helpers.drawing?.());
      }
      return overConstrained(dof, partition, helpers.drawing?.());
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
      // A single link hanging from a grounded joint and nothing else: drawn
      // off a pivot the rest of the linkage uses, it turns on its own, so the
      // partition made it a machine of its own. Asking for its input would
      // set a crank turning that nobody drew as one.
      const hanging = hangingLink(partition);
      if (hanging) {
        const name = visibleBodyName(hanging.link, cylindersIn(partition.joints));
        return {
          state: 'blocker',
          title: `Link ${name} hangs from joint ${nameOf(hanging.pivot)} and nothing else`,
          body: `It turns freely about joint ${nameOf(hanging.pivot)}, joined to nothing that moves, so it is a mechanism of its own with nothing to drive it. Delete it, or attach its free end to the rest of the linkage.`,
          at: hanging.link,
          action: 'Go To Link',
        };
      }
      // Point at a joint that could actually take the job, so the button is an
      // answer rather than a place to start looking.
      const candidate = partition.ownJoints.find(
        (joint) => joint instanceof RealJoint && canDrive(joint)
      );
      return {
        state: 'blocker',
        title: NO_INPUT_SET,
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

    case 'dead-position': {
      // An input whose part cannot move at all reads to the solver exactly
      // like one at a limit, and no drag frees it; the geometry tells the two
      // apart, and says whether there is a limit here at all.
      const diagnosis = diagnoseMobility(partition, helpers.drawing?.());
      if (diagnosis.stuck) {
        return stuckCheck(diagnosis.stuck, diagnosis, partition, mechanism.dof);
      }
      const beside = besideCheck(diagnosis);
      if (beside) return beside;
      const driven = drivenOwnJoint(partition);
      if (driven && diagnosis.inputStart === 'limit') {
        const mover = diagnosis.mover;
        return {
          state: 'blocker',
          title: 'This mechanism starts at a dead position',
          body: `The input at joint ${nameOf(driven)} starts exactly at a limit of its travel, where the solver cannot take a first step. Drag ${mover ? `joint ${nameOf(mover)}` : 'a joint'} a little, so the input starts short of the limit.`,
          at: mover,
          action: mover ? 'Go To Joint' : undefined,
        };
      }
      if (driven && diagnosis.inputStart === 'clear') {
        // Not a limit, and both of the solver's routes have been asked: the
        // drawing moves and the input drives it, and the failure is the
        // solver's. Said so, rather than sending anyone to drag off a limit
        // that is not there.
        return {
          state: 'blocker',
          title: 'The solver cannot start this mechanism',
          body: `The drawing can move and the input at joint ${nameOf(driven)} drives it, but the solver cannot take a first step from here. Setting the input at a different joint can get around this.`,
        };
      }
      return {
        state: 'blocker',
        title: 'This mechanism starts at a dead position',
        body: 'The input joint is at a limit of its travel and cannot turn away from it in either direction. Drag a joint to move the mechanism off the limit.',
      };
    }

    case 'hidden-freedom': {
      const ways = mechanism.hiddenFreedoms ?? 2;
      const diagnosis = diagnoseMobility(partition, helpers.drawing?.());
      if (diagnosis.stuck) return stuckCheck(diagnosis.stuck, diagnosis, partition);
      const beside = besideCheck(diagnosis);
      if (beside) return beside;
      if (diagnosis.looseLinks.length === 0) {
        return {
          state: 'blocker',
          title: 'A part of this mechanism is tied to nothing',
          body: `It counts as one degree of freedom, but the drawing can move in ${ways} independent ways: some part is held by nothing but its own joints, so the input alone cannot say where it goes. Attach its free end, ground it, or remove it.`,
        };
      }
      const one = diagnosis.looseLinks.length === 1;
      const { sentence, ...choices } = resolution(diagnosis.fixes, partition);
      return {
        state: 'blocker',
        title: 'A part of this mechanism is tied to nothing',
        body:
          `It counts as one degree of freedom, but with the input held still ${looseSubject(diagnosis, partition)} can still move: ${one ? 'it is' : 'they are'} held by nothing but ${one ? 'its' : 'their'} own joints. ` +
          (sentence || wayOutOf(diagnosis, 'Attach its free end, ground it, or remove it.')),
        ...(sentence ? choices : focusOf(diagnosis)),
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
 * The title of the one blocker that is about setup rather than about the
 * drawing: a machine nobody has set an input on. The playback row says the
 * generic setup hint for it and a count of fixes for everything else.
 */
export const NO_INPUT_SET = 'No input is set';

/**
 * What the solver asks before it solves anything, in this order, stopping at
 * the first that fails: a slot for every slider, one degree of freedom, an
 * input. Each can be read off the drawing, so more than one can be said at
 * once -- except the count beside a slider with nothing to slide along, which
 * the slot is part of.
 */
const BEFORE_THE_SOLVE = new Set<MechanismFailure>(['dangling-slider', 'mobility']);

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
  const drawingJoints = helpers.drawing?.().joints ?? [];

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
  // what the solve found downstream of it is left out rather than stacked on
  // top of the refusal.
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
  }
  // A third body on the input's pivot is usually one link too many, drawn from
  // it: say which, counted, rather than only that there are three.
  const untangle =
    refusal && driven && !onFrame
      ? (diagnoseMobility(partition, helpers.drawing?.()).untangle ?? [])
      : [];
  if (refusal && !onFrame) {
    // Otherwise a joint that could take the input instead, where one can: an
    // input on a coupler point or a lone slider is the input on the wrong
    // joint, and the reader should not have to find the right one.
    const instead = untangle.length
      ? undefined
      : partition.ownJoints.find(
          (joint): joint is RealJoint =>
            joint !== driven && joint instanceof RealJoint && joint.ground && canDrive(joint)
        );
    const onPivot = driven?.links.filter((link) => !isFrameBar(link)) ?? [];
    const cylinders = cylindersIn(partition.joints);
    const { sentence, ...ways } = resolution(untangle, partition);
    add({
      state: 'blocker',
      title:
        untangle.length && driven
          ? `The input at joint ${nameOf(driven)} has more than one link to turn`
          : 'This joint cannot be an input',
      body:
        untangle.length && driven
          ? `Joint ${nameOf(driven)} holds links ${onPivot.map((link) => visibleBodyName(link, cylinders)).join(' and ')} to the ground, so the input would not say which one to turn. ${sentence}`
          : instead
            ? `${refusal} Set the input on joint ${nameOf(instead)} instead.`
            : refusal,
      ...(untangle.length ? ways : { at: driven, action: driven ? 'Go To Joint' : undefined }),
    });
  }

  const failure = mechanism.failure;
  if (refusal) {
    // The cause is already stated, of anything the solve found after it. A
    // slot with nothing to slide along, or a count that is wrong, is not the
    // input's doing, and is said beside it -- unless the refusal's own fix is
    // counted, and so already mends the count, or the input is on the frame.
    if (!onFrame && !untangle.length && failure && BEFORE_THE_SOLVE.has(failure)) {
      add(blockerForFailure(failure, partition, mechanism, helpers));
    }
  } else if (failure !== undefined) {
    add(blockerForFailure(failure, partition, mechanism, helpers));
    // The solver stops at the first of these it finds, and a missing input does
    // not wait on the other two: said together, not one after another.
    if (
      BEFORE_THE_SOLVE.has(failure) &&
      !driven &&
      !besideAnother(partition, drawingJoints) &&
      !splitFromADrivenOne(partition, drawingJoints)
    ) {
      add(blockerForFailure('not-driven', partition, mechanism, helpers));
    }
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

  // One input drives one freedom, and the solver takes the first it finds.
  // A second is ignored without a word, which reads as the app choosing for
  // the reader; saying which one runs is what makes the choice theirs.
  const inputs = partition.joints.filter(
    (joint): joint is RealJoint =>
      joint instanceof RealJoint && joint.input && partition.ownJoints.includes(joint)
  );
  if (inputs.length > 1) {
    const [used, ...ignored] = inputs;
    const others = ignored.map(nameOf);
    add({
      state: 'warning',
      title:
        others.length === 1
          ? `Joints ${nameOf(used)} and ${others[0]} are both set as the input`
          : `Joints ${[nameOf(used), ...others.slice(0, -1)].join(', ')} and ${others.at(-1)} are all set as the input`,
      body: `One input drives one degree of freedom, so this mechanism runs from joint ${nameOf(used)} and ignores ${others.length === 1 ? 'the other' : 'the others'}. Remove the input from joint ${others.join(' and ')} so the drawing says what runs.`,
      at: ignored[0],
      action: 'Go To Joint',
    });
  }

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
export function describeUnassigned(
  unassigned: UnassignedGeometry,
  drawing: Joint[] = []
): UnassignedReport[] {
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
      const { title, body } = besideAdvice(landing[0], landing[1], 'would join it to the rest.');
      reports.push({ at: landing[0], title, body });
      return;
    }
    const links = chain.links.map((link) => visibleBodyName(link, cylinders));
    if (links.length === 1) {
      reports.push({
        at: sorted[0],
        title: `Link ${links[0]} is attached to nothing`,
        body: 'Neither of its ends reaches ground or the rest of the drawing, so it is part of no mechanism and has no position to solve for. Delete it, or ground one of its joints to make it a mechanism of its own.',
      });
      return;
    }
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
