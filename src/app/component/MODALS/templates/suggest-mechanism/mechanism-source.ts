// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../../../model/joint';
import { Joint, RealJoint } from '../../../../model/joint';
import { Link, RealLink } from '../../../../model/link';
import { Force } from '../../../../model/force';
import { cylindersIn } from '../../../../model/cylinder';
import { Mechanism } from '../../../../model/mechanism/mechanism';
import {
  MOST_MACHINES,
  partitionMechanisms,
} from '../../../../model/mechanism/mechanism-partition';
import { readinessOf } from '../../../../model/mechanism/readiness';
import { issueText } from '../../../../model/mechanism/setup-issue';
import { familyReading, machineFacts } from '../../../../model/machine-facts/machine-facts';
import { ActiveObjService } from '../../../../services/active-obj.service';
import { MechanismService } from '../../../../services/mechanism.service';
import { SettingsService } from '../../../../services/settings.service';
import { MechanismBuilder } from '../../../../services/transcoding/mechanism-builder';
import { StringTranscoder } from '../../../../services/transcoding/string-transcoder';
import {
  looksLikeQueryParameters,
  payloadOfAddress,
} from '../../../../services/url-processor.service';
import { mechanismSvg } from '../../../../services/export/mechanism-svg';
import { TEMPLATE_CARDS, TEMPLATE_CATEGORIES } from '../template-catalog';
import { TEMPLATE_LINKAGES, TemplateID } from '../template-linkages';

/** Which mechanism a suggestion is about. */
export type MechanismSourceKind = 'open-mechanism' | 'pasted-link';

/** What one machine in a drawing reads as. */
export interface MachineReading {
  /** Its family, as the machine panel names it: "Four-bar linkage". */
  family: string;
  runs: boolean;
}

/**
 * The one line that says which mechanism this is, the way the source card and
 * the email both put it.
 */
export interface MechanismSummary {
  /** "Four-bar linkage", or "3 mechanisms". */
  name: string;
  /** "4 links · 4 joints", or the machines' families. */
  meta: string;
  /** Whether it plays: every machine, or not. Undefined when nothing could be solved. */
  runs?: boolean;
  /** "Runs", "All Run", "Does Not Run", "1 of 3 Run". */
  verdict?: string;
  /** What stops it, from the setup drawer's own first blocker. */
  stopped?: string;
  /** The library card it is already, if it is one. */
  inLibrary?: { name: string; section: string };
  /** For the email: "Four-bar linkage · 4 links · 4 joints · runs". */
  line: string;
}

/**
 * A drawing summed up from its parts and from what each of its machines reads
 * as. One function for both sources, so the open mechanism and a pasted link
 * say the same kind of thing about the same kind of drawing.
 */
export function summarize(
  joints: readonly Joint[],
  links: readonly Link[],
  machines: readonly MachineReading[],
  stopped?: string
): MechanismSummary {
  const buried = new Set(cylindersIn([...joints]).map((cylinder) => cylinder.inner.id));
  const jointCount = joints.filter(
    (joint) => joint instanceof RealJoint && !buried.has(joint.id)
  ).length;
  const linkCount = links.filter((link) => link instanceof RealLink).length;
  const parts = `${plural(linkCount, 'link')} · ${plural(jointCount, 'joint')}`;

  const several = machines.length > 1;
  const name = several
    ? `${machines.length} mechanisms`
    : (machines[0]?.family ?? (linkCount > 0 ? 'Not recognized' : 'Joints only'));
  const meta = several ? machines.map((machine) => machine.family).join(' · ') : parts;

  const running = machines.filter((machine) => machine.runs).length;
  const runs = machines.length === 0 ? undefined : running === machines.length;
  const verdict =
    runs === undefined
      ? undefined
      : runs
        ? several
          ? 'All Run'
          : 'Runs'
        : several
          ? `${running} of ${machines.length} Run`
          : 'Does Not Run';
  const motion = runs === undefined ? '' : runs ? ' · runs' : ' · does not run';
  return {
    name,
    meta,
    runs,
    verdict,
    stopped: runs === false ? stopped : undefined,
    line: `${name} · ${several ? `${meta} · ${parts}` : parts}${motion}`,
  };
}

/** What a pasted link turned out to be. */
export type PastedLink =
  | { kind: 'empty' }
  | { kind: 'foreign' }
  | { kind: 'broken' }
  | {
      kind: 'opened';
      /** The address as pasted, trimmed: what the email carries. */
      address: string;
      summary: MechanismSummary;
      /** A skeleton of the drawing, for the card. */
      still: string;
    };

