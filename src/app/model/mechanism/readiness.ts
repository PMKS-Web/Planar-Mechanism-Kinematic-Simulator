import { Joint, PrisJoint, RealJoint } from '../joint';
import { Cylinder, cylindersIn } from '../cylinder';
import { frozenCylinderAtSeal, isFrozenCylinder } from '../cylinder-frozen';
import {
  actuatorOrRefusal,
  ActuatorRefusal,
  canDrive,
  groundPinsElsewhere,
  isFrameBar,
  meetingHere,
} from '../actuator';
import {
  capitalized,
  cylinderRef,
  jointRef,
  linkRef,
  listOf,
  nameOf,
  PartRef,
  Prose,
  prose,
  sliderRef,
} from '../prose';
import { Mechanism, MechanismFailure } from './mechanism';
import { MechanismPartition } from './mechanism-partition';
import { assignBodies } from './bodies';
import { diagnoseMobility, Drawing } from './free-motion';
import {
  besideAnother,
  hangingLink,
  inputOnTheFrame,
  splitFromADrivenOne,
} from './readiness-situations';
import {
  besideIssue,
  besideIssueOf,
  drivenOwnJoint,
  fixesFrom,
  looseIssue,
  overConstrained,
  stuckIssue,
  tooFree,
} from './mobility-sentences';
import { SetupIssue } from './setup-issue';

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
  /** What stands in the way, in the order a reader should work down it. */
  checks: SetupIssue[];
  /** What this mechanism *is*, for a reader whose question is not "why is it broken". */
  facts: MechanismFact[];
}

