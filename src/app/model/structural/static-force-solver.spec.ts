import { buildMechanism } from '../../../test-utils/verification/fixture';
import {
  structuralBeamFixture,
  structuralCrankFixture,
  structuralToggleFixture,
} from '../../../test-utils/verification/structural-fixtures';
import { LengthUnit } from '../unit-enums';
import { snapshotPmksConfiguration } from './pmks-configuration';
import { analyzeStatic } from './static-force-solver';
import type { StructuralConfiguration } from './configuration';
import type { LoadCase, Vector2 } from './loads';
import type { StaticForceAnalysisResult } from './results';

const noLoad: LoadCase = { name: 'Unloaded', loads: [] };
const tipLoad: LoadCase = {
  name: 'Tip load',
  loads: [
    {
      kind: 'point-force',
      linkId: 'AB',
      at: { frame: 'link', positionM: { x: 2, y: 0 } },
      directionFrame: 'global',
      forceN: { x: 0, y: -100 },
    },
  ],
};
function snapshot(fixture = structuralCrankFixture()): StructuralConfiguration {
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
function success(result: StaticForceAnalysisResult) {
  if (result.status !== 'ok') throw new Error(result.status + ': ' + result.diagnostics.message);
  expect(result.diagnostics.normalizedResidual!).toBeLessThan(1e-10);
  for (const link of result.linkEquilibrium) {
    expect(Math.hypot(link.forceResidualN.x, link.forceResidualN.y)).toBeLessThan(1e-9);
    expect(Math.abs(link.momentResidualNm)).toBeLessThan(1e-9);
  }
  return result;
}
function reaction(result: ReturnType<typeof success>, jointId: string, linkId: string): Vector2 {
  return result.jointReactions.find((r) => r.jointId === jointId && r.linkId === linkId)!.forceN;
}

describe('strict static equilibrium', () => {
  it('balances a simply supported equivalent beam with reactions 75 N and 25 N', () => {
    const loadCase: LoadCase = {
      name: 'Quarter-span load',
      loads: [
        {
          kind: 'point-force',
          linkId: 'AB',
          directionFrame: 'global',
          at: { frame: 'global', positionM: { x: 1, y: 0 } },
          forceN: { x: 0, y: -100 },
        },
      ],
    };
    const result = success(analyzeStatic(snapshot(structuralBeamFixture()), loadCase));
    expect(reaction(result, 'A', 'AB').x).toBeCloseTo(0, 10);
    expect(reaction(result, 'A', 'AB').y).toBeCloseTo(75, 10);
    expect(reaction(result, 'B', 'AB').y).toBeCloseTo(25, 10);
    expect(reaction(result, 'C', 'BC').y).toBeCloseTo(25, 10);
    expect(result.diagnostics.equationCount).toBe(6);
    expect(result.diagnostics.unknownCount).toBe(6);
    expect(result.diagnostics.rank).toBe(6);
    expect(reaction(result, 'A', 'AB').y + reaction(result, 'C', 'BC').y - 100).toBeCloseTo(0, 10);
    expect(4 * reaction(result, 'C', 'BC').y - 100).toBeCloseTo(0, 10);
  });

  it('returns horizontal and vertical reactions and the proper off-axis moment arm', () => {
    const result = success(
      analyzeStatic(snapshot(), {
        name: 'Off-axis',
        loads: [
          {
            kind: 'point-force',
            linkId: 'AB',
            directionFrame: 'global',
            at: { frame: 'global', positionM: { x: 1.5, y: 0.5 } },
            forceN: { x: 30, y: -40 },
          },
        ],
      })
    );
    expect(reaction(result, 'A', 'AB').x).toBeCloseTo(-30, 10);
    expect(reaction(result, 'A', 'AB').y).toBeCloseTo(40, 10);
    expect(result.driverReactions[0].momentNm).toBeCloseTo(75, 10);
  });

  it('solves an applied couple directly with no spurious forces', () => {
    const result = success(
      analyzeStatic(snapshot(), {
        name: 'Couple',
        loads: [{ kind: 'moment', linkId: 'AB', momentNm: 12.4 }],
      })
    );
    expect(result.driverReactions[0].momentNm).toBeCloseTo(-12.4, 10);
    expect(reaction(result, 'A', 'AB').x).toBeCloseTo(0, 10);
    expect(reaction(result, 'A', 'AB').y).toBeCloseTo(0, 10);
  });

  it('enforces exact opposite internal pin forces on the two body sides', () => {
    const result = success(analyzeStatic(snapshot(structuralBeamFixture()), tipLoad));
    const a = reaction(result, 'B', 'AB');
    const b = reaction(result, 'B', 'BC');
    expect(a.x + b.x).toBe(0);
    expect(a.y + b.y).toBe(0);
    expect(a.y).toBeCloseTo(50, 10);
  });

  it('uses mass and the solved center of mass for gravity', () => {
    const result = success(
      analyzeStatic(snapshot(), {
        name: 'Weight',
        loads: [],
        gravityMPerS2: { x: 0, y: -9.80665 },
      })
    );
    expect(reaction(result, 'A', 'AB').y).toBeCloseTo(19.6133, 10);
    expect(result.driverReactions[0].momentNm).toBeCloseTo(19.6133, 10);
  });

  it('combines multiple forces, gravity, and couples by superposition', () => {
    const result = success(
      analyzeStatic(snapshot(), {
        ...tipLoad,
        gravityMPerS2: { x: 0, y: -10 },
        loads: [...tipLoad.loads, { kind: 'moment', linkId: 'AB', momentNm: 7 }],
      })
    );
    expect(reaction(result, 'A', 'AB').y).toBeCloseTo(120, 10);
    expect(result.driverReactions[0].momentNm).toBeCloseTo(213, 10);
  });

  it('transforms a local application point and follower direction at a rotated pose', () => {
    const base = snapshot();
    const rotated = {
      ...base,
      joints: base.joints.map((j) => ({
        ...j,
        positionM: { x: 10 - j.positionM.y, y: -5 + j.positionM.x },
      })),
    };
    const result = success(
      analyzeStatic(rotated, {
        name: 'Follower',
        loads: [{ ...tipLoad.loads[0], directionFrame: 'link' } as (typeof tipLoad.loads)[0]],
      })
    );
    expect(reaction(result, 'A', 'AB').x).toBeCloseTo(-100, 10);
    expect(reaction(result, 'A', 'AB').y).toBeCloseTo(0, 10);
    expect(result.driverReactions[0].momentNm).toBeCloseTo(200, 10);
  });

  it('is invariant to world translation and does not mutate inputs across load cases', () => {
    const base = snapshot();
    const moved = {
      ...base,
      joints: base.joints.map((j) => ({
        ...j,
        positionM: { x: j.positionM.x + 1e6, y: j.positionM.y - 1e6 },
      })),
    };
    const before = JSON.stringify(moved);
    const first = success(analyzeStatic(moved, tipLoad));
    success(analyzeStatic(moved, noLoad));
    const repeated = success(analyzeStatic(moved, tipLoad));
    expect(first).toEqual(repeated);
    expect(JSON.stringify(moved)).toBe(before);
    expect(first.driverReactions[0].momentNm).toBeCloseTo(200, 8);
  });

  it('is independent of body and joint enumeration order', () => {
    const base = snapshot(structuralBeamFixture());
    const result = success(
      analyzeStatic(
        {
          ...base,
          bodies: [...base.bodies].reverse(),
          joints: [...base.joints].reverse(),
        },
        tipLoad
      )
    );
    expect(reaction(result, 'A', 'AB').y).toBeCloseTo(50, 10);
    expect(reaction(result, 'B', 'AB').y).toBeCloseTo(50, 10);
  });

  it('reports an unheld crank as underconstrained even with a zero load', () => {
    const result = analyzeStatic({ ...snapshot(), drivers: [] }, noLoad);
    expect(result.status).toBe('underconstrained');
    expect(result.diagnostics.equilibriumDeficiency).toBe(1);
    expect('jointReactions' in result).toBe(false);
  });

  it('reports incompatible transverse loading on an unheld crank', () => {
    const result = analyzeStatic({ ...snapshot(), drivers: [] }, tipLoad);
    expect(result.status).toBe('inconsistent');
    expect(result.diagnostics.normalizedResidual!).toBeGreaterThan(0.1);
    expect('jointReactions' in result).toBe(false);
  });

  it('does not invent a split between redundant ground supports', () => {
    const base = snapshot();
    const result = analyzeStatic(
      {
        ...base,
        drivers: [],
        joints: base.joints.map((j) => ({ ...j, grounded: true })),
      },
      noLoad
    );
    expect(result.status).toBe('statically-indeterminate');
    expect(result.diagnostics.reactionRedundancy).toBe(1);
    expect('jointReactions' in result).toBe(false);
  });

  it('reports a collinear four-bar as singular with rank and both deficiencies', () => {
    const result = analyzeStatic(snapshot(structuralToggleFixture()), noLoad);
    expect(result.status).toBe('singular');
    expect(result.diagnostics.rank!).toBeLessThan(9);
    expect(result.diagnostics.equilibriumDeficiency!).toBeGreaterThan(0);
    expect(result.diagnostics.reactionRedundancy!).toBeGreaterThan(0);
  });

  it('refuses a missing target, nonfinite load, and unsupported load type', () => {
    expect(
      analyzeStatic(snapshot(), {
        name: 'Missing',
        loads: [{ kind: 'moment', linkId: 'gone', momentNm: 1 }],
      }).status
    ).toBe('invalid-load');
    expect(
      analyzeStatic(snapshot(), {
        name: 'NaN',
        loads: [{ kind: 'moment', linkId: 'AB', momentNm: NaN }],
      }).status
    ).toBe('invalid-load');
    expect(
      analyzeStatic(snapshot(), {
        name: 'Future',
        loads: [{ kind: 'distributed', linkId: 'AB' }],
      } as unknown as LoadCase).status
    ).toBe('invalid-load');
  });

  it('refuses invalid geometry, duplicate ids, and unknown joint kinds', () => {
    const base = snapshot();
    expect(
      analyzeStatic({ ...base, joints: [base.joints[0], base.joints[0]] }, noLoad).status
    ).toBe('invalid-geometry');
    expect(
      analyzeStatic(
        {
          ...base,
          joints: base.joints.map((j) => ({
            ...j,
            positionM: { x: 0, y: 0 },
          })),
        },
        noLoad
      ).status
    ).toBe('invalid-geometry');
    expect(
      analyzeStatic(
        {
          ...base,
          joints: base.joints.map((j) => ({
            ...j,
            kind: 'prismatic',
          })),
        } as unknown as StructuralConfiguration,
        noLoad
      ).status
    ).toBe('unsupported-joint-type');
  });

  it('requires explicit mass for gravity but not for point-force statics', () => {
    const base = snapshot();
    const withoutMass = {
      ...base,
      bodies: base.bodies.map((body) => ({ ...body, massProperties: undefined })),
    };
    success(analyzeStatic(withoutMass, tipLoad));
    expect(analyzeStatic(withoutMass, { ...noLoad, gravityMPerS2: { x: 0, y: -10 } }).status).toBe(
      'invalid-properties'
    );
  });

  it('reports overflowing loads without plausible-looking output', () => {
    const result = analyzeStatic(snapshot(), {
      name: 'Overflow',
      loads: [
        { kind: 'moment', linkId: 'AB', momentNm: 1e308 },
        { kind: 'moment', linkId: 'AB', momentNm: 1e308 },
        { kind: 'moment', linkId: 'AB', momentNm: 1e308 },
        { kind: 'moment', linkId: 'AB', momentNm: 1e308 },
      ],
    });
    expect(result.status).toBe('numerical-failure');
    expect('jointReactions' in result).toBe(false);
  });
});
