import { Joint, RealJoint, RevJoint } from '../joint';
import { Link, RealLink } from '../link';
import { GearAssembly, gearPitchRadius } from '../gear';
import { MODEL_SCALE } from '../render-scale';
import { assignBodies, WORLD } from './bodies';

export type GearDiagnosticCode =
  | 'invalid-definition'
  | 'duplicate-id'
  | 'missing-host'
  | 'invalid-reference'
  | 'moving-axis'
  | 'compound-host'
  | 'missing-gear'
  | 'self-mesh'
  | 'duplicate-mesh'
  | 'same-body-mesh'
  | 'unsupported-mesh'
  | 'incompatible-module'
  | 'center-distance'
  | 'input'
  | 'locking-cycle'
  | 'unreachable'
  | 'work-limit';

export interface GearDiagnostic {
  readonly code: GearDiagnosticCode;
  readonly ids: readonly string[];
  readonly message: string;
}

/** Bounds computation, not the manufacturability of the teeth. */
export const MAX_GEARS = 128;
export const MAX_GEAR_MESHES = 256;

export function validateGearAssembly(
  assembly: GearAssembly,
  joints: Joint[],
  links: Link[]
): GearDiagnostic[] {
  const errors: GearDiagnostic[] = [];
  const fail = (code: GearDiagnosticCode, ids: string[], message: string) =>
    errors.push({ code, ids, message });
  if (assembly.gears.length > MAX_GEARS || assembly.meshes.length > MAX_GEAR_MESHES) {
    fail('work-limit', [], 'This gear network exceeds the supported record limit.');
    return errors;
  }
  const assignment = assignBodies(joints, links);
  const gearIds = new Set<string>();
  const hosts = new Map<string, string>();
  const bodyByGear = new Map<string, string>();
  for (const gear of assembly.gears) {
    if (!gear.id || gearIds.has(gear.id))
      fail('duplicate-id', [gear.id], 'Gear IDs must be unique and nonempty.');
    gearIds.add(gear.id);
    const radius = gearPitchRadius(gear);
    if (
      !Number.isSafeInteger(gear.teeth) ||
      gear.teeth <= 0 ||
      !Number.isFinite(gear.module) ||
      gear.module <= 0 ||
      !Number.isFinite(radius) ||
      radius <= 0
    ) {
      fail(
        'invalid-definition',
        [gear.id],
        'Use a positive integer tooth count and a positive finite module.'
      );
    }
    const host = links.find((link) => link.id === gear.hostLinkId);
    if (!(host instanceof RealLink)) {
      fail('missing-host', [gear.id, gear.hostLinkId], 'A gear needs an ordinary rigid link host.');
      continue;
    }
    const body = assignment.bodyOf(host);
    bodyByGear.set(gear.id, body);
    if (
      host.subset.length ||
      body === WORLD ||
      hosts.has(body) ||
      links.filter((link) => assignment.bodyOf(link) === body).length !== 1
    ) {
      fail(
        'compound-host',
        [gear.id, host.id],
        'V1 supports one gear on a simple rotating link body.'
      );
    }
    hosts.set(body, gear.id);
    const center = joints.find((joint) => joint.id === gear.centerJointId);
    const reference = joints.find((joint) => joint.id === gear.referenceJointId);
    if (!(center instanceof RevJoint) || !center.ground) {
      fail(
        'moving-axis',
        [gear.id, gear.centerJointId],
        'V1 requires a grounded revolute gear center.'
      );
    }
    if (
      !center ||
      !reference ||
      center === reference ||
      !host.joints.includes(center) ||
      !host.joints.includes(reference) ||
      !(reference instanceof RealJoint) ||
      reference.ground ||
      ![center.x, center.y, reference.x, reference.y].every(Number.isFinite) ||
      Math.hypot(reference.x - center.x, reference.y - center.y) <= 1e-6 * MODEL_SCALE
    ) {
      fail(
        'invalid-reference',
        [gear.id],
        'Choose distinct center and moving reference points on the host.'
      );
    }
    if (host.joints.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
      fail('invalid-definition', [gear.id], 'Every host point must have finite coordinates.');
    }
  }
  const meshIds = new Set<string>();
  const pairs = new Set<string>();
  for (const mesh of assembly.meshes) {
    if (!mesh.id || meshIds.has(mesh.id))
      fail('duplicate-id', [mesh.id], 'Mesh IDs must be unique and nonempty.');
    meshIds.add(mesh.id);
    if (mesh.kind !== 'external')
      fail('unsupported-mesh', [mesh.id], 'V1 supports external meshes only.');
    const a = assembly.gears.find((gear) => gear.id === mesh.gearAId);
    const b = assembly.gears.find((gear) => gear.id === mesh.gearBId);
    if (!a || !b) {
      fail('missing-gear', [mesh.id], 'Both mesh endpoints must exist.');
      continue;
    }
    if (a.id === b.id) fail('self-mesh', [mesh.id], 'A gear cannot mesh with itself.');
    const pair = JSON.stringify([a.id, b.id].sort());
    if (pairs.has(pair)) fail('duplicate-mesh', [mesh.id], 'These gears already have a mesh.');
    pairs.add(pair);
    if (bodyByGear.has(a.id) && bodyByGear.get(a.id) === bodyByGear.get(b.id)) {
      fail('same-body-mesh', [mesh.id], 'External mesh endpoints must belong to distinct bodies.');
    }
    if (Math.abs(a.module - b.module) > 1e-10 * Math.max(a.module, b.module)) {
      fail('incompatible-module', [mesh.id], 'Meshed gears must have matching module.');
    }
    const ca = joints.find((joint) => joint.id === a.centerJointId);
    const cb = joints.find((joint) => joint.id === b.centerJointId);
    if (ca && cb) {
      const actual = Math.hypot(cb.x - ca.x, cb.y - ca.y);
      const required = gearPitchRadius(a) + gearPitchRadius(b);
      // This API receives unquantized model geometry. A future URL loader may
      // need a separate rounding allowance; applying that here admits visibly
      // separated pitch circles in small computational fixtures.
      const tolerance = 1e-8 * Math.max(actual, required);
      if (!Number.isFinite(actual) || actual === 0 || Math.abs(actual - required) > tolerance) {
        fail(
          'center-distance',
          [mesh.id],
          'External gear centers must be separated by the sum of pitch radii.'
        );
      }
    }
  }
  return errors;
}
