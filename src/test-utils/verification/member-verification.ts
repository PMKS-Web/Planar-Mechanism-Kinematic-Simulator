import { buildMechanism } from './fixture';
import { structuralCrankFixture } from './structural-fixtures';
import { LengthUnit } from '../../app/model/unit-enums';
import { snapshotPmksConfiguration } from '../../app/model/structural/pmks-configuration';
import type { StructuralConfiguration } from '../../app/model/structural/configuration';
import type { LoadCase } from '../../app/model/structural/loads';
import type { StructuralMember } from '../../app/model/structural/member';
import type { BodySectionMotionState } from '../../app/model/structural/member-mass';
import type {
  StaticForceAnalysisResult,
  DynamicForceAnalysisResult,
} from '../../app/model/structural/results';
import type {
  MemberInternalLoadResult,
  MemberLoadsSuccess,
} from '../../app/model/structural/member-results';
import { evaluateMemberLoads } from '../../app/model/structural/member-diagram';

export const memberAB: StructuralMember = {
  kind: 'straight-prismatic',
  id: 'beam-AB',
  bodyId: 'AB',
  startJointId: 'A',
  endJointId: 'B',
};
export const uniformAB = { kind: 'uniform-line' as const, memberId: memberAB.id };
export const noMemberLoad: LoadCase = { name: 'No applied load', loads: [] };
export function memberConfiguration(fixture = structuralCrankFixture()): StructuralConfiguration {
  const built = buildMechanism(fixture);
  const snapshot = snapshotPmksConfiguration({
    joints: built.joints,
    links: built.links,
    coordinateSpace: 'project',
    lengthUnit: LengthUnit.METER,
  });
  if (snapshot.status !== 'ok') throw new Error(snapshot.message);
  return snapshot.configuration;
}
export function memberSuccess(result: MemberInternalLoadResult): MemberLoadsSuccess {
  if (result.status !== 'ok') throw new Error(result.status + ': ' + result.message);
  expect(result.diagnostics.normalizedClosureResidual).toBeLessThan(1e-10);
  return result;
}
export function atMember(result: MemberLoadsSuccess, xM: number, side: 'left' | 'right' = 'right') {
  const value = evaluateMemberLoads(result, { xM, side });
  if (value.status !== 'ok') throw new Error(value.message);
  return value.loads;
}

/**
 * Independent cut verification in global axes. Rebuild actual point locations
 * from the input (not diagram coefficients or the production load resolver).
 * Simpson integration is exact for the quadratic moment integrand of a line
 * with affine rigid-body acceleration, and uses actual mass, not effective q.
 */