/**
 * Where a PMKS+ link can come from: production, the branch and preview deploys
 * of either Netlify site, a local server, and wherever this copy is running.
 */
export function isPmksHost(hostname: string, here: string): boolean {
  return (
    hostname === here ||
    hostname === 'pmksplus.com' ||
    hostname.endsWith('.pmksplus.com') ||
    /(^|--)pmks(new|prod)\.netlify\.app$/.test(hostname) ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]'
  );
}

/**
 * Read a pasted link without touching the grid.
 *
 * Decoded the way a template is checked in its spec -- into a drawing of its
 * own, with settings of its own -- and then solved machine by machine the way
 * `MechanismService` solves them, so the card can say what the link opens as
 * and whether it runs. Nothing here reaches the reader's own drawing, its
 * history or its settings.
 */
export function readPastedLink(text: string, here: string): PastedLink {
  const address = text.trim();
  if (address === '') return { kind: 'empty' };

  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return { kind: 'foreign' };
  }
  if (!isPmksHost(url.hostname, here)) return { kind: 'foreign' };

  let payload: string | null;
  try {
    payload = payloadOfAddress(address);
  } catch {
    return { kind: 'broken' };
  }
  // A PMKS+ address with nothing after it, or only somebody's tracking, is the
  // app's front door rather than a mechanism.
  if (payload === null || looksLikeQueryParameters(payload)) return { kind: 'foreign' };

  let joints: Joint[];
  let links: Link[];
  let forces: Force[];
  try {
    const transcoder = new StringTranscoder();
    transcoder.decodeURL(payload);
    const drawing = { joints: [], links: [], forces: [] } as unknown as MechanismService;
    new MechanismBuilder(drawing, transcoder, new SettingsService(), new ActiveObjService()).build(
      false,
      false
    );
    ({ joints, links, forces } = drawing);
  } catch {
    return { kind: 'broken' };
  }
  if (joints.length === 0) return { kind: 'broken' };

  const { machines, stopped } = solveEach(joints, links, forces);
  const summary = summarize(joints, links, machines, stopped);
  summary.inLibrary = libraryCardFor(payload);
  return {
    kind: 'opened',
    address,
    summary,
    still: svgDataUrl(mechanismSvg(joints, links, 560, 400)),
  };
}

/**
 * Each machine in a decoded drawing, solved on its own.
 *
 * A solve that throws says nothing about the link -- it decoded -- so the
 * verdict is left out rather than reported as "does not run".
 */
function solveEach(
  joints: Joint[],
  links: Link[],
  forces: Force[]
): { machines: MachineReading[]; stopped?: string } {
  try {
    const { mechanisms } = partitionMechanisms(joints, links, forces);
    let stopped: string | undefined;
    const machines = mechanisms.slice(0, MOST_MACHINES).map((partition) => {
      const driven = partition.ownJoints.find(
        (joint) => joint instanceof RealJoint && joint.input
      ) as RealJoint | undefined;
      // Whether it runs does not depend on how fast, only on there being a
      // speed to run at.
      const speed = driven?.driveSpeed || 10;
      const mechanism = new Mechanism(
        partition.joints,
        partition.links,
        partition.forces,
        [],
        false,
        'cm',
        (speed * Math.PI) / 30,
        'adaptive',
        new Set(partition.ownJoints.map((joint) => joint.id))
      );
      const runs = mechanism.isMechanismValid();
      if (!runs && !stopped) {
        const blocker = readinessOf(partition, mechanism, {
          strokeWarning: () => undefined,
          drawing: () => ({ joints, links }),
          describeSpeed: () => '',
        }).checks.find((check) => check.severity === 'blocker');
        if (blocker) stopped = issueText(blocker);
      }
      const family = familyReading(partition, mechanism, machineFacts(partition, mechanism)).name;
      return { family, runs };
    });
    return { machines, stopped };
  } catch {
    return { machines: [] };
  }
}

/** The library card a payload already is, if it is one, word for word. */
export function libraryCardFor(payload: string): { name: string; section: string } | undefined {
  const id = (Object.keys(TEMPLATE_LINKAGES) as TemplateID[]).find(
    (key) => TEMPLATE_LINKAGES[key] === payload
  );
  const card = id && TEMPLATE_CARDS.find((one) => one.id === id);
  if (!card) return undefined;
  const section = TEMPLATE_CATEGORIES.find((category) => category.id === card.category)?.name;
  return { name: card.name, section: section ?? '' };
}

/** An SVG string as something an `<img>` can show. */
export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
