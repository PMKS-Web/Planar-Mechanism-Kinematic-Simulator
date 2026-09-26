import { describeActuator, GROUND_BODY } from '../actuator';
import { cylindersIn } from '../cylinder';
import { turnsClockwise } from '../drive-direction';
import { Joint, PrisJoint, RealJoint } from '../joint';
import { Link } from '../link';
import { Mechanism } from '../mechanism/mechanism';
import { mechanismName } from '../mechanism/mechanism-name';
import { MechanismPartition } from '../mechanism/mechanism-partition';
import { CycleMoment, cycleMoments, cycleSamples } from './cycle';
import { distAt, fmt, isGroundPin, Samples } from './fact-math';
import { FamilyMatch, familyCheck } from './family-check';
import { LooksLikeGate, looksLikeGate } from './looks-like-gate';
import { noteKey } from './note-key';
import { describeRelations, RelationContext } from './relations';
import { inputSeries, LinkJob, linkJobs } from './roles';
import { describeLoads, describePath, describeStartGeometry, typed } from './sheet-lines';

/**
 * The fact sheet "What is this?" sends a model about one machine, in the form
 * the evaluation settled on (v9 in docs/llm-features-evidence/README.md).
 *
 * The app does the reasoning and states conclusions: which link is the crank
 * and which the coupler, which named family the lengths and joints match,
 * where each rocker's ends fall against the input's angle. The model only puts
 * that into words and brings what it knows about where such mechanisms are
 * used. Everything is read from the machine the app already solved; nothing is
 * inferred from a template's name. The sheet speaks the app's language: "this
 * mechanism", "link AB", "driven", never "the drawing".
 *
 * One sheet per machine, because the Analysis panel speaks for one machine at a
 * time ("Analysis for Mechanism M2"); each names the others only as context.
 */

/** What the fact sheets are built from: the app's own machines, already solved. */
export interface WhatIsThisDrawing {
  partitions: MechanismPartition[];
  /** Each partition's solved machine, in the same order: `MechanismService.mechanisms`. */
  mechanisms: (Mechanism | undefined)[];
  lengthUnit: 'cm' | 'in' | 'm';
  /** The document-wide speeds a driven joint with a speed of 0 falls back to. */
  defaultRpm: number;
  defaultLinearSpeed: number;
  defaultClockwise: boolean;
  /** The author's background image, when there is one, by the name of the file it came from. */
  backdrop?: { fileName: string };
}

export interface MachineFactSheet {
  /** The machine's place in the app's own numbering: 1 is M2. */
  index: number;
  /** The fact sheet itself, as the model reads it. */
  text: string;
  /** What a note written from this sheet is filed under (`note-key.ts`). */
  key: string;
  /** Each link's job, for the panel's Links rows. */
  jobs: LinkJob[];
  /** What PMKS+ matched, most specific first; the first is the Overview's Family row. */
  family: FamilyMatch[];
  /** The moments the picture shows, in order. */
  moments: CycleMoment[];
  /** Whether a background image leads the picture, in a tile of its own. */
  backdropTile: boolean;
  /** Whether the panel shows the model's "Looks like" and uses. */
  gate: LooksLikeGate;
  /** What a note may call each part: the Links rows' names, and the joints' letters. */
  partNames: { rows: string[]; joints: string[] };
  /**
   * The drawing's own part behind each key a note's part names resolve to
   * (`note-prose.ts`): "A" is joint A, "AB" link AB, "A-B" the cylinder
   * between A and B, which is found by its barrel as `cylinderRef` finds it.
   */
  parts: Map<string, Joint | Link>;
}

/** One solvable machine, described, before it is set among the others. */
interface Described {
  index: number;
  /** "M2", or `M2 ("Pump jack")` when its author named it. */
  heading: string;
  lines: string[];
  jobs: LinkJob[];
  family: FamilyMatch[];
  moments: CycleMoment[];
  authorNames: string[];
  signature: string;
  joints: string[];
  parts: Map<string, Joint | Link>;
}

