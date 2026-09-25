// joint.ts first: see the import-cycle note in fixture.ts.
import '../../app/model/joint';
import { PrisJoint, RealJoint } from '../../app/model/joint';
import { diagnoseMobility, Drawing, MobilityFix } from '../../app/model/mechanism/free-motion';
import { Mechanism } from '../../app/model/mechanism/mechanism';
import {
  MechanismPartition,
  partitionMechanisms,
} from '../../app/model/mechanism/mechanism-partition';
import { readinessOf } from '../../app/model/mechanism/readiness';
import { SetupIssue } from '../../app/model/mechanism/setup-issue';
import { unassignedIssues } from '../../app/model/mechanism/unassigned-issues';
import { isPart, Prose, textOf } from '../../app/model/prose';
import { MODEL_SCALE } from '../../app/model/render-scale';
import { buildMechanism, MechanismFixture } from './fixture';
import { copyFixture, Scenario, Undo } from './student-mistakes';

/**
 * Doing what the app says, the way a student would.
 *
 * Each step reads the drawing's first blocker -- the top row of the setup
 * drawer -- opens its fixes, and does one: the one that undoes the mistake
 * where it is offered, as a reader who knows what they meant would, and the
 * first otherwise. A fix is read as a reader reads it, by its verb and the parts
 * it links to. An issue whose fixes name no edit is recorded as it stands and
 * ends the walk, because that is where a reader is left to guess, and those
 * issues are what this exists to find.
 */

export type Action =
  | {
      kind:
        | 'ground'
        | 'unground'
        | 'pin-in-slot'
        | 'prismatic'
        | 'weld'
        | 'unweld'
        | 'set-input'
        | 'move-input'
        | 'delete-joint';
      joint: string;
    }
  | { kind: 'delete-link'; link: string }
  | { kind: 'add-link'; joints: string }
  | { kind: 'attach'; joint: string }
  | { kind: 'merge'; joint: string; onto: string };

export interface Step {
  title: string;
  /** The summary and the fixes, as a reader sees them with the fixes open. */
  body: string;
  action?: Action;
  /** How many counted fixes the sentence offered, and where the undo sat among them. */
  offered: number;
  undoRank?: number;
  /**
   * Where the undo would sit if the fixes were ranked newest first: by the
   * latest joint letter each touches, since letters are handed out in the
   * order joints are drawn.
   */
  newestRank?: number;
}

export interface Walk {
  outcome: 'runs as drawn' | 'runs' | 'no edit named' | 'still broken' | 'threw';
  steps: Step[];
  /**
   * What is left over when every machine runs: geometry in no mechanism,
   * which the drawer lists and which stops nothing from running.
   */
  leftover?: string[];
  /** Whether what runs at the end is the drawing that was meant. */
  intended?: boolean;
  error?: string;
}

const MAX_STEPS = 3;

/**
 * The drawing at the size the app draws it. Scenarios are written in the
 * units a reader types, and the solver's own steps are not scale-free: a
 * slider input advances a fixed tenth of a unit, which on an unscaled drawing
 * a few units across is a stride longer than its crank.
 */
function atAppScale(fixture: MechanismFixture): MechanismFixture {
  const scaled = copyFixture(fixture);
  scaled.joints.forEach((joint) => {
    joint.x *= MODEL_SCALE;
    joint.y *= MODEL_SCALE;
  });
  return scaled;
}

/**
 * What the setup drawer holds for a drawing: each machine's checks, built one
 * `Mechanism` per machine as `MechanismService` builds them, and the geometry
 * in no machine at all.
 */
export function readDrawing(fixture: MechanismFixture) {
  const built = buildMechanism(atAppScale(fixture));
  const { mechanisms, unassigned } = partitionMechanisms(built.joints, built.links, built.forces);
  const machines = mechanisms.map((partition) => {
    const driven = partition.ownJoints.find(
      (joint): joint is RealJoint => joint instanceof RealJoint && joint.input
    );
    const mechanism = new Mechanism(
      partition.joints,
      partition.links,
      partition.forces,
      [],
      false,
      'cm',
      driven instanceof PrisJoint ? 10 * MODEL_SCALE : 1,
      'adaptive',
      new Set(partition.ownJoints.map((joint) => joint.id))
    );
    const readiness = readinessOf(partition, mechanism, {
      strokeWarning: () => undefined,
      describeSpeed: () => '10.00 RPM',
      drawing: () => ({ joints: built.joints, links: built.links }),
    });
    return { partition, readiness };
  });
  // A frame bar is information, not a blocker: the machines beside it run.
  const stray = unassignedIssues(unassigned, built.joints).filter(
    (report) => !/ is grounded at (both ends|every joint)$/.test(report.title)
  );
  return { machines, stray, drawing: { joints: built.joints, links: built.links } };
}