/** What only the service can measure, passed in rather than reached for. */
export interface ReadinessHelpers {
  /** A cylinder in this mechanism that the mechanism stops short of its stroke, and how far it gets. */
  strokeWarning(partition: MechanismPartition): { cylinder: Cylinder; percent: number } | undefined;
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
export const shown = (joints: readonly Joint[], from: readonly Joint[] = joints): Joint[] => {
  const buried = new Set(cylindersIn([...from]).map((cylinder) => cylinder.inner.id));
  return joints.filter((joint) => !buried.has(joint.id));
};

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
 * So it says what *is* known rather than apologizing: the count, and two
 * things to try. "Nothing to report" is not a finding, and neither is an
 * error code.
 */
function unexplainedIssue(partition: MechanismPartition, mechanism: Mechanism): SetupIssue {
  const dof = mechanism.dof;
  const driven = drivenOwnJoint(partition);
  const count = `${dof} ${Math.abs(dof) === 1 ? 'degree' : 'degrees'} of freedom`;
  return {
    severity: 'blocker',
    title: "The mechanism couldn't be solved",
    summary: !Number.isFinite(dof)
      ? prose`Nothing is grounded, and nothing moved from the drawn pose.`
      : driven
        ? prose`The input is ${jointRef(driven)} and the count is ${dof}, but nothing moved.`
        : prose`The count is ${count}, but nothing moved from the drawn pose.`,
    explain:
      'Sometimes a drawing counts right and still gives no motion from where it starts. A different starting pose often gets it going.',
    fixes: [
      prose`Drag a joint to change the starting pose`,
      prose`Undo the last change and make it in smaller steps`,
    ],
  };
}

/** A slider with no slot and no ground: one issue, naming every one of them. */
function danglingIssue(partition: MechanismPartition): SetupIssue {
  const dangling = partition.joints.filter(
    (joint) => joint instanceof PrisJoint && joint.isDangling
  );
  const refs = dangling.map(sliderRef);
  const one = refs.length === 1;
  return {
    severity: 'blocker',
    title: one
      ? `Slider ${nameOf(dangling[0])} has no slot`
      : `Sliders ${dangling.map(nameOf).join(', ')} have no slot`,
    summary: prose`With no slot and no ground, ${listOf(refs)} ${one ? 'has' : 'have'} no direction to move in.`,
    explain:
      'A slider moves along a line, either a slot cut into a link or a fixed direction on the ground.',
    fixes: one
      ? [
          prose`Drag ${refs[0]} onto a link to cut a slot`,
          prose`Ground ${refs[0]} to fix its direction`,
        ]
      : [
          prose`Drag each slider onto a link to cut a slot`,
          prose`Ground each slider to fix its direction`,
        ],
  };
}

/** A machine nobody has set an input on. */
function noInputIssue(partition: MechanismPartition): SetupIssue {
  // Point at a joint that could actually take the job, so the fix is an
  // answer rather than a place to start looking.
  const candidate = partition.ownJoints.find(
    (joint) => joint instanceof RealJoint && canDrive(joint)
  );
  return {
    severity: 'blocker',
    title: NO_INPUT_SET,
    summary: prose`Nothing drives the motion yet.`,
    explain:
      "The input is the one joint the animation moves directly, and the rest follows. It's usually a grounded joint at the end of a crank.",
    fixes: [
      candidate
        ? prose`Set ${jointRef(candidate)} as the input`
        : prose`Ground a joint, then set it as the input`,
    ],
  };
}

/**
 * The one issue a named failure earns.
 *
 * **The switch is exhaustive on purpose.** `default` narrows `failure` to
 * `never`, so adding a member to `MechanismFailure` without a sentence for it
 * is a compile error rather than a red chip with nothing under it. The runtime
 * fallback stands behind that for a value the types cannot see -- an older
 * saved state, a string from outside.
 */
function issueForFailure(
  failure: MechanismFailure,
  partition: MechanismPartition,
  mechanism: Mechanism,
  helpers: ReadinessHelpers
): SetupIssue {
  // One of this machine's joints dropped beside a joint of another part of the
  // drawing instead of on it. That is the mistake whatever the count, the
  // solver or the missing input make of it: it splits one linkage into two
  // machines, and every other fix would make one of them run as something
  // nobody drew.
  if (['mobility', 'dead-position', 'hidden-freedom', 'not-driven'].includes(failure)) {
    const beside = besideAnother(partition, helpers.drawing?.().joints ?? []);
    if (beside) return besideIssue(beside[0], beside[1]);
  }
  const cylinders = cylindersIn(partition.joints);
  switch (failure) {
    case 'dangling-slider':
      return danglingIssue(partition);

    case 'mobility': {
      const dof = mechanism.dof;
      if (Number.isNaN(dof)) {
        const slides = partition.joints.some((joint) => joint instanceof PrisJoint);
        return {
          severity: 'blocker',
          title: 'Nothing is grounded',
          summary: prose`No joint is grounded, so the whole mechanism can drift.`,
          explain:
            'A mechanism moves against the ground. At least one joint has to be grounded to hold it in place.',
          fixes: [
            prose`Ground a joint, such as a crank's pivot`,
            ...(slides ? [prose`Ground a slider to fix its direction`] : []),
          ],
        };
      }
      return dof > 1
        ? tooFree(dof, partition, helpers.drawing?.())
        : overConstrained(dof, partition, helpers.drawing?.());
    }

    case 'not-driven': {
      // The one sentence in this file that can be *false about the drawing the
      // reader is looking at*, so it is the one sentence asked twice. The
      // solver's copy said no joint of this machine is driven; the editable
      // drawing is what the reader sees, and if it has a driven joint then
      // whatever went wrong is not that. Telling somebody to switch on the
      // input they have already switched on is how this was reported.
      if (drivenOwnJoint(partition)) return unexplainedIssue(partition, mechanism);
      // A single link hanging from a grounded joint and nothing else: drawn
      // off a pivot the rest of the linkage uses, it turns on its own, so the
      // partition made it a machine of its own. Asking for its input would
      // set a crank turning that nobody drew as one.
      const hanging = hangingLink(partition);
      if (hanging) {
        const link = linkRef(hanging.link, cylinders);
        const pivot = jointRef(hanging.pivot);
        const end = hanging.link.joints.find((joint) => joint !== hanging.pivot);
        return {
          severity: 'blocker',
          title: `${capitalized(link.label)} hangs from joint ${nameOf(hanging.pivot)}`,
          summary: prose`${link} turns freely about ${pivot}, joined to nothing else that moves.`,
          explain:
            'A link pinned at one end and free at the other swings on its own. No input anywhere else can move it.',
          fixes: [
            prose`Delete ${link}`,
            ...(end ? [prose`Drag ${jointRef(end)} onto the joint it should hold`] : []),
          ],
        };
      }
      return noInputIssue(partition);
    }

    case 'cylinder-has-no-travel': {
      const cylinder = cylinders.find((one) => one.seal.id === mechanism.unusableCylinder);
      if (!cylinder) return unexplainedIssue(partition, mechanism);
      const name = cylinderRef(cylinder);
      return {
        severity: 'blocker',
        title: `${capitalized(name.label)} has no travel`,
        summary: prose`The barrel of ${name} is too short for the rod to slide.`,
        explain:
          "A cylinder extends by sliding its rod along inside its barrel. With no room inside, it can't extend at all.",
        fixes: [prose`Increase the length of ${linkRef(cylinder.barrel, cylinders)}`],
      };
    }

    case 'dead-position': {
      // An input whose part cannot move at all reads to the solver exactly
      // like one at a limit, and no drag frees it; the geometry tells the two
      // apart, and says whether there is a limit here at all.
      const diagnosis = diagnoseMobility(partition, helpers.drawing?.());
      if (diagnosis.stuck) return stuckIssue(diagnosis.stuck, diagnosis, partition, mechanism.dof);
      const beside = besideIssueOf(diagnosis);
      if (beside) return beside;
      const driven = drivenOwnJoint(partition);
      if (driven && diagnosis.inputStart === 'clear') {
        // Not a limit, and both of the solver's routes have been asked: the
        // drawing moves and the input drives it, and the failure is the
        // solver's. Said so, rather than sending anyone to drag off a limit
        // that is not there.
        return {
          severity: 'blocker',
          title: "The mechanism can't take a first step",
          summary: prose`The drawing can move and ${jointRef(driven)} drives it, but no first step works.`,
          explain:
            'The animation solves the motion one small step at a time from the drawn pose. Now and then a pose that can move still gives no first step.',
          fixes: [prose`Set another joint as the input`],
        };
      }
      const mover = driven && diagnosis.inputStart === 'limit' ? diagnosis.mover : undefined;
      return {
        severity: 'blocker',
        title: 'Starts at a limit',
        summary: driven
          ? prose`The input at ${jointRef(driven)} starts exactly at the end of its travel.`
          : prose`The input starts at the end of its travel and can't move either way.`,
        explain:
          "At a limit, two links line up and the input can't move either way. The animation needs to start a little short of it.",
        fixes: [
          mover
            ? prose`Drag ${jointRef(mover)} a little way off the limit`
            : prose`Drag a joint a little way off the limit`,
        ],
      };
    }

    case 'hidden-freedom': {
      const diagnosis = diagnoseMobility(partition, helpers.drawing?.());
      if (diagnosis.stuck) return stuckIssue(diagnosis.stuck, diagnosis, partition);
      const beside = besideIssueOf(diagnosis);
      if (beside) return beside;
      return looseIssue(mechanism.hiddenFreedoms ?? 2, diagnosis, partition);
    }

    case 'cycle-never-closes': {
      const gap = mechanism.cycleGap;
      const known = gap !== undefined && Number.isFinite(gap);
      const near = known && gap < 0.5;
      return {
        severity: 'blocker',
        title: 'The motion never repeats',
        summary: !known
          ? prose`The mechanism never returns to the pose it started in.`
          : near
            ? prose`The mechanism comes within ${gap.toFixed(2)} ${mechanism.unit} of its start pose but never returns.`
            : prose`The mechanism wanders and never comes closer than ${gap.toFixed(1)} ${mechanism.unit} to its start pose.`,
        explain: near
          ? 'Animation needs a cycle. A loop that only just misses closing usually has one link length slightly off.'
          : "Animation needs a cycle that returns to its start. A mechanism that wanders usually has a link length that doesn't fit its loop.",
        fixes: [prose`Check the link lengths`],
      };
    }

    case 'nothing-can-move': {
      const unreachable = shown(
        partition.ownJoints.filter((joint) => mechanism.unreachableJoints.includes(joint.id)),
        partition.joints
      );
      const refs = unreachable.map(jointRef);
      return {
        severity: 'blocker',
        title:
          refs.length === 1
            ? `The input can't reach joint ${nameOf(unreachable[0])}`
            : refs.length > 1
              ? "The input can't reach some joints"
              : 'The input moves nothing',
        summary: refs.length
          ? prose`No position was found for ${listOf(refs)} as the input moves.`
          : prose`No other joint gets a position when the input moves.`,
        explain:
          "The input moves the links on its own joint, and those move the next ones. A joint with no chain of links back to the input can't be placed.",
        fixes: [
          refs.length
            ? prose`Check the links between the input and ${refs[0]}`
            : prose`Check that the input's link joins the rest`,
        ],
      };
    }

    case 'solver-error':
      // The solve threw, so there is no finding to report -- only what the
      // drawing itself says, which is exactly what the fallback is made of.
      return unexplainedIssue(partition, mechanism);

    default: {
      // Exhaustive: a new `MechanismFailure` with no sentence of its own lands
      // here and fails the build, which is the whole point of the assignment.
      const unhandled: never = failure;
      void unhandled;
      return unexplainedIssue(partition, mechanism);
    }
  }
}

/**
 * The input set on a link grounded at its other end too. Said the same way
 * whether the partition gave the joint to this machine or to none.
 */
function inputOnFrameIssue(joint: RealJoint, partition: MechanismPartition): SetupIssue {
  const cylinders = cylindersIn(partition.joints);
  const pins = [...new Set(joint.links.flatMap((link) => groundPinsElsewhere(link, joint)))].map(
    jointRef
  );
  const links = joint.links.map((link) => linkRef(link, cylinders));
  return {
    severity: 'blocker',
    title: `Input at joint ${nameOf(joint)} can't turn`,
    summary:
      links.length === 1
        ? prose`${links[0]} is also grounded at ${listOf(pins)}, so it can't move.`
        : prose`Every link on ${jointRef(joint)} is also grounded at ${listOf(pins)}.`,
    explain:
      "A link grounded at two joints is part of the frame. It can't move, so an input on it has nothing to turn.",
    fixes: pins.slice(0, 3).map((pin) => prose`Unground ${pin}`),
  };
}

/**
 * A driven joint the actuator model refuses, said from the kind of refusal so
 * each gets its own fact and its own fixes. `instead` is a joint that could
 * take the input, where the drawing has one.
 */
function refusedInputIssue(
  driven: RealJoint,
  refusal: ActuatorRefusal,
  partition: MechanismPartition,
  instead: RealJoint | undefined
): SetupIssue {
  const joint = jointRef(driven);
  const moveInput = instead ? [prose`Move the input to ${jointRef(instead)}`] : [];
  const twoMeet =
    'An input turns one link against another link or the ground. It has to sit where exactly two of them meet.';
  const base = {
    severity: 'blocker' as const,
    title: `Joint ${nameOf(driven)} can't be the input`,
  };
  switch (refusal) {
    case 'welded':
      return {
        ...base,
        summary: prose`${joint} is welded, so the links it joins can't move against each other.`,
        explain:
          'An input makes two links move against each other. A weld locks them together, so there is nothing for the input to turn.',
        fixes: [prose`Unweld ${joint}`, ...moveInput],
      };
    case 'frozen-cylinder': {
      const cylinder = frozenCylinderAtSeal(driven)!;
      const welded = cylinder.barrelRoot.id === cylinder.rodRoot.id;
      const ends = [jointRef(cylinder.mountA), jointRef(cylinder.mountB)];
      return {
        ...base,
        summary: prose`Both end joints of ${cylinderRef(cylinder)} are on one link, so it can't extend.`,
        explain:
          "A cylinder drives by changing the distance between its two end joints. With both on one link, that distance can't change.",
        fixes: [...(welded ? ends.map((end) => prose`Unweld ${end}`) : []), ...moveInput].slice(
          0,
          3
        ),
      };
    }
    case 'frame':
      return inputOnFrameIssue(driven, partition);
    case 'one-body':
      return {
        ...base,
        summary: prose`Only one link meets at ${joint}, so it has nothing to turn against.`,
        explain: twoMeet,
        fixes: moveInput.length ? moveInput : [prose`Set the input on a grounded joint`],
      };
    case 'many-bodies':
      return {
        ...base,
        summary: prose`${meetingHere(driven)} meet at ${joint}, so the input can't pick a pair.`,
        explain: twoMeet,
        fixes: moveInput.length ? moveInput : [prose`Set the input where exactly two meet`],
      };
    case 'no-angle':
      return {
        ...base,
        summary: prose`${joint} is on a slider's block, a single point with no angle to turn.`,
        explain:
          "An angle needs a direction on each side of the joint. A slider's block is a single point, so it gives none.",
        fixes: moveInput.length ? moveInput : [prose`Set the input at the other end of its link`],
      };
    case 'not-a-joint':
      return {
        ...base,
        summary: prose`Only a joint can be an input.`,
        explain: twoMeet,
        fixes: moveInput,
      };
  }
}

/**
 * The input's pivot holding more than one link to turn, with the counted edit
 * that leaves it one.
 */
function tangledInputIssue(
  driven: RealJoint,
  partition: MechanismPartition,
  fixes: Prose[]
): SetupIssue {
  const cylinders = cylindersIn(partition.joints);
  const onPivot = driven.links.filter((link) => !isFrameBar(link));
  const refs = onPivot.map((link) => linkRef(link, cylinders));
  return {
    severity: 'blocker',
    title: `Joint ${nameOf(driven)} has ${onPivot.length} links to turn`,
    summary: prose`The input can't tell whether to turn ${orList(refs)}.`,
    explain:
      "An input turns one link against the ground. With more than one link on its joint, it can't say which one should move.",
    fixes,
  };
}

/** "link AB or link AC", "link AB, link AC or link AD". */
function orList(refs: PartRef[]): Prose {
  const pieces: (string | PartRef)[] = [];
  refs.forEach((ref, index) => {
    if (index > 0) pieces.push(index === refs.length - 1 ? ' or ' : ', ');
    pieces.push(ref);
  });
  return prose`${pieces}`;
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
  const checks: SetupIssue[] = [];
  const add = (check: SetupIssue) => checks.push(check);
  const drawingJoints = helpers.drawing?.().joints ?? [];
  const cylinders = cylindersIn(partition.joints);

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
  const found = driven ? actuatorOrRefusal(driven) : undefined;
  const refusal = typeof found === 'string' ? found : undefined;
  if (onFrame) add(inputOnFrameIssue(onFrame.joint, partition));
  // A third body on the input's pivot is usually one link too many, drawn from
  // it: say which, counted, rather than only that there are three.
  const untangle =
    refusal && driven ? (diagnoseMobility(partition, helpers.drawing?.()).untangle ?? []) : [];
  if (refusal && driven) {
    if (untangle.length) {
      add(tangledInputIssue(driven, partition, fixesFrom(untangle, partition)));
    } else {
      // Otherwise a joint that could take the input instead, where one can: an
      // input on a coupler point or a lone slider is the input on the wrong
      // joint, and the reader should not have to find the right one.
      const instead = partition.ownJoints.find(
        (joint): joint is RealJoint =>
          joint !== driven && joint instanceof RealJoint && joint.ground && canDrive(joint)
      );
      add(refusedInputIssue(driven, refusal, partition, instead));
    }
  }

  const failure = mechanism.failure;
  if (refusal || onFrame) {
    // The cause is already stated, of anything the solve found after it. A
    // slot with nothing to slide along, or a count that is wrong, is not the
    // input's doing, and is said beside it -- unless the refusal's own fix is
    // counted, and so already mends the count, or the input is on the frame.
    if (!onFrame && !untangle.length && failure && BEFORE_THE_SOLVE.has(failure)) {
      add(issueForFailure(failure, partition, mechanism, helpers));
    }
  } else if (failure !== undefined) {
    add(issueForFailure(failure, partition, mechanism, helpers));
    // The solver stops at the first of these it finds, and a missing input does
    // not wait on the other two: said together, not one after another.
    if (
      BEFORE_THE_SOLVE.has(failure) &&
      !driven &&
      !besideAnother(partition, drawingJoints) &&
      !splitFromADrivenOne(partition, drawingJoints)
    ) {
      add(issueForFailure('not-driven', partition, mechanism, helpers));
    }
  } else if (!mechanism.isMechanismValid()) {
    // Invalid and carrying no reason. Nothing produces this today, and `ready`
    // read it as "not ready" with an empty list underneath -- a red chip with
    // nothing to act on, which is the state this blocker exists to make
    // impossible.
    add(unexplainedIssue(partition, mechanism));
  }

  // Said before the stroke warning, and instead of it: a cylinder frozen inside
  // one body uses none of its travel, which the reach check would report as the
  // linkage binding on it (decision S25). It is not binding on anything; it is
  // the shape the reader welded.
  const { bodyOf } = assignBodies(partition.joints, partition.links);
  cylinders
    .filter((cylinder) => isFrozenCylinder(cylinder, bodyOf))
    .forEach((cylinder) => add(frozenCylinderIssue(cylinder)));

  // One input drives one freedom, and the solver takes the first it finds.
  // A second is ignored without a word, which reads as the app choosing for
  // the reader; saying which one runs is what makes the choice theirs.
  const inputs = partition.joints.filter(
    (joint): joint is RealJoint =>
      joint instanceof RealJoint && joint.input && partition.ownJoints.includes(joint)
  );
  if (inputs.length > 1) {
    const [used, ...ignored] = inputs;
    add({
      severity: 'warning',
      title:
        inputs.length === 2
          ? 'Two joints are set as the input'
          : `${inputs.length} joints are set as the input`,
      summary: prose`The mechanism runs from ${jointRef(used)} and ignores ${listOf(ignored.map(jointRef))}.`,
      explain:
        'One input drives one degree of freedom. The mechanism uses the first input it finds and ignores the rest.',
      fixes: ignored.slice(0, 3).map((joint) => prose`Remove the input from ${jointRef(joint)}`),
    });
  }

  const stroke = helpers.strokeWarning(partition);
  if (stroke) {
    const name = cylinderRef(stroke.cylinder);
    add({
      severity: 'warning',
      title: `${capitalized(name.label)} uses ${stroke.percent}% of its stroke`,
      summary: prose`The mechanism locks up before ${name} reaches the end of its travel.`,
      explain:
        'A cylinder can only extend as far as the mechanism lets it. If the mechanism locks up first, the rest of the stroke is never used.',
      fixes: [prose`Shorten the travel of ${name}`, prose`Give the mechanism more room to move`],
    });
  }

  // Only a mechanism that needed cutting finer has one of these, and needing it
  // is the definition: the walk asks for a finer step exactly where a sample
  // moved further than a linkage should move in one frame.
  if (mechanism.hasAddedSamples) {
    add({
      severity: 'warning',
      title: 'Passes through a toggle',
      summary: prose`Near dead-center, a small input move gives a large output move.`,
      explain:
        'At a toggle, two links line up and the input has almost no leverage over the output. Clamps use this on purpose.',
      fixes: [],
      note: 'Nothing to change. Expect sharp peaks in the velocity and acceleration graphs.',
    });
  }

  return {
    id: partition.id,
    ready: mechanism.isMechanismValid() && checks.every((check) => check.severity !== 'blocker'),
    checks,
    facts: factsOf(partition, mechanism, helpers),
  };
}

/**
 * A cylinder frozen inside one body (decision S25): a warning rather than a
 * blocker, because the mechanism runs perfectly well, and the only thing worth
 * knowing is that the part a reader drew as a cylinder is behaving as a shape.
 */
function frozenCylinderIssue(cylinder: Cylinder): SetupIssue {
  const name = cylinderRef(cylinder);
  const welded = cylinder.barrelRoot.id === cylinder.rodRoot.id;
  return {
    severity: 'warning',
    title: `${capitalized(name.label)} can't extend`,
    summary: prose`Both end joints of ${name} are on one rigid piece.`,
    explain:
      'A cylinder moves by changing the distance between its two end joints. On one rigid piece that distance stays fixed, which is fine for a part meant to be solid.',
    fixes: welded
      ? [prose`Unweld ${jointRef(cylinder.mountA)}`, prose`Unweld ${jointRef(cylinder.mountB)}`]
      : [prose`Remove a link that holds its two ends together`],
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
