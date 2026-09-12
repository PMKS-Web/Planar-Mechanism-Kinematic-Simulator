import { buildMechanism } from '../../../test-utils/verification/fixture';
import {
  structuralBeamFixture,
  structuralCrankFixture,
  structuralToggleFixture,
} from '../../../test-utils/verification/structural-fixtures';
import { LengthUnit } from '../unit-enums';
import type { StructuralConfiguration } from './configuration';
import type { BodyDynamicState } from './dynamic-state';
import type { LoadCase } from './loads';
import { snapshotPmksConfiguration } from './pmks-configuration';
import { analyzeDynamic } from './dynamic-force-solver';
import { analyzeStatic } from './static-force-solver';
import type { DynamicForceAnalysisResult } from './results';

const noLoad: LoadCase = { name: 'No applied load', loads: [] };
function configuration(fixture = structuralCrankFixture()): StructuralConfiguration {
  const built = buildMechanism(fixture);
  const result = snapshotPmksConfiguration({
    joints: built.joints,
    links: built.links,
    coordinateSpace: 'project',
    lengthUnit: LengthUnit.METER,
  });
  if (result.status !== 'ok') throw new Error(result.message);
  return result.configuration;
}
function state(linkId = 'AB', x = 0, y = 0, alpha = 0): BodyDynamicState {
  return { linkId, centerOfMassAccelerationMPerS2: { x, y }, angularAccelerationRadPerS2: alpha };
}
function success(result: DynamicForceAnalysisResult) {
  if (result.status !== 'ok') throw new Error(result.status + ': ' + result.diagnostics.message);
  expect(result.mode).toBe('dynamic');
  expect(result.diagnostics.normalizedResidual!).toBeLessThan(1e-10);
  return result;
}
function reaction(result: ReturnType<typeof success>, jointId: string, linkId: string) {
  return result.jointReactions.find((r) => r.jointId === jointId && r.linkId === linkId)!.forceN;
}
/** Independently reconstruct every free body from reported loads, pins, and driver couples. */
function balance(c: StructuralConfiguration, result: ReturnType<typeof success>) {
  for (const body of result.bodyEquilibrium) {
    let fx = body.knownAppliedForceN.x;
    let fy = body.knownAppliedForceN.y;
    let moment = body.knownAppliedMomentNm;
    for (const r of result.jointReactions.filter((r) => r.linkId === body.linkId)) {
      const p = c.joints.find((j) => j.id === r.jointId)!.positionM;
      fx += r.forceN.x;
      fy += r.forceN.y;
      moment +=
        (p.x - body.momentReferenceM.x) * r.forceN.y - (p.y - body.momentReferenceM.y) * r.forceN.x;
    }
    for (const r of result.driverReactions.filter((r) => r.linkId === body.linkId))
      moment += r.momentNm;
    expect(fx - body.inertialForceN.x).toBeCloseTo(0, 9);
    expect(fy - body.inertialForceN.y).toBeCloseTo(0, 9);
    expect(moment - body.inertialMomentNm).toBeCloseTo(0, 9);
    expect(body.forceResidualN.x).toBeCloseTo(0, 9);
    expect(body.forceResidualN.y).toBeCloseTo(0, 9);
    expect(body.momentResidualNm).toBeCloseTo(0, 9);
  }
}

