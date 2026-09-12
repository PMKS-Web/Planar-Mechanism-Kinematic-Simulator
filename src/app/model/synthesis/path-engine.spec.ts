import { DEFAULT_PATH_SETTINGS, FourBarParameters, PathSynthesisRequest } from './path-types';
import {
  pathFourBarParameters,
  pathFourBarFixture,
} from '../../../test-utils/verification/path-fixtures';
import { buildMechanism } from '../../../test-utils/verification/fixture';
import { synthesizePath } from './path-synthesis';
import { mkdirSync, writeFileSync } from 'node:fs';
import { evaluateFourBar, fourBarPose, sweepClearance } from './four-bar';
import { preparePath, distance } from './path-target';
import { searchPathSync } from './path-engine';
import { pathMechanism, validatePathMechanism, validatePathResult } from './pmks-path-adapter';
import { PositionSolver } from '../mechanism/position-solver';
import { Mechanism } from '../mechanism/mechanism';
import { linearFit } from './linear-fit';
import { pathErrors } from './path-objective';

function targetRequest(p = pathFourBarParameters(), closed = true): PathSynthesisRequest {
  const evaluated = evaluateFourBar(p, 180, closed);
  if (!evaluated.valid) throw new Error(evaluated.reason);
  return {
    family: 'four-bar',
    target: { points: evaluated.poses.map((pose) => pose.P), closed, interpolation: 'polyline' },
    correspondence: { kind: 'equal-input-angle' },
    direction: p.direction,
    settings: { ...DEFAULT_PATH_SETTINGS, starts: 1, generations: 140, maxEvaluations: 14000 },
  };
}

describe('target preprocessing', () => {
  it('removes adjacent duplicates and a repeated seam, preserving crossings', () => {
    const r = preparePath(
      {
        points: [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
          { x: 2, y: 2 },
          { x: 0, y: 2 },
          { x: 0, y: 0 },
          { x: 2, y: 0 },
          { x: 0, y: 0 },
        ],
        closed: true,
        interpolation: 'polyline',
      },
      50
    );
    expect(r.valid).toBe(true);
    if (!r.valid) return;
    expect(r.path.removedDuplicates).toBe(2);
    expect(r.path.repeatedPoints).toBe(1);
    expect(r.path.samples).toHaveLength(50);
    expect(r.path.totalArcLength).toBeGreaterThan(8);
  });
  it('gives unevenly entered line points equal arc-length spacing', () => {
    const r = preparePath(
      {
        points: [
          { x: 0, y: 0 },
          { x: 0.001, y: 0 },
          { x: 10, y: 0 },
        ],
        closed: false,
        interpolation: 'polyline',
      },
      51
    );
    if (!r.valid) throw new Error(r.message);
    expect(r.path.samples[25].x).toBeCloseTo(5, 10);
    expect(r.path.centroid.x).toBeCloseTo(5, 10);
    expect(r.path.totalArcLength).toBe(10);
  });
  it('uses smooth interpolation and excludes the duplicate closed endpoint', () => {
    const target = targetRequest().target;
    const a = preparePath({ ...target, points: target.points.filter((_, i) => i % 15 === 0) }, 64);
    const b = preparePath(
      {
        ...target,
        points: target.points.filter((_, i) => i % 15 === 0),
        interpolation: 'catmull-rom',
      },
      64
    );
    if (!a.valid || !b.valid) throw new Error('preprocessing');
    expect(b.path.totalArcLength).toBeGreaterThan(a.path.totalArcLength);
    expect(distance(b.path.samples[0], b.path.samples[63])).toBeGreaterThan(0);
  });
  it('refuses too few, nonfinite, and unresolved targets', () => {
    const base = targetRequest().target;
    for (const [points, status] of [
      [
        [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
        'insufficient-points',
      ],
      [
        [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
          { x: 0, y: 0 },
        ],
        'degenerate-target',
      ],
      [
        [
          { x: 0, y: 0 },
          { x: 1e-15, y: 0 },
          { x: 0, y: 1e-15 },
        ],
        'degenerate-target',
      ],
      [
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: NaN, y: 1 },
        ],
        'invalid-settings',
      ],
    ] as const) {
      const r = preparePath({ ...base, points }, 64);
      expect(r.valid).toBe(false);
      if (!r.valid) expect(r.status).toBe(status);
    }
  });
});

