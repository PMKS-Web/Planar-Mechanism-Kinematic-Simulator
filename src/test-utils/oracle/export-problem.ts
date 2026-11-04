// joint.ts first: see the import-cycle note in test-utils/verification/fixture.ts.
import '../../app/model/joint';
import { Joint, PrisJoint, RealJoint } from '../../app/model/joint';
import { bodiesUnder, Link, RealLink } from '../../app/model/link';
import { Force } from '../../app/model/force';
import { MechanismPartition } from '../../app/model/mechanism/mechanism-partition';
import { MODEL_SCALE } from '../../app/model/render-scale';
import {
  PRISMATIC_INPUT_STEP,
  SAMPLES_PER_STROKE,
} from '../../app/model/mechanism/position-solver';
import { SettingsService } from '../../app/services/settings.service';
import { LengthUnit } from '../../app/model/unit-enums';
import { cylinderAtSeal, cylinderStrokeAlong } from '../../app/model/cylinder';
import { MARK } from '../../app/model/joint-marks';
import { drivenLink, GROUND_BODY, resolveActuator } from '../../app/model/actuator';
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
  /** The block's travel along `axis` from `linePoint`, in meters, where the slot has ends. */
  limits?: Vec;
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
 * The link whose rotation a pin input drives: the body the actuator record
 * names, the same one the position solve turns and the force solver puts the
 * input torque on (`drivenLink` in actuator.ts).
 */
export function drivenLinkAt(input: RealJoint): RealLink | undefined {
  // drivenLink falls back to the first link where PMKS+ refuses the input.
  const link = drivenLink(input);
  return link instanceof RealLink ? link : undefined;
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

  const interiors = cylinderInteriors(partition.joints);
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
    const [x, y] = interiors.get(joint.id) ?? [joint.x, joint.y];
    const at = point(x, y);
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
    driver: exportDriver(partition, settings, root, si),
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
  const cylinder = cylinderAtSeal(joint);
  // A cylinder's slot runs from mount A toward mount B: its interior is derived
  // on that line (`cylinderInteriors`), wherever the URL left N.
  const axis: Vec = cylinder
    ? unit(cylinder.mountB.x - cylinder.mountA.x, cylinder.mountB.y - cylinder.mountA.y)
    : [Math.cos(joint.slotAngle), Math.sin(joint.slotAngle)];
  let limits: Vec | undefined;
  if (cylinder) {
    limits = cylinderStroke(joint, si);
    if (!limits) unsupported.push(`cylinder at ${joint.id}: no stroke`);
  } else if (joint.carrier) {
    limits = floatingSlotLimits(joint, axis, si);
    if (!limits) unsupported.push(`floating slot ${joint.id}: no channel between its ends`);
  }
  return {
    id: joint.id,
    kind: 'slider',
    at,
    guide,
    linePoint,
    axis,
    riders,
    rotates: joint.rotates,
    blockMass: joint.mass * si.kilograms,
    ...(limits ? { limits } : {}),
  };
}

/**
 * Where PMKS+ puts each cylinder's hidden inner end N and its seal S: on the
 * line from mount A to mount B, N one barrel length from A and S one rod length
 * back from B, both lengths measured at the drawn pose. The position solve
 * derives them so at every sample, the first included (`sealedCylinderInterior`
 * in position-solver.ts), and a URL stores them only to its own grain, which
 * leaves the four points a micrometer off a line. Written where they are
 * derived, the problem is the pose PMKS+ starts from, with the mounts where
 * they were drawn.
 */
function cylinderInteriors(joints: readonly Joint[]): Map<string, [number, number]> {
  const derived = new Map<string, [number, number]>();
  for (const joint of joints) {
    if (!(joint instanceof PrisJoint)) continue;
    const cylinder = cylinderAtSeal(joint);
    if (!cylinder) continue;
    const { mountA, mountB, inner, seal } = cylinder;
    const [ux, uy] = unit(mountB.x - mountA.x, mountB.y - mountA.y);
    const barrel = Math.hypot(inner.x - mountA.x, inner.y - mountA.y);
    const rod = Math.hypot(mountB.x - seal.x, mountB.y - seal.y);
    derived.set(inner.id, [mountA.x + barrel * ux, mountA.y + barrel * uy]);
    derived.set(seal.id, [mountB.x - rod * ux, mountB.y - rod * uy]);
  }
  return derived;
}

function unit(x: number, y: number): Vec {
  const length = Math.hypot(x, y);
  return [x / length, y / length];
}

/**
 * The stroke of a sealed cylinder, as travel of its seal from mount A along
 * the barrel: `span - rodLength` must lie within `cylinderStrokeAlong` of the
 * barrel's length, measured once at the drawn pose, to STROKE_TOLERANCE
 * (`sealedCylinderInterior` in position-solver.ts). The stroke itself is the
 * part's geometry, read from the same function the drawing is cut to.
 */