describe('strict inverse dynamics', () => {
  it('A: balances a prescribed axial CoM acceleration with m ax = 6 N', () => {
    const c = configuration();
    const result = success(analyzeDynamic(c, [state('AB', 3)], noLoad));
    expect(reaction(result, 'A', 'AB').x).toBeCloseTo(6, 10);
    expect(reaction(result, 'A', 'AB').y).toBeCloseTo(0, 10);
    expect(result.driverReactions[0].momentNm).toBeCloseTo(0, 10);
    balance(c, result);
  });

  for (const gravity of [undefined, { x: 0, y: -9.80665 }, { x: 2, y: -3 }]) {
    it('B: separates vertical acceleration from gravity ' + JSON.stringify(gravity), () => {
      const c = configuration();
      const states = [state('AB', 0, 4)];
      const result = success(analyzeDynamic(c, states, { ...noLoad, gravityMPerS2: gravity }));
      expect(reaction(result, 'A', 'AB').x).toBeCloseTo(-2 * (gravity?.x ?? 0), 10);
      expect(reaction(result, 'A', 'AB').y).toBeCloseTo(8 - 2 * (gravity?.y ?? 0), 10);
      expect(result.driverReactions[0].momentNm).toBeCloseTo(8 - 2 * (gravity?.y ?? 0), 10);
      expect(result.bodyEquilibrium[0].inertialForceN).toEqual({ x: 0, y: 8 });
      expect(states[0]).toEqual(state('AB', 0, 4));
      balance(c, result);
    });
  }

  it('C: balances pure angular inertia with CoM at the grounded pivot: 3 * 4 = 12 Nm', () => {
    const fixture = structuralCrankFixture();
    fixture.links[0] = { ...fixture.links[0], com: [0, 0], moi: 3 };
    const c = configuration(fixture);
    const result = success(analyzeDynamic(c, [state('AB', 0, 0, 4)], noLoad));
    expect(result.driverReactions[0].momentNm).toBeCloseTo(12, 10);
    expect(Math.hypot(...Object.values(reaction(result, 'A', 'AB')))).toBeCloseTo(0, 10);
    balance(c, result);
  });

  it('D: eccentric crank includes centripetal, tangential, rotational, gravity, and applied loads', () => {
    const fixture = structuralCrankFixture();
    fixture.links[0] = { ...fixture.links[0], com: [1, 0.5], moi: 0.75 };
    const c = configuration(fixture);
    // omega=2, alpha=3: aG = alpha cross (1,.5) - omega^2 (1,.5) = (-5.5,1).
    const states = [state('AB', -5.5, 1, 3)];
    const free = success(analyzeDynamic(c, states, noLoad));
    expect(reaction(free, 'A', 'AB').x).toBeCloseTo(-11, 10);
    expect(reaction(free, 'A', 'AB').y).toBeCloseTo(2, 10);
    expect(free.driverReactions[0].momentNm).toBeCloseTo(9.75, 10);
    const loaded = success(
      analyzeDynamic(c, states, {
        name: 'Driven loaded crank',
        gravityMPerS2: { x: 0, y: -9.80665 },
        loads: [
          {
            kind: 'point-force',
            linkId: 'AB',
            at: { frame: 'link', positionM: { x: 2, y: 0 } },
            directionFrame: 'link',
            forceN: { x: 0, y: -100 },
          },
          { kind: 'moment', linkId: 'AB', momentNm: 7 },
        ],
      })
    );
    expect(loaded.driverReactions[0].momentNm).toBeCloseTo(222.3633, 9);
    expect(reaction(loaded, 'A', 'AB').y).toBeCloseTo(121.6133, 9);
    expect(loaded.bodyEquilibrium[0].knownAppliedMomentNm).toBeCloseTo(-212.6133, 9);
    expect(loaded.bodyEquilibrium[0].inertialMomentNm).toBeCloseTo(9.75, 10);
    balance(c, free);
    balance(c, loaded);
  });

  it('E: shares one binary-pin unknown and balances two massive bodies and the whole assembly', () => {
    const fixture = structuralBeamFixture();
    fixture.links = [
      { joints: 'AB', mass: 2, moi: 2 / 3, com: [2, 0] },
      { joints: 'BC', mass: 3, moi: 1, com: [4, 1.5] },
    ];
    const c = configuration(fixture);
    const result = success(
      analyzeDynamic(c, [state('BC', -2, 1, -2), state('AB', 3, 4, 5)], noLoad)
    );
    const a = reaction(result, 'A', 'AB');
    const b = reaction(result, 'B', 'AB');
    const opposite = reaction(result, 'B', 'BC');
    const end = reaction(result, 'C', 'BC');
    expect(b.x).toBeCloseTo(11 / 3, 10);
    expect(b.y).toBeCloseTo(29 / 6, 10);
    expect(opposite).toEqual({ x: -b.x, y: -b.y });
    expect(a.x).toBeCloseTo(7 / 3, 10);
    expect(a.y).toBeCloseTo(19 / 6, 10);
    expect(end.x).toBeCloseTo(-7 / 3, 10);
    expect(end.y).toBeCloseTo(47 / 6, 10);
    expect(a.x + end.x).toBeCloseTo(0, 10);
    expect(a.y + end.y).toBeCloseTo(11, 10);
    // External moment about A equals both translated inertial moments about A.
    expect(4 * end.y - 3 * end.x).toBeCloseTo(58 / 3 + 19, 10);
    balance(c, result);
  });

  for (const fixture of [structuralCrankFixture, structuralBeamFixture]) {
    it(
      'G: zero accelerations reproduce S1 reactions, torque, and residuals for ' + fixture.name,
      () => {
        const c = configuration(fixture());
        const load: LoadCase = {
          name: 'Static equivalence',
          gravityMPerS2: { x: 0, y: -9.80665 },
          loads: [{ kind: 'moment', linkId: 'AB', momentNm: -12 }],
        };
        const staticResult = analyzeStatic(c, load);
        const dynamic = success(
          analyzeDynamic(
            c,
            c.bodies.map((b) => state(b.id)),
            load
          )
        );
        if (staticResult.status !== 'ok') throw new Error(staticResult.status);
        expect(dynamic.jointReactions).toEqual(staticResult.jointReactions);
        expect(dynamic.driverReactions).toEqual(staticResult.driverReactions);
        expect(dynamic.diagnostics).toEqual(staticResult.diagnostics);
        balance(c, dynamic);
      }
    );
  }

  it('does not mutate frozen inputs and does not retain references in results', () => {
    const c = configuration();
    const states = [state('AB', -5, 2, 3)];
    const freeze = (value: unknown): void => {
      if (value && typeof value === 'object') {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
      }
    };
    freeze(c);
    freeze(states);
    freeze(noLoad);
    const result = success(analyzeDynamic(c, states, noLoad));
    expect(result.bodyEquilibrium[0].momentReferenceM).not.toBe(c.joints[0].positionM);
    expect(analyzeDynamic(c, states, noLoad)).toEqual(result);
  });

  for (const states of [
    [],
    [state('missing')],
    [state(), state()],
    [state('AB', NaN)],
    [state('AB', 0, Infinity)],
    [state('AB', 0, 0, NaN)],
    [state('AB', 0, 0, Infinity)],
    [null],
    undefined,
  ]) {
    it(
      'refuses missing, duplicate, mismatched or nonfinite accelerations ' + JSON.stringify(states),
      () => {
        const result = analyzeDynamic(
          configuration(),
          states as readonly BodyDynamicState[],
          noLoad
        );
        expect(result.status).toBe('invalid-dynamic-state');
        expect(result.mode).toBe('dynamic');
        expect('jointReactions' in result).toBe(false);
      }
    );
  }

  for (const properties of [
    undefined,
    { massKg: -1, inertiaKgM2: 1, centerOfMassM: { x: 1, y: 0 } },
    { massKg: 1, inertiaKgM2: -1, centerOfMassM: { x: 1, y: 0 } },
    { massKg: Infinity, inertiaKgM2: 1, centerOfMassM: { x: 1, y: 0 } },
    { massKg: 1, inertiaKgM2: NaN, centerOfMassM: { x: 1, y: 0 } },
    { massKg: 1, inertiaKgM2: 1, centerOfMassM: { x: NaN, y: 0 } },
  ]) {
    it(
      'refuses absent or invalid authoritative mass properties ' + JSON.stringify(properties),
      () => {
        const c = configuration();
        const invalid = {
          ...c,
          bodies: c.bodies.map((b) => ({ ...b, massProperties: properties })),
        };
        expect(analyzeDynamic(invalid, [state()], noLoad).status).toBe('invalid-properties');
      }
    );
  }

  for (const [massKg, inertiaKgM2] of [
    [0, 0],
    [2, 0],
    [0, 3],
  ]) {
    it('allows explicit idealized nonnegative mass and inertia ' + [massKg, inertiaKgM2], () => {
      const c = configuration();
      const ideal = {
        ...c,
        bodies: c.bodies.map((b) => ({
          ...b,
          massProperties: { massKg, inertiaKgM2, centerOfMassM: { x: 1, y: 0 } },
        })),
      };
      const result = success(analyzeDynamic(ideal, [state('AB', 2, 3, 4)], noLoad));
      expect(reaction(result, 'A', 'AB').y).toBeCloseTo(3 * massKg, 10);
      expect(result.driverReactions[0].momentNm).toBeCloseTo(3 * massKg + 4 * inertiaKgM2, 10);
    });
  }

  it('does not report overflow as a successful engineering result', () => {
    const c = configuration();
    expect(analyzeDynamic(c, [state('AB', Number.MAX_VALUE)], noLoad).status).toBe(
      'numerical-failure'
    );
  });

  it('refuses a full-rank but ill-conditioned pose before returning reactions', () => {
    const toggle = configuration(structuralToggleFixture());
    const near = {
      ...toggle,
      joints: toggle.joints.map((joint) => ({
        ...joint,
        positionM: { ...joint.positionM, y: joint.id === 'C' ? 1e-10 : 0 },
      })),
    };
    const result = analyzeDynamic(
      near,
      near.bodies.map((b) => state(b.id)),
      noLoad
    );
    expect(result.status).toBe('singular');
    expect(result.diagnostics.rank).toBe(9);
    expect(result.diagnostics.conditionNumber!).toBeGreaterThan(1e10);
    expect('jointReactions' in result).toBe(false);
  });

  it('retains strict rank and conditioning diagnostics without dynamic reaction splitting', () => {
    const crank = configuration();
    const free = { ...crank, drivers: [] };
    expect(analyzeDynamic(free, [state()], noLoad).status).toBe('underconstrained');
    expect(analyzeDynamic(free, [state('AB', 0, 1)], noLoad).status).toBe('inconsistent');
    const redundant = { ...crank, joints: crank.joints.map((j) => ({ ...j, grounded: true })) };
    expect(analyzeDynamic(redundant, [state()], noLoad).status).toBe('statically-indeterminate');
    const toggle = configuration(structuralToggleFixture());
    const result = analyzeDynamic(
      toggle,
      toggle.bodies.map((b) => state(b.id)),
      noLoad
    );
    expect(result.status).toBe('singular');
    expect(result.diagnostics.reactionRedundancy).toBeGreaterThan(0);
    expect('jointReactions' in result).toBe(false);
  });
});