describe('continuous physical four-bar evaluation', () => {
  it('holds one assembly for both directions and both roots through a whole revolution', () => {
    for (const assembly of [-1, 1] as const)
      for (const direction of ['clockwise', 'counterclockwise'] as const) {
        const p = { ...pathFourBarParameters(), assembly, direction };
        const r = evaluateFourBar(p, 720, true);
        if (!r.valid) throw new Error(r.reason);
        r.poses.forEach((pose, i) => {
          expect(distance(pose.B, pose.C)).toBeCloseTo(p.coupler, 9);
          expect(distance(p.D, pose.C)).toBeCloseTo(p.rocker, 9);
          expect(
            Math.sign(
              (p.D.x - pose.B.x) * (pose.C.y - pose.B.y) -
                (p.D.y - pose.B.y) * (pose.C.x - pose.B.x)
            )
          ).toBe(assembly);
          if (i) expect(distance(pose.C, r.poses[i - 1].C)).toBeLessThan(0.1);
        });
        const end = fourBarPose(p, p.theta0 + 2 * Math.PI);
        if (typeof end === 'string') throw new Error(end);
        expect(distance(end.P, r.poses[0].P)).toBeLessThan(1e-10);
      }
  });
  it('allows a non-Grashof partial sweep and rejects its full revolution', () => {
    const p = pathFourBarParameters(true);
    expect(evaluateFourBar(p, 64, false).valid).toBe(true);
    expect(evaluateFourBar({ ...p, sweep: 2 * Math.PI }, 64, true).valid).toBe(false);
  });
  it('rejects infeasible intervals even when their endpoints both assemble', () => {
    const p = { ...pathFourBarParameters(true), theta0: 0.8, sweep: 2 * Math.PI - 1.6 };
    expect(typeof fourBarPose(p, p.theta0)).toBe('object');
    expect(typeof fourBarPose(p, p.theta0 + p.sweep)).toBe('object');
    expect(sweepClearance(p)).toBeLessThan(0);
    expect(evaluateFourBar(p, 2, false).valid).toBe(false);
  });
  it('refuses impossible, singular, negative and nonfinite dimensions', () => {
    for (const change of [
      { crank: -1 },
      { rocker: 0 },
      { coupler: NaN },
      { rocker: 20 },
      { crank: 4, theta0: 0 },
      { coupler: 2.5, rocker: 2.5 },
    ]) {
      expect(evaluateFourBar({ ...pathFourBarParameters(), ...change }, 32, true).valid).toBe(
        false
      );
    }
  });
  it('keeps engineering errors separate and detects rank-deficient projection', () => {
    expect(pathErrors([{ x: 3, y: 4 }], [{ x: 0, y: 0 }], 10)).toEqual({
      pointErrors: [5],
      rms: 5,
      maximum: 5,
      normalizedRms: 0.5,
    });
    expect(
      linearFit(
        [
          [1, 1],
          [2, 2],
          [3, 3],
        ],
        [1, 2, 3]
      )
    ).toBeUndefined();
  });
});

describe('numerical four-bar synthesis', () => {
  it('fits a known path without supplying its dimensions or an initial mechanism', () => {
    const r = searchPathSync(targetRequest());
    if (process.env['PMKS_PATH_REPORT']) {
      mkdirSync('artifacts/path-backend', { recursive: true });
      writeFileSync('artifacts/path-backend/benchmark.json', JSON.stringify(r, null, 2));
    }
    expect(r.best).toBeDefined();
    expect(r.best!.errors.normalizedRms).toBeLessThan(0.035);
    expect(r.best!.penalty).toBe(0);
    expect(r.diagnostics.validEvaluations).toBeGreaterThan(100);
  }, 60000);
  it('is deterministic and preserves translated and scaled world geometry', () => {
    const request = targetRequest();
    request.settings = { ...request.settings, generations: 80 };
    const baseline = searchPathSync(request);
    const repeat = searchPathSync(request);
    expect(repeat.best).toEqual(baseline.best);
    expect(repeat.diagnostics.evaluations).toBe(baseline.diagnostics.evaluations);
    for (const [scale, tx, ty] of [
      [1, 400, -250],
      [200, 0, 0],
      [0.1, -2, 3],
    ]) {
      const transformed = searchPathSync({
        ...request,
        target: {
          ...request.target,
          points: request.target.points.map((p) => ({ x: p.x * scale + tx, y: p.y * scale + ty })),
        },
      });
      expect(transformed.best).toBeDefined();
      expect(transformed.best!.errors.normalizedRms).toBeCloseTo(
        baseline.best!.errors.normalizedRms,
        6
      );
      expect(transformed.best!.errors.rms).toBeCloseTo(baseline.best!.errors.rms * scale, 5);
      // Equivalent four-bars may exchange pivots under roundoff; compare the trajectory, not dimensions.
      transformed.best!.trajectory.forEach((point, i) => {
        const original = baseline.best!.trajectory[i];
        expect(
          distance(point, { x: original.x * scale + tx, y: original.y * scale + ty }) / scale
        ).toBeLessThan(1e-4);
      });
    }
  }, 60000);
  it('fits an open partial target and reversed input order', () => {
    const p = pathFourBarParameters(true);
    for (const source of [
      p,
      { ...p, theta0: p.theta0 + p.sweep, direction: 'clockwise' as const },
    ]) {
      const r = searchPathSync(targetRequest(source, false));
      expect(r.best).toBeDefined();
      expect(r.best!.errors.normalizedRms).toBeLessThan(0.035);
      expect(r.best!.parameters.direction).toBe(source.direction);
      expect(evaluateFourBar(r.best!.parameters, 720, false).valid).toBe(true);
    }
  }, 60000);
  it('fits a target generated by normal PMKS and verifies the returned mechanism', () => {
    const built = buildMechanism(pathFourBarFixture());
    const points = built.mechanism.joints.map((frame) => {
      const p = frame.find((j) => j.id === 'E')!;
      return { x: p.x, y: p.y };
    });
    const request = {
      ...targetRequest(),
      target: { points, closed: true, interpolation: 'polyline' as const },
    };
    const result = synthesizePath(request);
    expect(result.best).toBeDefined();
    expect(result.best!.production.status).toBe('passed');
    expect(result.best!.errors.normalizedRms).toBeLessThan(0.035);
    const entities = pathMechanism(result.best!.parameters);
    expect(entities.links).toHaveLength(3);
  }, 60000);
  it('reports bad bounds, exhausted budgets, cancellation and impossible bounds', () => {
    const req = targetRequest();
    expect(searchPathSync({ ...req, constraints: { linkLength: [-1, 2] } }).status).toBe(
      'invalid-settings'
    );
    expect(searchPathSync(req, { cancelled: () => true }).status).toBe('cancelled');
    const r = searchPathSync({
      ...req,
      settings: { ...req.settings, maxEvaluations: 10 },
      constraints: { groundLength: [1e-9, 1e-8], linkLength: [1e8, 1e9] },
    });
    expect(r.best).toBeUndefined();
    expect(r.diagnostics.evaluations).toBe(10);
    expect(r.status).toBe('no-feasible-mechanism');
  });
});

