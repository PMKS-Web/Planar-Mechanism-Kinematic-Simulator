import { Cylinder } from '../cylinder';
import { Link } from '../link';
import { capitalized, linkRef, listOf, prose } from '../prose';
import { ForceAnalysisStatus, SECOND_ORDER_LOCK_MESSAGE } from './force-solver';
import { SetupIssue } from './setup-issue';

/**
 * What force analysis still needs, from facts the service measures: whether a
 * mechanism runs, what the force solver made of it, and what loads it.
 *
 * Only what is outstanding. A requirement that is met is a tick nobody needs
 * to read, and the chip already says "Ready" when nothing is left.
 */
export interface ForceFacts {
  /** Some mechanism's kinematics close, so there is a cycle to solve forces along. */
  runs: boolean;
  /** Where the force solver balanced no pose at all, what it said. */
  refused?: { status: ForceAnalysisStatus; message?: string };
  /** Two supports hold a body along one line somewhere in the cycle. */
  sharedSupport: boolean;
  /** Links that weigh nothing, where something else loads the mechanism. */
  massless: Link[];
  cylinders: readonly Cylinder[];
  /** How many forces are applied to the mechanisms that run. */
  forces: number;
  gravityOn: boolean;
  /** Some part of a mechanism that runs has a mass. */
  weighted: boolean;
}

export function forceIssues(facts: ForceFacts): SetupIssue[] {
  if (!facts.runs) {
    return [
      {
        severity: 'blocker',
        title: 'No mechanism runs yet',
        summary: prose`Forces are solved along the motion, and nothing moves yet.`,
        explain:
          'Force analysis solves every pose of the cycle, so the kinematics have to work first.',
        fixes: [prose`Fix the issues listed for Kinematic Analysis`],
      },
    ];
  }
  const issues: SetupIssue[] = [];
  if (facts.refused) issues.push(unbalanced(facts.refused.status, facts.refused.message));

  const loaded = facts.forces > 0 || (facts.gravityOn && facts.weighted);
  if (!loaded) issues.push(unloaded(facts.gravityOn, facts.weighted));

  // Supports that share a line -- two rails holding one jaw at one height --
  // leave the split of the load between them to stiffness, which statics
  // cannot see. The solver takes the evenest split rather than refusing.
  if (facts.sharedSupport) {
    issues.push({
      severity: 'warning',
      title: 'Two supports share a line',
      summary: prose`Statics can't split the load between them, so it's shown split evenly.`,
      explain:
        'How two supports on one line share a load depends on how stiff each one is, which statics alone never sees.',
      fixes: [prose`Offset one support if the split matters`],
    });
  }

  // A massless link is a legitimate idealization, so this is a warning. It is
  // worth one because zero is the mass nobody chose: every link starts there.
  // Only once something loads the mechanism: the unloaded blocker already says
  // nothing weighs anything, and saying it twice made the list longer than the
  // problem.
  if (loaded && facts.massless.length > 0) {
    const refs = facts.massless.map((link) => linkRef(link, facts.cylinders));
    const one = refs.length === 1;
    issues.push({
      severity: 'warning',
      title: one
        ? `${capitalized(refs[0].label)} is massless`
        : `${refs.length} links are massless`,
      summary: prose`${listOf(refs)} ${one ? 'weighs' : 'weigh'} nothing, so gravity and inertia skip ${one ? 'it' : 'them'}.`,
      explain:
        'A massless link is a fine idealization for a light bar. Give it a mass when its weight or inertia matters.',
      fixes: [prose`Type a mass in the Masses table`],
    });
  }
  return issues;
}

/** Nothing to react against: gravity off, or nothing with mass, and no force. */
function unloaded(gravityOn: boolean, weighted: boolean): SetupIssue {
  const summary = !gravityOn
    ? weighted
      ? prose`Gravity is off, so link mass weighs nothing.`
      : prose`Gravity is off and no force is applied.`
    : prose`No force is applied and every link is massless.`;
  const fixes = !gravityOn
    ? weighted
      ? [prose`Turn on gravity in the Settings panel`, prose`Attach a force to any link`]
      : [prose`Attach a force to any link`, prose`Turn on gravity and give a link mass`]
    : [prose`Attach a force to any link`, prose`Type a mass in the Masses table`];
  return {
    severity: 'blocker',
    title: 'Nothing loads the mechanism',
    summary,
    explain:
      'Force analysis finds the reactions that balance the loads. With no load, every reaction is zero.',
    fixes,
  };
}

/** The force solver could balance no pose, said by what kind of failure it was. */
function unbalanced(status: ForceAnalysisStatus, message: string | undefined): SetupIssue {
  const base = { severity: 'blocker' as const, title: "Forces can't be balanced" };
  if (status === 'invalid-properties') {
    // The solver's own sentence names the part: keep its first sentence.
    const fact = message?.split(/(?<=\.)\s/)[0];
    return {
      ...base,
      summary: prose`${fact ?? "A mass, moment of inertia or force value isn't a usable number."}`,
      explain:
        'Force analysis needs a real number for every mass, moment of inertia and force before it can balance them.',
      fixes: [prose`Type the value again in the Masses table`],
    };
  }
  if (message === SECOND_ORDER_LOCK_MESSAGE) {
    return {
      ...base,
      summary: prose`No finite reactions balance the loads at this pose.`,
      explain:
        "Some loads push along a direction the mechanism only resists after a tiny sag. A rigid support can't answer that with a finite force.",
      fixes: [prose`Add another support to the moving part`, prose`Take the load off that part`],
    };
  }
  if (status === 'missing-kinematics') {
    return {
      ...base,
      summary: prose`Some links are missing the motion data in-motion analysis needs.`,
      explain:
        "In-motion analysis uses each link's acceleration. Without it, the inertia forces are unknown.",
      fixes: [],
    };
  }
  return {
    ...base,
    summary:
      status === 'unsupported-topology'
        ? prose`Force analysis can't model this kind of mechanism yet.`
        : prose`The force equations have no single answer at this pose.`,
    explain:
      'Force analysis writes a balance of forces and moments for each link. Some arrangements give equations with no single answer.',
    fixes: [],
  };
}
