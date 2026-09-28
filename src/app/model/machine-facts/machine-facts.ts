import { describeActuator, GROUND_BODY, isFrameBar } from '../actuator';
import { cylindersIn } from '../cylinder';
import { Joint, RealJoint } from '../joint';
import { Link } from '../link';
import { Mechanism } from '../mechanism/mechanism';
import { MechanismPartition } from '../mechanism/mechanism-partition';
import { cycleSamples } from './cycle';
import { FamilyMatch, familyCheck } from './family-check';
import { RelationContext } from './relations';
import { inputSeries, LinkJob, linkJobs } from './roles';

/**
 * What PMKS+ recognizes in one machine it has solved: the named family its
 * lengths, joints and motion match, and each link's job -- which is the crank,
 * which the coupler, which rocks.
 *
 * Read off the solved cycle, never off a template's name, so a drawing the
 * reader built by hand is recognized the same way as the library's. The
 * modules beside this one were written for a fact sheet a language model would
 * read; the recognition is theirs, and this is the part of it the machine panel
 * shows.
 */
export interface MachineFacts {
  /** What PMKS+ matched, most specific first. Empty when nothing in its catalog did. */
  family: FamilyMatch[];
  /** Each link's job, for the panel's Links rows. */
  jobs: LinkJob[];
}

/** The machine's facts, or none for one that does not run: there is no cycle to read. */
export function machineFacts(
  partition: MechanismPartition,
  mechanism: Mechanism | undefined
): MachineFacts | undefined {
  if (!mechanism?.isMechanismValid() || mechanism.joints.length < 2) return undefined;

  const own = new Set(partition.ownJoints.map((joint) => joint.id));
  const cylinders = cylindersIn(partition.joints).filter((c) => own.has(c.seal.id));
  // A cylinder's seal and buried inner end are internal; a reader only ever
  // sees its two mounts.
  const hidden = new Set(cylinders.flatMap((c) => [c.seal.id, c.inner.id]));
  const visible = partition.ownJoints.filter((joint) => !hidden.has(joint.id));
  const bodies = partition.links.filter(
    (link) =>
      link.joints.some((joint) => own.has(joint.id)) &&
      !cylinders.some((c) => c.barrel === link || c.rod === link)
  );
  const label = (joint: Joint) => joint.id;
  const bodyLabel = (link: Link) =>
    `link ${link.joints
      .filter((joint) => !hidden.has(joint.id))
      .map((joint) => joint.id)
      .join('')}`;

  const driven = partition.ownJoints.find(
    (joint): joint is RealJoint => joint instanceof RealJoint && joint.input
  );
  const actuator = driven ? describeActuator(driven) : undefined;
  const drivenBody =
    actuator && typeof actuator !== 'string' && actuator.drivenBody !== GROUND_BODY
      ? actuator.drivenBody
      : undefined;

  // The speed only times the cycle, which neither the family nor a job reads.
  const samples = cycleSamples(mechanism, driven, 1);
  const ctx: RelationContext = { bodies, visible, hidden, samples, cylinders, label, bodyLabel };
  // A frame drawn as a bar between two pivots is the ground, not a fifth
  // link: counted as one, a four-bar with its frame drawn matched nothing.
  const moving = { ...ctx, bodies: bodies.filter((body) => !isFrameBar(body)) };
  return {
    family: familyCheck(moving).matches,
    jobs: linkJobs(ctx, drivenBody, driven, inputSeries(ctx, driven)),
  };
}
