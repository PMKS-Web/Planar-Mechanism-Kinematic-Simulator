import {
  memberAB,
  uniformAB,
  noMemberLoad,
  memberConfiguration,
  memberSuccess,
  atMember,
  verifyMemberCuts,
} from '../../../test-utils/verification/member-verification';
import { structuralBeamFixture } from '../../../test-utils/verification/structural-fixtures';
import { analyzeStatic } from './static-force-solver';
import { recoverStaticMemberLoads } from './member-load-recovery';
import { evaluateMemberLoads } from './member-diagram';
import type { LoadCase } from './loads';
import type { StructuralConfiguration } from './configuration';

function force(x: number, y: number, fx: number, fy: number): LoadCase {
  return {
    name: 'Point load',
    loads: [
      {
        kind: 'point-force',
        linkId: 'AB',
        at: { frame: 'link', positionM: { x, y } },
        directionFrame: 'link',
        forceN: { x: fx, y: fy },
      },
    ],
  };
}
function solve(load: LoadCase, configuration = memberConfiguration(), options = {}) {
  const equilibrium = analyzeStatic(configuration, load);
  const result = memberSuccess(
    recoverStaticMemberLoads(configuration, memberAB, load, equilibrium, options)
  );
  verifyMemberCuts(configuration, load, equilibrium, result);
  return result;
}
describe('static member section cuts', () => {
  it('A: returns constant positive tension under axial end loading', () => {
    const result = solve(force(2, 0, 50, 0));
    expect(atMember(result, 0.5)).toEqual({ axialN: 50, shearN: 0, momentNm: 0 });
    expect(result.extrema.axialN.maximum.value).toBe(50);
    expect(result.extrema.axialN.maximum.intervals).toEqual([{ startM: 0, endM: 2 }]);
    expect(atMember(result, 2, 'left').axialN).toBe(50);
    expect(atMember(result, 2, 'right').axialN).toBe(0);
  });
  it('B: recovers cantilever shear and hogging moment including both support limits', () => {
    const result = solve(force(2, 0, 0, -100));
    for (const x of [0, 0.3, 0.7, 1.5]) {
      expect(atMember(result, x).shearN).toBeCloseTo(100, 9);
      expect(atMember(result, x).momentNm).toBeCloseTo(-200 + 100 * x, 9);
    }
    expect(atMember(result, 0, 'left')).toEqual({ axialN: 0, shearN: 0, momentNm: 0 });
    expect(atMember(result, 2, 'left').momentNm).toBeCloseTo(0, 9);
    expect(result.extrema.momentNm.minimum.value).toBeCloseTo(-200, 9);
    expect(result.extrema.momentNm.absoluteMaximum.at).toContainEqual({ xM: 0, side: 'right' });
  });
  it('C: preserves the quarter-span shear jump and exact piecewise-linear bending diagram', () => {
    const result = solve(force(1, 0, 0, -100), memberConfiguration(structuralBeamFixture()));
    expect(result.events.map((event) => event.xM)).toEqual([0, 1, 4]);
    expect(atMember(result, 1, 'left').shearN).toBeCloseTo(75, 9);
    expect(atMember(result, 1, 'right').shearN).toBeCloseTo(-25, 9);
    expect(atMember(result, 1).momentNm).toBeCloseTo(75, 9);
    expect(atMember(result, 2).momentNm).toBeCloseTo(50, 9);
    expect(atMember(result, 0, 'right').momentNm).toBeCloseTo(0, 9);
    expect(atMember(result, 4, 'left').momentNm).toBeCloseTo(0, 9);
    expect(result.extrema.momentNm.maximum.value).toBeCloseTo(75, 9);
    expect(result.extrema.shearN.absoluteMaximum.intervals).toEqual([{ startM: 0, endM: 1 }]);
  });
  it('D: locates the applied-couple moment jump', () => {
    const result = solve({
      name: 'Located couple',
      loads: [
        {
          kind: 'moment',
          linkId: 'AB',
          at: { frame: 'link', positionM: { x: 0.8, y: 0 } },
          momentNm: 12,
        },
      ],
    });
    expect(atMember(result, 0.8, 'left').momentNm).toBeCloseTo(12, 9);
    expect(atMember(result, 0.8, 'right').momentNm).toBeCloseTo(0, 9);
    expect(atMember(result, 0.4).shearN).toBeCloseTo(0, 9);
  });
  it('E/F: combines axial and transverse force with the off-axis transfer couple', () => {
    const result = solve(force(1, 0.4, 10, -20));
    const before = atMember(result, 1, 'left'),
      after = atMember(result, 1, 'right');
    expect(before.axialN).toBeCloseTo(10, 9);
    expect(before.shearN).toBeCloseTo(20, 9);
    expect(before.momentNm).toBeCloseTo(-4, 9);
    expect(after.axialN - before.axialN).toBeCloseTo(-10, 9);
    expect(after.shearN - before.shearN).toBeCloseTo(-20, 9);
    expect(after.momentNm - before.momentNm).toBeCloseTo(4, 9);
  });
  it('groups coincident axial, shear, and couple events without losing either limit', () => {
    const load = force(0.7, 0, 12, -17);
    const result = solve({
      ...load,
      loads: [
        ...load.loads,
        {
          kind: 'moment',
          linkId: 'AB',
          momentNm: 9,
          at: { frame: 'link', positionM: { x: 0.7, y: 0 } },
        },
      ],
    });
    expect(result.events.map((e) => e.xM)).toEqual([0, 0.7, 2]);
    expect(result.events[1].sources).toEqual(['load:0', 'couple:1']);
    const a = result.events[1].leftLimit,
      b = result.events[1].rightLimit;
    expect(b.axialN - a.axialN).toBeCloseTo(-12, 9);
    expect(b.shearN - a.shearN).toBeCloseTo(-17, 9);
    expect(b.momentNm - a.momentNm).toBeCloseTo(-9, 9);
  });
  it('G: distinguishes lumped-CoM gravity from distributed self-weight with identical S1 reactions', () => {
    const load = { ...noMemberLoad, gravityMPerS2: { x: 0, y: -9.80665 } };
    const lumped = solve(load, memberConfiguration(), { gravityModel: 'lumped-at-com' });
    const line = solve(load, memberConfiguration(), {
      gravityModel: 'uniform-line',
      massDistribution: uniformAB,
    });
    expect(lumped.gravityModel).toBe('lumped-at-com');
    expect(atMember(lumped, 1).momentNm).toBeCloseTo(0, 9);
    expect(atMember(line, 1).momentNm).toBeCloseTo(-4.903325, 9);
    expect(atMember(line, 1).shearN).toBeCloseTo(9.80665, 9);
    expect(line.events.map((e) => e.xM)).toEqual([0, 2]);
  });
  it('finds the interior extremum under distributed gravity without sampling a plot', () => {
    const c = memberConfiguration(structuralBeamFixture());
    const configuration = {
      ...c,
      bodies: c.bodies.map((b) =>
        b.id === 'AB'
          ? {
              ...b,
              massProperties: { massKg: 4, centerOfMassM: { x: 2, y: 0 }, inertiaKgM2: 16 / 3 },
            }
          : b
      ),
    };
    const result = solve({ ...noMemberLoad, gravityMPerS2: { x: 0, y: -10 } }, configuration, {
      gravityModel: 'uniform-line',
      massDistribution: uniformAB,
    });
    expect(result.extrema.momentNm.maximum.value).toBeCloseTo(20, 9);
    expect(result.extrema.momentNm.maximum.at[0].xM).toBeCloseTo(2, 9);
    expect(result.extrema.momentNm.maximum.at[0].side).toBe('right');
  });
  it('uses consistent link/global frames after world rotation and translation', () => {
    const c = memberConfiguration();
    const rotate = (p: { x: number; y: number }) => ({ x: 9 - p.y, y: -4 + p.x });
    const moved = {
      ...c,
      joints: c.joints.map((j) => ({ ...j, positionM: rotate(j.positionM) })),
      bodies: c.bodies.map((b) => ({
        ...b,
        massProperties: {
          ...b.massProperties!,
          centerOfMassM: rotate(b.massProperties!.centerOfMassM),
        },
      })),
    };
    const local = force(1, 0.4, 10, -20);
    const result = solve(local, moved);
    const global: LoadCase = {
      name: 'Same global load',
      loads: [
        {
          kind: 'point-force',
          linkId: 'AB',
          at: { frame: 'global', positionM: rotate({ x: 1, y: 0.4 }) },
          directionFrame: 'global',
          forceN: { x: 20, y: 10 },
        },
      ],
    };
    const other = solve(global, moved);
    expect(atMember(result, 0.3).momentNm).toBeCloseTo(atMember(other, 0.3).momentNm, 9);
    expect(atMember(result, 0.3).momentNm).toBeCloseTo(-18, 9);
  });
  it('defines the cut side by the explicitly selected member start, even when its axis is reversed', () => {
    const c = memberConfiguration();
    const load = force(2, 0, 50, -100),
      eq = analyzeStatic(c, load);
    const reverse = { ...memberAB, startJointId: 'B', endJointId: 'A' };
    const result = memberSuccess(recoverStaticMemberLoads(c, reverse, load, eq));
    verifyMemberCuts(c, load, eq, result);
    expect(atMember(result, 0.7).axialN).toBeCloseTo(50, 9);
    expect(atMember(result, 0.7).shearN).toBeCloseTo(100, 9);
    expect(atMember(result, 0.7).momentNm).toBeCloseTo(70, 9);
  });
  it('does not blur two distinct nearby interior load events', () => {
    const a = force(0.5, 0, 0, -10),
      b = force(0.50000001, 0, 0, -10);
    const result = solve({ name: 'Nearby loads', loads: [...a.loads, ...b.loads] });
    expect(result.events.map((e) => e.xM)).toEqual([0, 0.5, 0.50000001, 2]);
  });
  it('is immutable and repeatable for frozen inputs', () => {
    const c = memberConfiguration(),
      load = force(2, 0, 10, -10),
      eq = analyzeStatic(c, load);
    const freeze = (object: unknown): void => {
      if (object && typeof object === 'object') {
        Object.values(object).forEach(freeze);
        Object.freeze(object);
      }
    };
    freeze(c);
    freeze(load);
    freeze(eq);
    freeze(memberAB);
    const a = memberSuccess(recoverStaticMemberLoads(c, memberAB, load, eq));
    expect(recoverStaticMemberLoads(c, memberAB, load, eq)).toEqual(a);
    expect(a.member.startM).not.toBe(c.joints[0].positionM);
    verifyMemberCuts(c, load, eq, a);
  });
  for (const xM of [-1, 2.001, NaN, Infinity]) {
    it('refuses invalid stations ' + xM, () => {
      const result = solve(noMemberLoad);
      expect(evaluateMemberLoads(result, { xM, side: 'right' }).status).toBe('invalid-station');
    });
  }
  it('refuses an unlocated couple, while S1 still accepts it', () => {
    const c = memberConfiguration(),
      load: LoadCase = {
        name: 'Free couple',
        loads: [{ kind: 'moment', linkId: 'AB', momentNm: 4 }],
      };
    const eq = analyzeStatic(c, load);
    expect(eq.status).toBe('ok');
    expect(recoverStaticMemberLoads(c, memberAB, load, eq).status).toBe('ambiguous-member-mapping');
  });
  it('refuses out-of-span loads, stale reactions, unsuccessful S1, and unspecified gravity policy', () => {
    const c = memberConfiguration(),
      outside = force(3, 0, 0, -10);
    expect(recoverStaticMemberLoads(c, memberAB, outside, analyzeStatic(c, outside)).status).toBe(
      'load-not-on-supported-member'
    );
    expect(
      recoverStaticMemberLoads(c, memberAB, force(1, 0, 0, -10), analyzeStatic(c, noMemberLoad))
        .status
    ).toBe('invalid-equilibrium-result');
    const free = { ...c, drivers: [] };
    expect(
      recoverStaticMemberLoads(free, memberAB, noMemberLoad, analyzeStatic(free, noMemberLoad))
        .status
    ).toBe('upstream-analysis-failed');
    const gravity = { ...noMemberLoad, gravityMPerS2: { x: 0, y: -10 } };
    expect(recoverStaticMemberLoads(c, memberAB, gravity, analyzeStatic(c, gravity)).status).toBe(
      'missing-gravity-model'
    );
  });
  it('refuses incomplete reactions and ambiguous end-to-root mappings without numerical output', () => {
    const c = memberConfiguration(),
      eq = analyzeStatic(c, noMemberLoad);
    if (eq.status !== 'ok') throw new Error(eq.status);
    for (const broken of [
      { ...eq, jointReactions: [] },
      { ...eq, jointReactions: [...eq.jointReactions, ...eq.jointReactions] },
      { ...eq, driverReactions: [] },
    ]) {
      const result = recoverStaticMemberLoads(c, memberAB, noMemberLoad, broken);
      expect(result.status).toBe('invalid-equilibrium-result');
      expect('segments' in result).toBe(false);
    }
    for (const member of [
      { ...memberAB, bodyId: 'leaf' },
      { ...memberAB, endJointId: 'C' },
      { ...memberAB, endJointId: 'A' },
    ]) {
      expect(recoverStaticMemberLoads(c, member, noMemberLoad, eq).status).toBe(
        'ambiguous-member-mapping'
      );
    }
  });
  for (const memberGeometry of ['compound', 'multi-pin', 'non-beam'] as const) {
    it('refuses a root declared ' + memberGeometry, () => {
      const c = memberConfiguration();
      const configuration: StructuralConfiguration = {
        ...c,
        bodies: c.bodies.map((b) => ({ ...b, memberGeometry })),
      };
      const result = recoverStaticMemberLoads(
        configuration,
        memberAB,
        noMemberLoad,
        analyzeStatic(configuration, noMemberLoad)
      );
      expect(result.status).toBe(
        memberGeometry === 'compound' ? 'unsupported-compound' : 'unsupported-member-geometry'
      );
      expect('events' in result).toBe(false);
    });
  }
});