/**
 * The first thing standing in the way, and what the drawing's own diagnosis
 * knows about it. Geometry in no mechanism stops nothing from running, so it
 * stands in the way only where there is no machine at all.
 */
function firstBlocker(fixture: MechanismFixture) {
  const { machines, stray, drawing } = readDrawing(fixture);
  for (const { partition, readiness } of machines) {
    const check = readiness.checks.find((one) => one.severity === 'blocker');
    if (check) return { check, partition, stray, drawing };
  }
  if (machines.length === 0) {
    const check: SetupIssue = stray[0] ?? {
      severity: 'blocker',
      title: 'Nothing to run',
      summary: [],
      explain: '',
      fixes: [],
    };
    return { check, stray, drawing };
  }
  return { stray, drawing };
}

/**
 * The edit one fix asks for, read the way a student reads it: the verb it
 * opens with and the parts it links to. Undefined where it names no edit this
 * harness can make -- a drag off a limit, "check the link lengths".
 */
export function actionOfFix(fix: Prose): Action | undefined {
  const text = textOf(fix);
  const ids = fix.filter(isPart).map((piece) => piece.part.id);
  const [first, second] = ids;
  if (!first) return undefined;
  if (/^Ground (joint|slider) \S+( to fix its direction)?$/.test(text)) {
    return { kind: 'ground', joint: first };
  }
  if (/^Unground joint \S+$/.test(text)) return { kind: 'unground', joint: first };
  if (/^Set joint \S+ to Pin-in-slot$/.test(text)) return { kind: 'pin-in-slot', joint: first };
  if (/^Set joint \S+ to Prismatic$/.test(text)) return { kind: 'prismatic', joint: first };
  if (/^Weld joint \S+$/.test(text)) return { kind: 'weld', joint: first };
  if (/^Unweld joint \S+$/.test(text)) return { kind: 'unweld', joint: first };
  if (/^Drag joint \S+ onto joint \S+$/.test(text) && second) {
    return { kind: 'merge', joint: first, onto: second };
  }
  if (/^Attach a link from joint \S+ to joint \S+$/.test(text) && second) {
    return { kind: 'add-link', joints: first + second };
  }
  if (/^Attach a grounded link at joint \S+$/.test(text)) return { kind: 'attach', joint: first };
  if (/^Delete (link|barrel|rod) \S+$/.test(text)) return { kind: 'delete-link', link: first };
  if (/^Delete joint \S+$/.test(text)) return { kind: 'delete-joint', joint: first };
  if (/^Set joint \S+ as the input$/.test(text)) return { kind: 'set-input', joint: first };
  if (/^Move the input to joint \S+$/.test(text)) return { kind: 'move-input', joint: first };
  return undefined;
}

/** Whether an edit is the one that undoes a mistake. */
function undoes(action: Action, undos: Undo[]): boolean {
  const same = (a: string, b: string) => sortedIds(a) === sortedIds(b);
  return undos.some((undo) =>
    action.kind === 'delete-link'
      ? undo.kind === 'delete-link' && same(undo.link, action.link)
      : action.kind === 'add-link'
        ? undo.kind === 'add-link' && same(undo.joints, action.joints)
        : action.kind === 'merge'
          ? undo.kind === 'merge' && 'joint' in undo && undo.joint === action.joint
          : 'joint' in action && undo.kind === action.kind && 'joint' in undo
            ? undo.joint === action.joint
            : false
  );
}

/**
 * The edit a reader makes from an issue: of the fixes it lists, the one that
 * undoes the mistake where it is there -- a reader who knows what they meant
 * picks that one -- and the first they can act on otherwise.
 */
function actionFor(
  check: SetupIssue,
  partition: MechanismPartition | undefined,
  drawing: Drawing,
  undos: Undo[]
): { action?: Action; offered: MobilityFix[] } {
  const actions = check.fixes
    .map(actionOfFix)
    .filter((action): action is Action => action !== undefined);
  const action = actions.find((one) => undoes(one, undos)) ?? actions[0];
  // What the diagnosis counted, for the table of how the ways out rank.
  const offered =
    partition &&
    /degrees of freedom|can't move|moves on its own|move freely|can't (turn|slide)/.test(
      check.title
    )
      ? (() => {
          const diagnosis = diagnoseMobility(partition, drawing);
          return diagnosis.stuck?.fixes ?? diagnosis.fixes;
        })()
      : partition && /can't be the input|links to turn$/.test(check.title)
        ? (diagnoseMobility(partition, drawing).untangle ?? [])
        : [];
  return { action, offered };
}