/** A fact sheet for each machine PMKS+ can solve; one it cannot gets none. */
export function machineFactSheets(drawing: WhatIsThisDrawing): MachineFactSheet[] {
  const described = drawing.partitions
    .map((partition, index) => describeMachine(partition, index, drawing))
    .filter((d): d is Described => !!d);
  const head = [
    'Facts PMKS+ computed from its own solution of this mechanism.',
    `Length unit: ${drawing.lengthUnit}. Angles in degrees, counterclockwise from +x; y points up.`,
    'Links are named by their joints’ letters, as in the app’s Links table: link AB joins joints A and B.',
  ];
  return described.map((machine) => {
    const text = [
      ...head,
      ...otherMachines(machine, described),
      '',
      `## Mechanism ${machine.heading}`,
      ...machine.lines,
    ].join('\n');
    return {
      index: machine.index,
      text,
      key: noteKey(text),
      jobs: machine.jobs,
      family: machine.family,
      moments: machine.moments,
      backdropTile: !!drawing.backdrop,
      gate: looksLikeGate(machine.authorNames, machine.family, !!drawing.backdrop),
      partNames: { rows: machine.jobs.map((job) => job.name), joints: machine.joints },
      parts: machine.parts,
    };
  });
}

/**
 * What one machine's sheet says of the others on the grid: which are copies of
 * its design and what PMKS+ matched the rest as. A pair of legs half a cycle
 * apart, or a field of pumps, is about how the machines relate.
 */
function otherMachines(self: Described, all: Described[]): string[] {
  if (all.length < 2) return [];
  const others = all
    .filter((m) => m !== self)
    .map((other) => {
      if (other.signature === self.signature)
        return `${other.heading} is the same design as this one (the same link lengths), with its own input`;
      const family = other.family[0]?.family;
      return `${other.heading} is a different design${family ? ` (PMKS+ matched ${family})` : ''}`;
    });
  const list = others.join('; ');
  return [
    `- This drawing holds ${all.length} mechanisms PMKS+ can solve, each with its own input; this sheet is about M${self.index + 1} alone. ${list.charAt(0).toUpperCase()}${list.slice(1)}.`,
  ];
}

/** Every length between joints of one body, rounded, sorted: a design's fingerprint. */
function designSignature(bodies: Link[], visible: Joint[], samples: Samples): string {
  const lengths: number[] = [];
  for (const body of bodies) {
    const joints = body.joints.filter((j) => visible.includes(j) && samples.paths.has(j.id));
    for (let i = 0; i < joints.length; i++)
      for (let k = i + 1; k < joints.length; k++)
        lengths.push(Math.round(distAt(samples, joints[i], joints[k]) * 100) / 100);
  }
  return lengths.sort((a, b) => a - b).join(',');
}

/**
 * Said in the sheet so the model knows the photograph is a hint and not part of
 * the mechanism. The file's name goes too: an author who called it
 * "steam-locomotive.jpg" has said what it shows.
 */
function backdropLine(fileName: string): string {
  const named = fileName.trim()
    ? ` Its file is named "${fileName.trim()}", which may say what it shows.`
    : '';
  return `- The author placed a background image behind this mechanism as a reference, often a photograph or drawing of the real machine.${named} It is shown once, in the picture's tile 0, where a dashed box marks the part of the image the other tiles show; it is not part of the mechanism.`;
}

