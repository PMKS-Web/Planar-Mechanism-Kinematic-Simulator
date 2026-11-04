// joint.ts first: see the import-cycle note in test-utils/verification/fixture.ts.
import '../../app/model/joint';
import { Joint, PrisJoint, RealJoint } from '../../app/model/joint';
import { bodiesUnder, Link, RealLink } from '../../app/model/link';
import { Force } from '../../app/model/force';
import { MechanismPartition } from '../../app/model/mechanism/mechanism-partition';
import { MODEL_SCALE } from '../../app/model/render-scale';
import { PRISMATIC_INPUT_STEP } from '../../app/model/mechanism/position-solver';
import { SettingsService } from '../../app/services/settings.service';
import { LengthUnit } from '../../app/model/unit-enums';
import { cylinderAtSeal } from '../../app/model/cylinder';
import { siFactors, SiFactors, STANDARD_GRAVITY } from './si-units';

/**
 * A PMKS+ machine as a problem for the numerical oracle: schema
 * `pmks-oracle-problem/1`, in SI units, read from the drawn pose only.
 *
 * Nothing here calls a solver. It reads the joints, links and forces as the URL
 * decoder built them, which is the start pose a reader sees, and writes down
 * the physics they describe. `oracle/pmks_oracle/problem.py` is the reader;
 * docs/numerical-oracle-plan.md § Equivalence rules is the argument for each
 * mapping below.
 */
export const PROBLEM_SCHEMA = 'pmks-oracle-problem/1';
export const GROUND = 'ground';

export type Vec = [number, number];

export interface OracleBody {
  id: string;
  mass: number;
  inertia: number;
  com: Vec;
}

export interface OraclePin {
  id: string;
  kind: 'pin';
  at: Vec;
  bodies: string[];
  grounded: boolean;
  welded: boolean;
}

export interface OracleSlider {
  id: string;
  kind: 'slider';
  at: Vec;
  guide: string;
  linePoint: Vec;
  axis: Vec;
  riders: string[];
  rotates: boolean;
  blockMass: number;
}

export interface OracleDriver {
  joint: string;
  kind: 'rotation' | 'translation';
  /** rad/s or m/s, signed: positive turns counterclockwise, or runs along the slot's axis. */
  speed: number;
  bodies?: [string, string];
}

export interface OracleProblem {
  schema: typeof PROBLEM_SCHEMA;
  id: string;
  title: string;
  /** Published: exported from a decoded URL. A MATLAB fixture: read straight from its description. */
  source: { kind: 'published' | 'matlab-fixture'; case: string; machine: string };
  gravity: number;
  bodies: OracleBody[];
  joints: (OraclePin | OracleSlider)[];
  driver: OracleDriver | null;
  loads: { id: string; body: string; at: Vec; vector: Vec; frame: 'global' | 'local' }[];
  points: { id: string; body: string; at: Vec }[];
  sweep: { step: number; maxSamples: number };
  /**
   * What the exporter met and could not write down. A problem with notes is
   * still solved, for its mobility, but its comparisons are excluded with these
   * as the reason (see src/test-data/oracle/manifest.ts).
   */
  unsupported: string[];
}

/** The unit string the solvers take, from the drawing's length setting. */
export function solverUnit(settings: SettingsService): 'cm' | 'in' | 'm' {
  const unit = settings.lengthUnit.value;
  return unit === LengthUnit.INCH ? 'in' : unit === LengthUnit.METER ? 'm' : 'cm';
}

/** The signed drive speed PMKS+ runs this input at: rpm for a pin, user units/s for a slider. */
export function commandedSpeed(input: RealJoint, settings: SettingsService): number {
  if (input.driveSpeed !== 0) return input.driveSpeed;
  const sign = settings.isInputCW.value ? -1 : 1;
  return (
    sign *
    (input instanceof PrisJoint ? settings.linearInputSpeed.value : settings.inputSpeed.value)
  );
}

/** The input a machine owns, if it has one. */
export function inputOf(partition: MechanismPartition): RealJoint | undefined {
  return partition.ownJoints.find((joint) => joint instanceof RealJoint && joint.input) as
    RealJoint | undefined;
}

/**
 * The link whose rotation a pin input drives: the first bar met at the joint,
 * the same one the force solver puts the input torque on.
 */
export function drivenLinkAt(input: RealJoint): RealLink | undefined {
  return input.links.find((link) => link instanceof RealLink) as RealLink | undefined;
}