export function verifyMemberCuts(
  configuration: StructuralConfiguration,
  load: LoadCase,
  equilibrium: StaticForceAnalysisResult | DynamicForceAnalysisResult,
  diagram: MemberLoadsSuccess,
  motion?: BodySectionMotionState
) {
  if (equilibrium.status !== 'ok') throw new Error(equilibrium.status);
  const member = diagram.member;
  const body = configuration.bodies.find((b) => b.id === member.bodyId)!;
  const mass = body.massProperties!;
  const joints = new Map(configuration.joints.map((j) => [j.id, j.positionM]));
  const origin = joints.get(body.frameJointIds[0])!,
    end = joints.get(body.frameJointIds[1])!;
  const angle = Math.atan2(end.y - origin.y, end.x - origin.x);
  const rotate = (p: { x: number; y: number }) => ({
    x: Math.cos(angle) * p.x - Math.sin(angle) * p.y,
    y: Math.sin(angle) * p.x + Math.cos(angle) * p.y,
  });
  const point = (at: { frame: string; positionM: { x: number; y: number } }) => {
    if (at.frame === 'global') return at.positionM;
    const p = rotate(at.positionM);
    return { x: origin.x + p.x, y: origin.y + p.y };
  };
  const actions: { p: { x: number; y: number }; fx: number; fy: number; couple: number }[] = [];
  for (const r of equilibrium.jointReactions.filter((r) => r.linkId === body.id))
    actions.push({ p: joints.get(r.jointId)!, fx: r.forceN.x, fy: r.forceN.y, couple: 0 });
  for (const d of equilibrium.driverReactions.filter((d) => d.linkId === body.id))
    actions.push({ p: joints.get(d.jointId)!, fx: 0, fy: 0, couple: d.momentNm });
  for (const applied of load.loads.filter((l) => l.linkId === body.id)) {
    if (applied.kind === 'moment') {
      actions.push({ p: point(applied.at!), fx: 0, fy: 0, couple: applied.momentNm });
    } else {
      const force = applied.directionFrame === 'link' ? rotate(applied.forceN) : applied.forceN;
      actions.push({ p: point(applied.at), fx: force.x, fy: force.y, couple: 0 });
    }
  }
  if (load.gravityMPerS2 && diagram.gravityModel === 'lumped-at-com')
    actions.push({
      p: mass.centerOfMassM,
      fx: mass.massKg * load.gravityMPerS2.x,
      fy: mass.massKg * load.gravityMPerS2.y,
      couple: 0,
    });
  const stations = [
    ...diagram.events.flatMap((e) => [
      { xM: e.xM, side: 'left' as const },
      { xM: e.xM, side: 'right' as const },
    ]),
    ...[0.073, 0.217, 0.531, 0.883].map((fraction) => ({
      xM: fraction * member.lengthM,
      side: 'right' as const,
    })),
  ];
  for (const station of stations) {
    const x = station.xM;
    const cut = { x: member.startM.x + x * member.axis.x, y: member.startM.y + x * member.axis.y };
    const internal = atMember(diagram, x, station.side);
    let fx = internal.axialN * member.axis.x - internal.shearN * member.transverse.x;
    let fy = internal.axialN * member.axis.y - internal.shearN * member.transverse.y;
    let moment = internal.momentNm;
    for (const action of actions) {
      const s =
        (action.p.x - member.startM.x) * member.axis.x +
        (action.p.y - member.startM.y) * member.axis.y;
      if (s < x - 1e-10 || (Math.abs(s - x) <= 1e-10 && station.side === 'right')) {
        fx += action.fx;
        fy += action.fy;
        moment +=
          (action.p.x - cut.x) * action.fy - (action.p.y - cut.y) * action.fx + action.couple;
      }
    }
    if (motion || diagram.gravityModel === 'uniform-line') {
      const density = mass.massKg / member.lengthM;
      const integrand = (s: number) => {
        const p = {
          x: member.startM.x + s * member.axis.x,
          y: member.startM.y + s * member.axis.y,
        };
        const rx = p.x - mass.centerOfMassM.x,
          ry = p.y - mass.centerOfMassM.y;
        const omega2 = (motion?.angularVelocityRadPerS ?? 0) ** 2,
          alpha = motion?.angularAccelerationRadPerS2 ?? 0;
        const ax = (motion?.centerOfMassAccelerationMPerS2.x ?? 0) - alpha * ry - omega2 * rx;
        const ay = (motion?.centerOfMassAccelerationMPerS2.y ?? 0) + alpha * rx - omega2 * ry;
        const g = diagram.gravityModel === 'uniform-line' ? load.gravityMPerS2 : undefined;
        const f = { x: density * ((g?.x ?? 0) - ax), y: density * ((g?.y ?? 0) - ay) };
        return [f.x, f.y, (p.x - cut.x) * f.y - (p.y - cut.y) * f.x];
      };
      const a = integrand(0),
        b = integrand(x / 2),
        c = integrand(x);
      const integral = a.map((value, i) => (x / 6) * (value + 4 * b[i] + c[i]));
      fx += integral[0];
      fy += integral[1];
      moment += integral[2];
    }
    expect(fx).toBeCloseTo(0, 7);
    expect(fy).toBeCloseTo(0, 7);
    expect(moment).toBeCloseTo(0, 7);
  }
}
