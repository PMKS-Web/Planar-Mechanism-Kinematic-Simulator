import { describeActuator, GROUND_BODY, isFrameBar } from '../actuator';
import { cylindersIn } from '../cylinder';
import { Joint, PrisJoint, RealJoint } from '../joint';
import { Link } from '../link';
import { Mechanism } from '../mechanism/mechanism';
import { assignBodies } from '../mechanism/bodies';
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

/** What the Family row says: a family PMKS+ matched, a count, or that it has neither. */
export interface FamilyReading {
  name: string;
  /** Why, in a sentence. */
  basis: string;
  /** Matched to a named family, named by its bodies, or neither. */
  kind: 'named' | 'counted' | 'none';
}

/** The linkages named by their body count, ground included. */
const COUNTED_NAMES: Record<number, string> = {
  4: 'Four-bar linkage',
  5: 'Five-bar linkage',
  6: 'Six-bar linkage',
  7: 'Seven-bar linkage',
  8: 'Eight-bar linkage',
};

/**
 * The Family row, which never hides: a hidden row changed the panel's shape
 * from one machine to the next, and a reader could not tell "not a known type"
 * from "not worked out yet".
 *
 * A family PMKS+ matched comes first. Failing that, a linkage of pins alone
 * with four to eight bodies is named by its count -- always true, and it
 * teaches the count the mobility is built from. Anything else (a slider or a
 * cylinder in it, more bodies than that, no freedom at all) says it was not
 * recognized.
 */
export function familyReading(
  partition: MechanismPartition,
  mechanism: Mechanism | undefined,
  facts: MachineFacts | undefined
): FamilyReading {
  const match = facts?.family[0];
  if (match) {
    return {
      name: capitalized(match.family),
      basis: `${capitalized(match.basis)}.`,
      kind: 'named',
    };
  }
  const pinsOnly =
    !partition.joints.some((joint) => joint instanceof PrisJoint) &&
    cylindersIn(partition.joints).length === 0;
  const bodies = assignBodies(partition.joints, partition.links).movingBodies.size + 1;
  const free = mechanism !== undefined && Number.isFinite(mechanism.dof) && mechanism.dof >= 1;
  const counted = COUNTED_NAMES[bodies];
  if (pinsOnly && free && counted) {
    return {
      name: counted,
      basis: `Named by its ${bodies} bodies, ground included. Not matched to a named type.`,
      kind: 'counted',
    };
  }
  return {
    name: 'Not recognized',
    basis: 'PMKS+ couldn’t match this mechanism to a known type or name it by its links.',
    kind: 'none',
  };
}

const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
