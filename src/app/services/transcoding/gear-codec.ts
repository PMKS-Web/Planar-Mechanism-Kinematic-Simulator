import { GearAssembly } from '../../model/gear';
import { MAX_GEARS, MAX_GEAR_MESHES } from '../../model/mechanism/gear-validation';
import { JointData, LinkData } from './transcoder-data';

/** G1 carries authored gear data and the precise joint geometry of its document.
 * Coordinates and module use project units here, model units in the live drawing.
 * Legacy coordinate fields remain a compatibility shell; G1 coordinates replace them.
 */
interface GearDocument extends GearAssembly {
  points: [string, number, number][];
}

const MAX_PAYLOAD = 500_000;
const canonical = (value: number) => Number(value.toPrecision(15));
const identifier = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value);
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export function encodeGearDocument(assembly: GearAssembly, joints: JointData[]): string[] {
  if (!assembly.gears.length && !assembly.meshes.length) return [];
  const document: GearDocument = {
    gears: [...assembly.gears]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((gear) => ({
        id: gear.id,
        hostLinkId: gear.hostLinkId,
        centerJointId: gear.centerJointId,
        referenceJointId: gear.referenceJointId,
        teeth: gear.teeth,
        module: canonical(gear.module),
        ...(gear.name === undefined ? {} : { name: gear.name }),
      })),
    meshes: [...assembly.meshes]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((mesh) => ({
        id: mesh.id,
        gearAId: mesh.gearAId,
        gearBId: mesh.gearBId,
        kind: mesh.kind,
      })),
    points: [...joints]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((joint) => [joint.id, canonical(joint.x), canonical(joint.y)]),
  };
  const bytes = new TextEncoder().encode(JSON.stringify(document));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const payload = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  if (payload.length > MAX_PAYLOAD) throw new Error('Gear document exceeds the storage limit.');
  return ['G1~' + payload];
}

/** Structural preflight only. Physical incompatibilities remain editable readiness blockers. */
export function decodeGearDocument(
  entries: string[],
  joints: JointData[],
  links: LinkData[]
): GearAssembly {
  if (!entries.length) return { gears: [], meshes: [] };
  if (entries.length !== 1 || !entries[0].startsWith('G1~'))
    throw new Error('Unsupported or duplicate gear extension.');
  const payload = entries[0].slice(3);
  if (payload.length > MAX_PAYLOAD || !/^[A-Za-z0-9_-]+$/.test(payload))
    throw new Error('Malformed gear payload.');
  const binary = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
  const value = JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(binary, (c) => c.charCodeAt(0))
    )
  ) as GearDocument;
  if (
    !value ||
    !Array.isArray(value.gears) ||
    !Array.isArray(value.meshes) ||
    !Array.isArray(value.points) ||
    value.gears.length > MAX_GEARS ||
    value.meshes.length > MAX_GEAR_MESHES
  )
    throw new Error('Malformed gear collections.');
  const ids = new Set<string>();
  for (const gear of value.gears) {
    if (
      !gear ||
      !identifier(gear.id) ||
      ids.has(gear.id) ||
      !Number.isSafeInteger(gear.teeth) ||
      gear.teeth <= 0 ||
      !finite(gear.module) ||
      gear.module <= 0 ||
      !Number.isFinite(gear.module * gear.teeth) ||
      (gear.name !== undefined && (typeof gear.name !== 'string' || gear.name.length > 200))
    )
      throw new Error('Malformed gear definition.');
    ids.add(gear.id);
    const host = links.find((link) => link.id === gear.hostLinkId);
    if (
      !host ||
      !host.isRoot ||
      !joints.some((j) => j.id === gear.centerJointId) ||
      !joints.some((j) => j.id === gear.referenceJointId) ||
      !host.jointIDs.includes(gear.centerJointId) ||
      !host.jointIDs.includes(gear.referenceJointId) ||
      gear.centerJointId === gear.referenceJointId
    )
      throw new Error('Gear references do not resolve.');
  }
  const meshes = new Set<string>();
  const pairs = new Set<string>();
  for (const mesh of value.meshes) {
    if (
      !mesh ||
      !identifier(mesh.id) ||
      meshes.has(mesh.id) ||
      mesh.kind !== 'external' ||
      !ids.has(mesh.gearAId) ||
      !ids.has(mesh.gearBId) ||
      mesh.gearAId === mesh.gearBId
    )
      throw new Error('Malformed gear mesh.');
    const pair = JSON.stringify([mesh.gearAId, mesh.gearBId].sort());
    if (pairs.has(pair)) throw new Error('Duplicate gear mesh.');
    meshes.add(mesh.id);
    pairs.add(pair);
  }
  const points = new Map<string, [number, number]>();
  for (const point of value.points) {
    if (
      !Array.isArray(point) ||
      point.length !== 3 ||
      !identifier(point[0]) ||
      points.has(point[0]) ||
      !finite(point[1]) ||
      !finite(point[2]) ||
      !joints.some((j) => j.id === point[0])
    )
      throw new Error('Malformed precise joint geometry.');
    points.set(point[0], [point[1], point[2]]);
  }
  if (points.size !== joints.length) throw new Error('Incomplete precise joint geometry.');
  rejectMultipleGearInputs(value, joints, links);
  for (const joint of joints) [joint.x, joint.y] = points.get(joint.id)!;
  // Whitelist authored fields; never admit a carried compiled graph or runtime state.
  return {
    gears: value.gears.map((g) => ({
      id: g.id,
      hostLinkId: g.hostLinkId,
      centerJointId: g.centerJointId,
      referenceJointId: g.referenceJointId,
      teeth: g.teeth,
      module: g.module,
      ...(g.name === undefined ? {} : { name: g.name }),
    })),
    meshes: value.meshes.map((m) => ({
      id: m.id,
      gearAId: m.gearAId,
      gearBId: m.gearBId,
      kind: m.kind,
    })),
  };
}

/** Match moving-body connectivity without constructing or mutating application services. */
function rejectMultipleGearInputs(
  assembly: GearAssembly,
  joints: JointData[],
  links: LinkData[]
): void {
  const roots = links.filter((link) => link.isRoot);
  const parent = new Map(roots.map((link) => [link.id, link.id]));
  const root = (id: string): string => {
    let next = id;
    while (parent.get(next) !== next && parent.has(next)) next = parent.get(next)!;
    return next;
  };
  const join = (a: string, b: string) => parent.set(root(a), root(b));
  for (const joint of joints.filter((j) => !j.isGrounded)) {
    const attached = roots.filter((link) => link.jointIDs.includes(joint.id));
    for (const link of attached.slice(1)) join(attached[0].id, link.id);
  }
  for (const mesh of assembly.meshes) {
    const a = assembly.gears.find((g) => g.id === mesh.gearAId)!;
    const b = assembly.gears.find((g) => g.id === mesh.gearBId)!;
    join(a.hostLinkId, b.hostLinkId);
  }
  for (const group of new Set(assembly.gears.map((g) => root(g.hostLinkId)))) {
    const members = roots.filter((link) => root(link.id) === group);
    const inputs = joints.filter(
      (j) => j.isInput && members.some((link) => link.jointIDs.includes(j.id))
    );
    if (inputs.length > 1)
      throw new Error('A geared mechanism may have only one independent input.');
  }
}