const STROKE_TOLERANCE = 1e-3;
function cylinderStroke(seal: PrisJoint, si: SiFactors): Vec | undefined {
  const stroke = strokeOf(seal);
  if (!stroke) return undefined;
  const meters = si.meters / MODEL_SCALE;
  return [(stroke.min - STROKE_TOLERANCE) * meters, (stroke.max + STROKE_TOLERANCE) * meters];
}

function strokeOf(seal: PrisJoint): { min: number; max: number } | undefined {
  const cylinder = cylinderAtSeal(seal);
  if (!cylinder) return undefined;
  const { mountA, inner } = cylinder;
  const stroke = cylinderStrokeAlong(Math.hypot(inner.x - mountA.x, inner.y - mountA.y));
  return stroke.max > stroke.min ? stroke : undefined;
}

/**
 * How far a slot cut into a link may carry its block: a channel between the
 * two joints that define it, with round ends. PMKS+ refuses a pose whose pin
 * lies further than `slotReach` from the channel's midpoint by more than
 * SLOT_END_TOLERANCE of the channel's length (`ridersAreInTheirSlots` in
 * position-solver.ts), so that bound is the slot's end here, as travel from
 * joint a along the slot's axis. The constants are restated, as the units table
 * is, so a change to PMKS+'s rule shows up as a disagreement, not a silent
 * re-export.
 */
const SLOT_END_TOLERANCE = 2e-3;
function floatingSlotLimits(joint: PrisJoint, axis: Vec, si: SiFactors): Vec | undefined {
  const a = joint.slotJointA;
  const b = joint.slotJointB;
  if (!a || !b) return undefined;
  const separation = Math.hypot(b.x - a.x, b.y - a.y);
  if (!(separation > 0)) return undefined;
  const inset = separation / 2 - MARK.slotInset * 0.15 * SettingsService.objectScale;
  const reach = (inset > 0 ? inset : separation / 2) + SLOT_END_TOLERANCE * separation;
  const middle = ((b.x - a.x) / 2) * axis[0] + ((b.y - a.y) / 2) * axis[1];
  const meters = si.meters / MODEL_SCALE;
  return [(middle - reach) * meters, (middle + reach) * meters];
}

function exportDriver(
  partition: MechanismPartition,
  settings: SettingsService,
  root: (link: Link | undefined) => string | undefined,
  si: SiFactors
): OracleDriver | null {
  const input = inputOf(partition);
  if (!input) return null;
  const speed = commandedSpeed(input, settings);
  if (input instanceof PrisJoint) {
    return { joint: input.id, kind: 'translation', speed: speed * si.meters };
  }
  const radiansPerSecond = (speed * Math.PI) / 30;
  // The actuator record says which body turns against which: the frame and a
  // crank at a grounded pivot, or two links at a floating one, where the drive
  // prescribes the angle between them (PinDrive in position-solver.ts). Where
  // PMKS+ refuses the input there is no record, and the oracle still drives
  // the first bar at a grounded pivot: the physics runs whether PMKS+ does or not.
  if (input.ground) {
    const driven = root(drivenLinkAt(input));
    if (!driven) return null;
    return { joint: input.id, kind: 'rotation', speed: radiansPerSecond, bodies: [GROUND, driven] };
  }
  const actuator = resolveActuator(input);
  const bodyOf = (body: Link | typeof GROUND_BODY): string | undefined =>
    body === GROUND_BODY ? GROUND : root(body);
  // Refused, the first two bodies met there, in the order the joint lists them.
  const [first, second] = unique(
    input.links.map((link) => root(link)).filter((id): id is string => id !== undefined)
  );
  const reference = actuator?.kind === 'angle' ? bodyOf(actuator.referenceBody) : first;
  const driven = actuator?.kind === 'angle' ? bodyOf(actuator.drivenBody) : second;
  if (!reference || !driven || reference === driven) return null;
  return {
    joint: input.id,
    kind: 'rotation',
    speed: radiansPerSecond,
    bodies: [reference, driven],
  };
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
 * degree for a pin, a 180th of the stroke for a cylinder, PRISMATIC_INPUT_STEP
 * for any other slider.
 */
function sweepStep(partition: MechanismPartition, si: SiFactors): number {
  const input = inputOf(partition);
  if (!(input instanceof PrisJoint)) return Math.PI / 180;
  // A driven cylinder cuts its stroke into SAMPLES_PER_STROKE samples
  // (registerCylinderDrive in position-solver.ts); any other slider steps a
  // fixed PRISMATIC_INPUT_STEP.
  const stroke = strokeOf(input);
  const step = stroke ? (stroke.max - stroke.min) / SAMPLES_PER_STROKE : PRISMATIC_INPUT_STEP;
  return (step / MODEL_SCALE) * si.meters;
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
