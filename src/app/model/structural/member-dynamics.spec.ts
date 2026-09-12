import {
  memberAB,
  uniformAB,
  noMemberLoad,
  memberConfiguration,
  memberSuccess,
  atMember,
  verifyMemberCuts,
} from '../../../test-utils/verification/member-verification';
import { structuralUniformMemberFixture } from '../../../test-utils/verification/structural-fixtures';
import type { BodySectionMotionState } from './member-mass';
import { validateMemberMass } from './member-mass';
import { resolveStructuralMember } from './member';
import { analyzeDynamic } from './dynamic-force-solver';
import { analyzeStatic } from './static-force-solver';
import { recoverDynamicMemberLoads, recoverStaticMemberLoads } from './member-load-recovery';
import type { StructuralConfiguration } from './configuration';
import type { LoadCase } from './loads';

function motion(ax = 0, ay = 0, alpha = 0, omega = 0): BodySectionMotionState {
  return {
    linkId: 'AB',
    centerOfMassAccelerationMPerS2: { x: ax, y: ay },
    angularAccelerationRadPerS2: alpha,
    angularVelocityRadPerS: omega,
  };
}
function solve(
  state: BodySectionMotionState,
  c = memberConfiguration(),
  load: LoadCase = noMemberLoad
) {
  const states = c.bodies.map((b) => ({
    ...motion(),
    ...(b.id === 'AB' ? state : {}),
    linkId: b.id,
  }));
  const eq = analyzeDynamic(c, states, load);
  const result = memberSuccess(
    recoverDynamicMemberLoads(c, memberAB, load, eq, state, {
      massDistribution: uniformAB,
      gravityModel: 'uniform-line',
    })
  );
  verifyMemberCuts(c, load, eq, result, state);
  return result;
}
describe('uniform-line dynamic member recovery', () => {
  it('H: integrates translating mass, N(x)=-6+3x for a 2 kg, 2 m rod with ax=3', () => {
    const result = solve(motion(3));
    for (const x of [0, 0.217, 1, 1.9]) {
      expect(atMember(result, x).axialN).toBeCloseTo(-6 + 3 * x, 9);
      expect(atMember(result, x).shearN).toBeCloseTo(0, 9);
      expect(atMember(result, x).momentNm).toBeCloseTo(0, 9);
    }
    expect(result.extrema.axialN.minimum.value).toBeCloseTo(-6, 9);
    expect(atMember(result, 2, 'left').axialN).toBeCloseTo(0, 9);
  });
  it('I: integrates angular acceleration about A: V=6-1.5x² and M=-8+6x-0.5x³', () => {
    const result = solve(motion(0, 3, 3));
    for (const x of [0, 0.25, 1, 1.75, 2]) {
      expect(atMember(result, x).shearN).toBeCloseTo(6 - 1.5 * x * x, 9);
      expect(atMember(result, x).momentNm).toBeCloseTo(-8 + 6 * x - 0.5 * x ** 3, 9);
    }
    expect(result.extrema.momentNm.absoluteMaximum.value).toBeCloseTo(8, 9);
  });
  for (const omega of [-2, 2]) {
    it('J: includes centripetal tension 8-2x² for signed omega=' + omega, () => {
      const result = solve(motion(-4, 0, 0, omega));
      for (const x of [0, 0.19, 0.75, 1.5, 2]) {
        expect(atMember(result, x).axialN).toBeCloseTo(8 - 2 * x * x, 9);
        expect(atMember(result, x).momentNm).toBeCloseTo(0, 9);
      }
    });
  }
  it('finds an unsampled cubic-moment maximum from its quadratic shear root', () => {
    const result = solve(motion(0, 2, 1), memberConfiguration(structuralUniformMemberFixture()));
    const x = Math.sqrt(16 / 3);
    expect(result.events.map((e) => e.xM)).toEqual([0, 4]);
    expect(result.extrema.momentNm.maximum.value).toBeCloseTo((8 / 3) * x - x ** 3 / 6, 9);
    expect(result.extrema.momentNm.maximum.at[0].xM).toBeCloseTo(x, 9);
    expect(atMember(result, x).shearN).toBeCloseTo(0, 9);
  });
  it('finds an interior axial maximum when the centripetal field changes sign at CoM', () => {
    const result = solve(motion(0, 0, 0, 2));
    expect(result.extrema.axialN.maximum.value).toBeCloseTo(2, 9);
    expect(result.extrema.axialN.maximum.at[0].xM).toBeCloseTo(1, 9);
  });
  it('combines distributed gravity, both inertial terms, an off-axis load, and a located couple', () => {
    const result = solve(motion(-4, 3, 3, -2), memberConfiguration(), {
      name: 'All contributions',
      gravityMPerS2: { x: 2, y: -10 },
      loads: [
        {
          kind: 'point-force',
          linkId: 'AB',
          directionFrame: 'global',
          at: { frame: 'global', positionM: { x: 0.75, y: 0.2 } },
          forceN: { x: 10, y: -12 },
        },
        {
          kind: 'moment',
          linkId: 'AB',
          momentNm: 7,
          at: { frame: 'link', positionM: { x: 1.5, y: 0 } },
        },
      ],
    });
    expect(result.gravityModel).toBe('uniform-line');
    expect(result.massModel).toBe('uniform-line');
    expect(atMember(result, 2)).toEqual(
      expect.objectContaining({
        axialN: expect.closeTo(0, 8),
        shearN: expect.closeTo(0, 8),
        momentNm: expect.closeTo(0, 8),
      })
    );
  });
  it('zero-motion dynamic recovery agrees with static recovery including distributed gravity', () => {
    const c = memberConfiguration(),
      load = { ...noMemberLoad, gravityMPerS2: { x: 0, y: -10 } };
    const dynamic = solve(motion(), c, load);
    const eq = analyzeStatic(c, load);
    const statics = memberSuccess(
      recoverStaticMemberLoads(c, memberAB, load, eq, {
        gravityModel: 'uniform-line',
        massDistribution: uniformAB,
      })
    );
    verifyMemberCuts(c, load, eq, statics);
    expect(dynamic.events).toEqual(statics.events);
    for (const key of ['axialN', 'shearN', 'momentNm'] as const) {
      dynamic.segments.forEach((segment, i) =>
        segment[key].forEach((coefficient, j) =>
          expect(coefficient).toBeCloseTo(statics.segments[i][key][j], 12)
        )
      );
    }
    expect(dynamic.extrema).toEqual(statics.extrema);
  });
  it('K: refuses inconsistent uniform-line CoM or inertia without changing root properties', () => {
    const c = memberConfiguration();
    for (const massProperties of [
      { massKg: 2, centerOfMassM: { x: 1.2, y: 0 }, inertiaKgM2: 2 / 3 },
      { massKg: 2, centerOfMassM: { x: 1, y: 0.1 }, inertiaKgM2: 2 / 3 },
      { massKg: 2, centerOfMassM: { x: 1, y: 0 }, inertiaKgM2: 1 },
      { massKg: 0, centerOfMassM: { x: 1, y: 0 }, inertiaKgM2: 1 },
      { massKg: 4, centerOfMassM: { x: 1, y: 0 }, inertiaKgM2: 2 / 3 },
    ]) {
      const invalid: StructuralConfiguration = {
        ...c,
        bodies: [{ ...c.bodies[0], massProperties }],
      };
      const eq = analyzeDynamic(invalid, [motion()], noMemberLoad);
      const result = recoverDynamicMemberLoads(invalid, memberAB, noMemberLoad, eq, motion(), {
        massDistribution: uniformAB,
      });
      expect(result.status).toBe('mass-distribution-mismatch');
      expect('events' in result).toBe(false);
      expect(invalid.bodies[0].massProperties).toEqual(massProperties);
    }
  });
  it('integrates to authoritative total mass, CoM, and inertia without a competing mass field', () => {
    const c = memberConfiguration();
    const resolved = resolveStructuralMember(c, memberAB);
    if (resolved.status !== 'ok') throw new Error(resolved.message);
    const line = validateMemberMass(resolved.member, resolved.body, uniformAB);
    if (line.status !== 'ok') throw new Error(line.message);
    const L = resolved.member.lengthM,
      density = line.massPerLengthKgPerM;
    expect(density * L).toBe(c.bodies[0].massProperties!.massKg);
    expect((density * L * L) / 2 / (density * L)).toBe(c.bodies[0].massProperties!.centerOfMassM.x);
    expect((density * L ** 3) / 12).toBeCloseTo(c.bodies[0].massProperties!.inertiaKgM2, 12);
  });
  it('requires explicit distribution and finite angular velocity and rejects mismatched motion', () => {
    const c = memberConfiguration(),
      state = motion(),
      eq = analyzeDynamic(c, [state], noMemberLoad);
    expect(recoverDynamicMemberLoads(c, memberAB, noMemberLoad, eq, state).status).toBe(
      'missing-mass-distribution'
    );
    for (const angularVelocityRadPerS of [undefined, NaN, Infinity]) {
      expect(
        recoverDynamicMemberLoads(
          c,
          memberAB,
          noMemberLoad,
          eq,
          { ...state, angularVelocityRadPerS } as BodySectionMotionState,
          { massDistribution: uniformAB }
        ).status
      ).toBe('missing-angular-velocity');
    }
    expect(
      recoverDynamicMemberLoads(
        c,
        memberAB,
        noMemberLoad,
        eq,
        { ...state, linkId: 'leaf' },
        { massDistribution: uniformAB }
      ).status
    ).toBe('invalid-dynamic-state');
    expect(
      recoverDynamicMemberLoads(c, memberAB, noMemberLoad, eq, motion(1), {
        massDistribution: uniformAB,
      }).status
    ).toBe('invalid-equilibrium-result');
  });
});