describe('normal PMKS conversion and verification', () => {
  const scaled = (partial = false): FourBarParameters => {
    const p = pathFourBarParameters(partial),
      s = 200;
    return {
      ...p,
      A: { x: p.A.x * s, y: p.A.y * s },
      D: { x: p.D.x * s, y: p.D.y * s },
      crank: p.crank * s,
      coupler: p.coupler * s,
      rocker: p.rocker * s,
      u: p.u * s,
      v: p.v * s,
    };
  };
  it('uses five ordinary points on three rigid links and one grounded driver', () => {
    const e = pathMechanism(scaled());
    expect(e.joints.filter((j) => j.ground)).toHaveLength(2);
    expect(e.joints.filter((j) => j.input)).toHaveLength(1);
    expect(e.tracer.links).toHaveLength(1);
    expect(e.tracer.links[0].joints).toHaveLength(3);
    expect(e.tracer.showCurve).toBe(true);
  });
  it('agrees with production stepping on both assemblies, directions, and a partial sweep', () => {
    for (const partial of [false, true])
      for (const assembly of [-1, 1] as const) {
        const p = { ...scaled(partial), assembly };
        const r = validatePathMechanism(p, 500);
        expect(r.status).toBe('passed');
        expect(r.playbackSamples).toBeGreaterThan(10);
        const reversed = { ...p, direction: 'clockwise' as const, theta0: p.theta0 + p.sweep };
        expect(validatePathMechanism(reversed, 500).status).toBe('passed');
      }
  }, 60000);
  it('rejects a disagreement in normal animation even if finer position stepping would pass', () => {
    const original = Mechanism.prototype.isMechanismValid;
    const spy = vi.spyOn(Mechanism.prototype, 'isMechanismValid').mockImplementation(function (
      this: Mechanism
    ) {
      this.joints[10][2].x += 20;
      return original.call(this);
    });
    try {
      const result = validatePathMechanism(scaled(), 500);
      expect(result.status).toBe('failed');
      expect(result.reason).toContain('Normal PMKS animation disagrees');
    } finally {
      spy.mockRestore();
    }
  });
  it('restores production static state after validation and refuses invalid adapters', () => {
    PositionSolver.jointMapPositions.set('sentinel', [123, 456]);
    const before = PositionSolver.jointMapPositions;
    validatePathMechanism(scaled(), 500);
    expect(PositionSolver.jointMapPositions).toBe(before);
    expect(PositionSolver.jointMapPositions.get('sentinel')).toEqual([123, 456]);
    expect(() => pathMechanism({ ...scaled(), crank: -1 })).toThrow();
    expect(() => pathMechanism(scaled(), ['A', 'A', 'B', 'C', 'D'])).toThrow();
  });
});