function rankOf(offered: MobilityFix[], undos: Undo[]): number | undefined {
  const same = (a: string, b: string) => sortedIds(a) === sortedIds(b);
  const index = offered.findIndex((fix) =>
    undos.some((undo) =>
      fix.kind === 'delete-link'
        ? undo.kind === 'delete-link' && same(undo.link, fix.link.id)
        : fix.kind === 'connect'
          ? undo.kind === 'add-link' && same(undo.joints, fix.joint.id + fix.to.id)
          : undo.kind === fix.kind && 'joint' in undo && undo.joint === fix.joint.id
    )
  );
  return index === -1 ? undefined : index;
}

/** The latest letter a fix touches: a stand-in for how recently it was drawn. */
function newestLetter(fix: MobilityFix): number {
  const ids =
    fix.kind === 'delete-link'
      ? fix.link.id
      : fix.kind === 'merge'
        ? fix.joint.id + fix.onto.id
        : fix.kind === 'connect'
          ? fix.joint.id + fix.to.id
          : fix.joint.id;
  return Math.max(...[...ids].map((letter) => letter.charCodeAt(0)));
}

/** The same fixes, the one touching the most recently drawn joint first. */
function newestFirst(offered: MobilityFix[]): MobilityFix[] {
  return [...offered].sort((a, b) => newestLetter(b) - newestLetter(a));
}

/** Follows the advice from a scenario's broken drawing until it runs, or cannot. */
export function followAdvice(scenario: Scenario): Walk {
  let fixture = copyFixture(scenario.broken);
  const steps: Step[] = [];
  try {
    for (let step = 0; step <= MAX_STEPS; step++) {
      const { check, partition, stray, drawing } = firstBlocker(fixture);
      if (!check) {
        return {
          outcome: step === 0 ? 'runs as drawn' : 'runs',
          steps,
          intended: sameDrawing(fixture, scenario.intended),
          leftover: stray.length ? stray.map((report) => report.title) : undefined,
        };
      }
      if (step === MAX_STEPS) return { outcome: 'still broken', steps };
      const undos = scenario.mistakes.map((mistake) => mistake.undo);
      const { action, offered } = actionFor(check, partition, drawing, undos);
      steps.push({
        title: check.title,
        body: [textOf(check.summary), ...check.fixes.map((fix) => `- ${textOf(fix)}`)].join('\n'),
        action,
        offered: offered.length,
        undoRank: rankOf(
          offered,
          scenario.mistakes.map((mistake) => mistake.undo)
        ),
        newestRank: rankOf(
          newestFirst(offered),
          scenario.mistakes.map((mistake) => mistake.undo)
        ),
      });
      if (!action) return { outcome: 'no edit named', steps };
      fixture = applied(fixture, action);
    }
    return { outcome: 'still broken', steps };
  } catch (error) {
    return { outcome: 'threw', steps, error: String(error).slice(0, 200) };
  }
}

// --- edits to a fixture -----------------------------------------------------

const sortedIds = (ids: string) => [...new Set(ids)].sort().join('');

function withoutOrphans(fixture: MechanismFixture): MechanismFixture {
  const held = new Set(fixture.links.flatMap((link) => [...link.joints]));
  const kept = new Set(
    fixture.joints.filter((joint) => held.has(joint.id) || joint.ground).map((joint) => joint.id)
  );
  fixture.joints = fixture.joints.filter((joint) => kept.has(joint.id));
  fixture.sliders = fixture.sliders?.filter((slider) => kept.has(slider.at));
  fixture.welds = fixture.welds?.filter((id) => kept.has(id));
  fixture.detach = fixture.detach?.filter((id) => kept.has(id));
  return fixture;
}

