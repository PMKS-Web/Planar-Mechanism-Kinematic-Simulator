import { Joint, RealJoint } from '../joint';
import { Link } from '../link';
import { GearAssembly } from '../gear';
import { GearDiagnostic, validateGearAssembly } from './gear-validation';

export interface GearRatio {
  readonly numerator: bigint;
  readonly denominator: bigint;
}
export interface GearBodyMotion {
  readonly gearId: string;
  readonly hostLinkId: string;
  readonly centerId: string;
  readonly center: readonly [number, number];
  readonly heading: number;
  readonly ratio: GearRatio;
  readonly multiplier: number;
  readonly points: readonly { readonly id: string; readonly offset: readonly [number, number] }[];
}
export interface GearDrive {
  readonly bodies: readonly GearBodyMotion[];
  readonly periodTurns: number;
  readonly step: number;
  readonly inputJointId: string;
}
export type GearCompilation =
  | { readonly ok: true; readonly drive: GearDrive }
  | { readonly ok: false; readonly diagnostics: readonly GearDiagnostic[] };

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  while (b !== 0n) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a;
}
function ratio(numerator: bigint, denominator: bigint): GearRatio {
  const divisor = gcd(numerator, denominator);
  return Object.freeze({ numerator: numerator / divisor, denominator: denominator / divisor });
}

/** Compile once; sample motion from the authored pose rather than wrapped angles. */
export function compileGearDrive(
  assembly: GearAssembly,
  joints: Joint[],
  links: Link[]
): GearCompilation {
  const diagnostics = validateGearAssembly(assembly, joints, links);
  const refuse = (
    code: GearDiagnostic['code'],
    ids: string[],
    message: string
  ): GearCompilation => ({ ok: false, diagnostics: [...diagnostics, { code, ids, message }] });
  if (diagnostics.length) return { ok: false, diagnostics };
  const inputs = joints.filter((joint) => joint instanceof RealJoint && joint.input);
  const roots = assembly.gears.filter((gear) => gear.centerJointId === inputs[0]?.id);
  if (inputs.length !== 1 || roots.length !== 1) {
    return refuse(
      'input',
      inputs.map((joint) => joint.id),
      'Choose one grounded gear center as the independent input.'
    );
  }
  const neighbors = new Map(
    assembly.gears.map((gear) => [gear.id, [] as { id: string; mesh: string }[]])
  );
  const gears = new Map(assembly.gears.map((gear) => [gear.id, gear]));
  for (const mesh of assembly.meshes) {
    neighbors.get(mesh.gearAId)!.push({ id: mesh.gearBId, mesh: mesh.id });
    neighbors.get(mesh.gearBId)!.push({ id: mesh.gearAId, mesh: mesh.id });
  }
  const ratios = new Map<string, GearRatio>([[roots[0].id, ratio(1n, 1n)]]);
  const queue = [roots[0].id];
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index];
    const current = ratios.get(id)!;
    for (const neighbor of neighbors.get(id)!) {
      const next = ratio(
        -current.numerator * BigInt(gears.get(id)!.teeth),
        current.denominator * BigInt(gears.get(neighbor.id)!.teeth)
      );
      const prior = ratios.get(neighbor.id);
      if (prior && (prior.numerator !== next.numerator || prior.denominator !== next.denominator)) {
        return refuse(
          'locking-cycle',
          [neighbor.mesh, id, neighbor.id],
          'This closed gear cycle locks the driven rotation.'
        );
      }
      if (!prior) {
        ratios.set(neighbor.id, next);
        queue.push(neighbor.id);
      }
    }
  }
  if (ratios.size !== assembly.gears.length) {
    return refuse(
      'unreachable',
      assembly.gears.filter((gear) => !ratios.has(gear.id)).map((gear) => gear.id),
      'Every dependent gear must be reachable from the independent input.'
    );
  }
  let period = 1n;
  for (const value of ratios.values())
    period = (period / gcd(period, value.denominator)) * value.denominator;
  const fastest = Math.max(
    1,
    ...[...ratios.values()].map((value) =>
      Math.abs(Number(value.numerator) / Number(value.denominator))
    )
  );
  const stepsPerTurn = Math.ceil(360 * fastest);
  const samples = Number(period) * stepsPerTurn;
  // Includes the authored frame. Keep the solver's existing global cap.
  if (!Number.isFinite(samples) || samples + 1 > 6000)
    return refuse('work-limit', [], 'The complete gear cycle exceeds 6,000 samples.');
  const bodies = assembly.gears.map((gear) => {
    const host = links.find((link) => link.id === gear.hostLinkId)!;
    const center = joints.find((joint) => joint.id === gear.centerJointId)!;
    const reference = joints.find((joint) => joint.id === gear.referenceJointId)!;
    const exact = ratios.get(gear.id)!;
    return Object.freeze({
      gearId: gear.id,
      hostLinkId: host.id,
      centerId: center.id,
      center: Object.freeze([center.x, center.y] as const),
      heading: Math.atan2(reference.y - center.y, reference.x - center.x),
      ratio: exact,
      multiplier: Number(exact.numerator) / Number(exact.denominator),
      points: Object.freeze(
        host.joints.map((point) =>
          Object.freeze({
            id: point.id,
            offset: Object.freeze([point.x - center.x, point.y - center.y] as const),
          })
        )
      ),
    });
  });
  return {
    ok: true,
    drive: Object.freeze({
      bodies: Object.freeze(bodies),
      periodTurns: Number(period),
      step: (2 * Math.PI) / stepsPerTurn,
      inputJointId: inputs[0].id,
    }),
  };
}

export interface GearMotion {
  positions: Map<string, [number, number]>;
  velocity: Map<string, [number, number]>;
  acceleration: Map<string, [number, number]>;
  angles: Map<string, { angle: number; velocity: number; acceleration: number }>;
}

export function gearMotionAt(
  drive: GearDrive,
  q: number,
  qDot: number,
  qDDot = 0
): GearMotion | undefined {
  if (![q, qDot, qDDot].every(Number.isFinite)) return undefined;
  const result: GearMotion = {
    positions: new Map(),
    velocity: new Map(),
    acceleration: new Map(),
    angles: new Map(),
  };
  for (const body of drive.bodies) {
    const angle = body.multiplier * q;
    const omega = body.multiplier * qDot;
    const alpha = body.multiplier * qDDot;
    const c = Math.cos(angle),
      s = Math.sin(angle);
    result.angles.set(body.gearId, {
      angle: body.heading + angle,
      velocity: omega,
      acceleration: alpha,
    });
    for (const point of body.points) {
      const rx = c * point.offset[0] - s * point.offset[1];
      const ry = s * point.offset[0] + c * point.offset[1];
      const values: [Map<string, [number, number]>, [number, number]][] = [
        [result.positions, [body.center[0] + rx, body.center[1] + ry]],
        [result.velocity, [-omega * ry, omega * rx]],
        [result.acceleration, [-alpha * ry - omega * omega * rx, alpha * rx - omega * omega * ry]],
      ];
      for (const [map, value] of values) {
        const prior = map.get(point.id);
        if (
          !value.every(Number.isFinite) ||
          (prior &&
            Math.hypot(prior[0] - value[0], prior[1] - value[1]) >
              1e-9 * Math.max(1, Math.hypot(...value)))
        )
          return undefined;
        map.set(point.id, value);
      }
    }
  }
  return result;
}