export function exportPartition(
  caseId: string,
  title: string,
  partition: MechanismPartition,
  settings: SettingsService
): OracleProblem {
  const si = siFactors(solverUnit(settings));
  const point = (x: number, y: number): Vec => [
    (x / MODEL_SCALE) * si.meters,
    (y / MODEL_SCALE) * si.meters,
  ];
  const unsupported: string[] = [];
  const rootOf = rootLookup(partition.links);
  const root = (link: Link | undefined): string | undefined =>
    link ? rootOf.get(link.id) : undefined;
  const rootsAt = (joint: RealJoint): string[] =>
    unique(joint.links.map((link) => root(link)).filter((id): id is string => id !== undefined));

  const bodies: OracleBody[] = partition.links
    .filter((link): link is RealLink => link instanceof RealLink)
    .map((link) => ({
      id: link.id,
      mass: link.mass * si.kilograms,
      inertia: link.massMoI * si.kilogramMetersSquared,
      com: point(link.CoM.x, link.CoM.y),
    }));

  const joints: (OraclePin | OracleSlider)[] = [];
  const points: OracleProblem['points'] = [];
  for (const joint of partition.joints) {
    if (!(joint instanceof RealJoint)) continue;
    const at = point(joint.x, joint.y);
    const onto = rootsAt(joint);
    if (joint instanceof PrisJoint) {
      const slider = exportSlider(joint, at, onto, root, point, si, unsupported);
      if (slider) joints.push(slider);
      if (onto.length > 0) points.push({ id: joint.id, body: onto[0], at });
      continue;
    }
    if (onto.length > 1 || (onto.length === 1 && joint.ground)) {
      joints.push({
        id: joint.id,
        kind: 'pin',
        at,
        bodies: onto,
        grounded: joint.ground,
        welded: joint.isWelded && onto.length > 1,
      });
    }
    if (joint.ground) points.push({ id: joint.id, body: GROUND, at });
    else if (onto.length > 0) points.push({ id: joint.id, body: onto[0], at });
  }

  return {
    schema: PROBLEM_SCHEMA,
    id: `${caseId}.${partition.id.toLowerCase()}`,
    title: `${title}, ${partition.id}`,
    source: { kind: 'published', case: caseId, machine: partition.id },
    gravity: settings.isGravity.value ? STANDARD_GRAVITY : 0,
    bodies,
    joints,
    driver: exportDriver(partition, settings, root, si, unsupported),
    loads: partition.forces.map((force) => exportLoad(force, root, point, si)),
    points,
    sweep: { step: sweepStep(partition, si), maxSamples: 2000 },
    unsupported,
  };
}

function exportSlider(
  joint: PrisJoint,
  at: Vec,
  riders: string[],
  root: (link: Link | undefined) => string | undefined,
  point: (x: number, y: number) => Vec,
  si: SiFactors,
  unsupported: string[]
): OracleSlider | undefined {
  let guide: string | undefined;
  let linePoint: Vec = at;
  if (joint.carrier) {
    guide = root(joint.carrier);
    const a = joint.slotJointA;
    if (a) linePoint = point(a.x, a.y);
  } else if (joint.ground) {
    guide = GROUND;
  }
  if (guide === undefined) {
    unsupported.push(`slider ${joint.id} has no slot to run in`);
    return undefined;
  }
  if (cylinderAtSeal(joint)) unsupported.push(`cylinder at ${joint.id}: stroke limits`);
  else if (joint.carrier) unsupported.push(`floating slot ${joint.id}: slot-end limits`);
  return {
    id: joint.id,
    kind: 'slider',
    at,
    guide,
    linePoint,
    axis: [Math.cos(joint.slotAngle), Math.sin(joint.slotAngle)],
    riders,
    rotates: joint.rotates,
    blockMass: joint.mass * si.kilograms,
  };
}

function exportDriver(
  partition: MechanismPartition,
  settings: SettingsService,
  root: (link: Link | undefined) => string | undefined,
  si: SiFactors,
  unsupported: string[]
): OracleDriver | null {
  const input = inputOf(partition);
  if (!input) return null;
  const speed = commandedSpeed(input, settings);
  if (input instanceof PrisJoint) {
    return { joint: input.id, kind: 'translation', speed: speed * si.meters };
  }
  const radiansPerSecond = (speed * Math.PI) / 30;
  if (input.ground) {
    const driven = root(drivenLinkAt(input));
    if (!driven) return null;
    return {
      joint: input.id,
      kind: 'rotation',
      speed: radiansPerSecond,
      bodies: [GROUND, driven],
    };
  }
  const [a, b] = unique(input.links.map((link) => root(link)).filter((id) => id !== undefined));
  if (!a || !b) return null;
  unsupported.push(`input ${input.id} drives one link against another`);
  return { joint: input.id, kind: 'rotation', speed: radiansPerSecond, bodies: [a, b] };
}

function exportLoad(
  force: Force,
  root: (link: Link | undefined) => string | undefined,
  point: (x: number, y: number) => Vec,
  si: SiFactors
): OracleProblem['loads'][number] {
  const newtons = force.mag * si.newtons;
  return {
    id: force.id,
    body: root(force.link) ?? GROUND,
    at: point(force.startCoord.x, force.startCoord.y),
    vector: [newtons * Math.cos(force.angleRad), newtons * Math.sin(force.angleRad)],
    frame: force.local ? 'local' : 'global',
  };
}

/**
 * The spacing PMKS+ samples its input at, which the oracle's grid copies so
 * every PMKS+ sample has an oracle state at the same driver coordinate: a
 * degree for a pin, PRISMATIC_INPUT_STEP for a slider.
 */
function sweepStep(partition: MechanismPartition, si: SiFactors): number {
  const input = inputOf(partition);
  if (input instanceof PrisJoint) return (PRISMATIC_INPUT_STEP / MODEL_SCALE) * si.meters;
  return Math.PI / 180;
}

/** Every link id, root or member bar, to the id of the root body it belongs to. */
function rootLookup(roots: readonly Link[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const top of roots) {
    for (const member of bodiesUnder([top])) map.set(member.id, top.id);
  }
  return map;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

/**
 * The problem as the bytes the oracle hashes: one fixed key order, a space
 * of indent, a closing newline. The reference records the SHA-256 of exactly
 * these bytes, so the spec can tell a stale reference from a current one by
 * exporting again.
 */
export function serializeProblem(problem: OracleProblem): string {
  return `${JSON.stringify(problem, null, 1)}\n`;
}

/** Joints PMKS+ draws for this machine, by id: the points a comparison reads. */
export function jointById(joints: readonly Joint[]): Map<string, Joint> {
  return new Map(joints.map((joint) => [joint.id, joint]));
}