/** The drawing with one edit made, as the app would make it. */
export function applied(fixture: MechanismFixture, action: Action): MechanismFixture {
  const next = copyFixture(fixture);
  const joint = 'joint' in action ? next.joints.find((one) => one.id === action.joint) : undefined;
  switch (action.kind) {
    case 'ground':
      if (joint) joint.ground = true;
      next.detach = next.detach?.filter((id) => id !== action.joint);
      return next;
    case 'unground':
      if (joint) joint.ground = false;
      return next;
    case 'pin-in-slot':
      next.welds = next.welds?.filter((id) => id !== action.joint);
      return next;
    case 'prismatic':
      // A slider's pin in the welds list is a Slide: Prismatic, in the choice.
      next.welds = [...(next.welds ?? []), action.joint];
      return next;
    case 'weld': {
      // As Welded does: the links meeting at the pin become one compound,
      // keeping what they were as its members.
      const meeting = next.links.filter((link) => link.joints.includes(action.joint));
      const members = meeting.flatMap((link) => link.subset ?? [{ joints: link.joints }]);
      next.links = next.links.filter((link) => !meeting.includes(link));
      next.links.push({
        joints: sortedIds(meeting.map((link) => link.joints).join('')),
        subset: members,
      });
      next.welds = [...(next.welds ?? []), action.joint];
      return next;
    }
    case 'unweld': {
      // The compound goes back to the members it was made of.
      next.welds = next.welds?.filter((id) => id !== action.joint);
      const compound = next.links.find((link) => link.subset && link.joints.includes(action.joint));
      if (compound) {
        next.links = next.links.filter((link) => link !== compound).concat(compound.subset!);
      }
      return next;
    }
    case 'move-input':
      // Taken off the joint that could not have it, and put on this one.
      next.joints.forEach((one) => {
        if (one.input && one.id !== action.joint) one.input = false;
      });
      if (joint) joint.input = true;
      return next;
    case 'set-input':
      // Added, as Add Input adds it: another machine's input stays its own.
      if (joint) joint.input = true;
      return next;
    case 'delete-link':
      next.links = next.links.filter((link) => sortedIds(link.joints) !== sortedIds(action.link));
      return withoutOrphans(next);
    case 'delete-joint':
      next.links = next.links.filter((link) => !link.joints.includes(action.joint));
      next.joints = next.joints.filter((one) => one.id !== action.joint);
      return withoutOrphans(next);
    case 'attach':
      return attached(next, action.joint);
    case 'add-link':
      next.links.push({ joints: sortedIds(action.joints) });
      return next;
    case 'merge': {
      // Members of a compound name the joint too, and would name one that is gone.
      const rename = (link: { joints: string; subset?: { joints: string }[] }) => {
        link.joints = sortedIds(link.joints.replace(action.joint, action.onto));
        link.subset?.forEach(rename);
      };
      next.links.forEach(rename);
      next.joints = next.joints.filter((one) => one.id !== action.joint);
      return withoutOrphans(next);
    }
  }
}

/**
 * A link from `id` to a new grounded joint, placed where a student would put
 * one: on the line the other pivots stand on, beside the joint it holds.
 */
function attached(fixture: MechanismFixture, id: string): MechanismFixture {
  const from = fixture.joints.find((one) => one.id === id);
  if (!from) return fixture;
  const grounds = fixture.joints.filter((one) => one.ground);
  const groundY = grounds.length ? Math.min(...grounds.map((one) => one.y)) : from.y - 1.5;
  const letter = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].find(
    (one) => !fixture.joints.some((joint) => joint.id === one)
  )!;
  const y = Math.abs(from.y - groundY) > 0.5 ? groundY : from.y - 1.5;
  fixture.joints.push({ id: letter, x: Math.round((from.x + 0.3) * 1000) / 1000, y, ground: true });
  fixture.links.push({ joints: sortedIds(id + letter) });
  return fixture;
}

/**
 * Whether a drawing is the mechanism that was meant, by where things are rather
 * than what they are called: a merge keeps one of two letters, and which one is
 * not the question. A joint within a merge's distance of one in the meant
 * drawing is taken to be that joint -- dragging one joint onto another lands on
 * the other's spot, a few hundredths from where the first one was.
 */
function sameDrawing(drawn: MechanismFixture, meant: MechanismFixture): boolean {
  return signature(drawn, meant) === signature(meant, meant);
}

function signature(fixture: MechanismFixture, meant: MechanismFixture): string {
  const at = (id: string) => {
    const joint = fixture.joints.find((one) => one.id === id)!;
    const near = meant.joints.find((one) => Math.hypot(one.x - joint.x, one.y - joint.y) < 0.2);
    const { x, y } = near ?? joint;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  };
  const links = fixture.links.map((link) => [...link.joints].map(at).sort().join('|')).sort();
  const grounds = fixture.joints.filter((joint) => joint.ground).map((joint) => at(joint.id));
  const inputs = fixture.joints.filter((joint) => joint.input).map((joint) => at(joint.id));
  const welds = (fixture.welds ?? []).map(at);
  return JSON.stringify([links, grounds.sort(), inputs.sort(), welds.sort()]);
}