function describeMachine(
  partition: MechanismPartition,
  index: number,
  drawing: WhatIsThisDrawing
): Described | undefined {
  const mechanism = drawing.mechanisms[index];
  if (!mechanism?.isMechanismValid() || mechanism.joints.length < 2) return undefined;

  const own = new Set(partition.ownJoints.map((joint) => joint.id));
  const cylinders = cylindersIn(partition.joints).filter((c) => own.has(c.seal.id));
  // A cylinder's seal and buried inner end are internal; a reader only ever
  // sees its two mounts, so the facts only ever name those.
  const hidden = new Set(cylinders.flatMap((c) => [c.seal.id, c.inner.id]));
  const visible = partition.ownJoints.filter((joint) => !hidden.has(joint.id));
  const bodies = partition.links.filter(
    (link) =>
      link.joints.some((joint) => own.has(joint.id)) &&
      !cylinders.some((c) => c.barrel === link || c.rod === link)
  );
  const label = (joint: Joint) =>
    typed(joint.name, joint.id) ? `${joint.id} ("${joint.name}")` : joint.id;
  // A link goes by the letters of the joints a reader can see on it.
  const bodyKey = (link: Link) =>
    link.joints
      .filter((joint) => !hidden.has(joint.id))
      .map((joint) => joint.id)
      .join('');
  const bodyLabel = (link: Link) => {
    const named = typed(link.name, link.id) ? ` ("${link.name}")` : '';
    return `link ${bodyKey(link)}${named}`;
  };
  // The name its author gave the whole machine says most of all what it is for.
  const machineName = mechanismName(partition);
  const authorNames = [
    ...(machineName ? [machineName] : []),
    ...bodies.filter((link) => typed(link.name, link.id)).map((link) => link.name),
    ...visible.filter((joint) => typed(joint.name, joint.id)).map((joint) => joint.name),
    ...partition.forces.filter((force) => typed(force.name, force.id)).map((force) => force.name),
  ];

  const drivers = partition.ownJoints.filter(
    (joint): joint is RealJoint => joint instanceof RealJoint && joint.input
  );
  const driven = drivers[0];
  const signedSpeed =
    driven && driven.driveSpeed !== 0
      ? driven.driveSpeed
      : (drawing.defaultClockwise ? -1 : 1) *
        (driven instanceof PrisJoint ? drawing.defaultLinearSpeed : drawing.defaultRpm);
  const actuator = driven ? describeActuator(driven) : undefined;
  const drivenBody =
    actuator && typeof actuator !== 'string' && actuator.drivenBody !== GROUND_BODY
      ? actuator.drivenBody
      : undefined;

  const inputSentence = (): string => {
    if (!driven) return 'Nothing is driven.';
    const cylinder = cylinders.find((c) => c.seal === driven);
    const speed =
      driven instanceof PrisJoint
        ? `${fmt(Math.abs(signedSpeed))} ${drawing.lengthUnit}/s`
        : `${fmt(Math.abs(signedSpeed))} rpm ${turnsClockwise(signedSpeed) ? 'clockwise' : 'counterclockwise'}`;
    if (cylinder)
      return `Driven input: the cylinder between ${label(cylinder.mountA)} and ${label(cylinder.mountB)}, which extends and retracts at ${speed}.`;
    if (typeof actuator === 'string')
      return `Driven input: joint ${label(driven)}, which PMKS+ refuses as an input (${actuator}).`;
    const turned =
      actuator!.drivenBody === GROUND_BODY ? 'the ground' : bodyLabel(actuator!.drivenBody);
    const against =
      actuator!.referenceBody === GROUND_BODY ? 'the ground' : bodyLabel(actuator!.referenceBody);
    return actuator!.kind === 'angle'
      ? `Driven input: joint ${label(driven)} turns ${turned} relative to ${against} at ${speed}.`
      : `Driven input: slider ${label(driven)} pushes ${turned} along its guide at ${speed}.`;
  };

  const lines: string[] = ['### At a glance', `- ${inputSentence()}`];
  if (drivers.length > 1)
    lines.push(`- ${drivers.length} joints are set as inputs: ${drivers.map(label).join(', ')}.`);
  const samples = cycleSamples(mechanism, driven, signedSpeed);
  const period = samples.time[samples.time.length - 1] - samples.time[0];
  lines.push(
    `- Degrees of freedom: ${mechanism.dof}. ` +
      (mechanism.reciprocates
        ? `The input runs to a limit and reverses, so every part moves back and forth; one full back-and-forth takes ${fmt(period)} s.`
        : `The motion repeats every ${fmt(period)} s, once per input revolution.`)
  );
  if (drawing.backdrop) lines.push(backdropLine(drawing.backdrop.fileName));
  const tracedHere = visible.filter(
    (j) => j instanceof RealJoint && j.showCurve && !isGroundPin(j)
  );
  if (tracedHere.length) {
    const on = (j: Joint) => {
      const body = bodies.find((b) => b.joints.includes(j));
      return body ? ` (on ${bodyLabel(body)})` : '';
    };
    lines.push(
      `- Traced points: ${tracedHere.map((j) => `${label(j)}${on(j)}`).join(', ')}. The author chose to show these paths, so they are probably the outputs this mechanism exists for.`
    );
  }

  const ctx: RelationContext = { bodies, visible, hidden, samples, cylinders, label, bodyLabel };
  const family = familyCheck(ctx);
  lines.push(...family.lines);

  const input = inputSeries(ctx, driven);
  const jobs = linkJobs(ctx, drivenBody, driven, input);
  lines.push('### Links and their jobs');
  for (const job of jobs) lines.push(`- ${job.name} — ${job.job}: ${job.motion}.`);
  lines.push(...describeRelations(ctx));

  lines.push('### Paths of moving points');
  const grounds = visible.filter(isGroundPin);
  for (const joint of visible)
    if (!isGroundPin(joint))
      lines.push(describePath(joint, samples, grounds, label, mechanism.reciprocates));

  // Six tiles in all: with a background image, it takes the first.
  const count = drawing.backdrop ? 5 : 6;
  const moments = cycleMoments(samples, mechanism.reciprocates, input, count);
  const words = count === 5 ? 'five' : 'six';
  const ends = mechanism.reciprocates ? ` (1 and ${count} are the two ends of its travel)` : '';
  lines.push(
    drawing.backdrop
      ? `### The picture: tile 0 is the author's background image with this mechanism at its start and a dashed box marking the area the other tiles show; tiles 1 to ${count} are this mechanism at ${words} moments, in time order${ends}`
      : `### The picture: this mechanism at ${words} moments, numbered in time order${ends}`
  );
  if (drawing.backdrop)
    lines.push(
      '- 0: the background image, with this mechanism at its start; the dashed box is the area tiles 1 onward show, larger.'
    );
  moments.forEach((moment, i) => lines.push(`- ${i + 1}: ${moment.label}.`));

  // The drawing's own joints stand wherever playback left them; the solved
  // machine's first frame is where its cycle starts, however it was paused.
  const startJoints = new Map(mechanism.joints[0].map((joint) => [joint.id, joint]));
  const startForces = new Map((mechanism.forces[0] ?? []).map((force) => [force.id, force]));
  lines.push(
    ...describeLoads(partition.forces, bodyLabel, (f) => startForces.get(f.id) ?? f),
    ...describeStartGeometry(
      visible,
      bodies,
      label,
      bodyLabel,
      hidden,
      cylinders,
      (j) => startJoints.get(j.id) ?? j
    )
  );

  return {
    index,
    heading: `M${index + 1}${machineName ? ` ("${machineName}")` : ''}`,
    lines,
    jobs,
    family: family.matches,
    moments,
    authorNames,
    signature: designSignature(bodies, visible, samples),
    joints: visible.map((joint) => joint.id),
    parts: new Map<string, Joint | Link>([
      ...visible.map((joint): [string, Joint] => [joint.id, joint]),
      ...bodies.map((body): [string, Link] => [bodyKey(body), body]),
      ...cylinders.map((c): [string, Link] => [`${c.mountA.id}-${c.mountB.id}`, c.barrel]),
    ]),
  };
}
