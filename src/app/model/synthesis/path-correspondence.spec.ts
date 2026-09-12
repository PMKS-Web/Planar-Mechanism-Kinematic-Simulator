import { orderedTiming, refineTiming, timingDiagnostics } from './path-correspondence';
import { pathFourBarParameters } from '../../../test-utils/verification/path-fixtures';
import {
  transformPathParameters,
  PATH_BENCHMARK_FIXTURES,
} from '../../../test-utils/verification/path-benchmark-fixtures';
import { evaluateFourBar } from './four-bar';
import { preparePath } from './path-target';
import { fitFourBar } from './path-objective';
import { searchPath, searchPathSync } from './path-engine';
import { DEFAULT_PATH_SETTINGS, PathSynthesisRequest } from './path-types';
import { rankCandidates } from './path-candidates';
import { validatePathResult } from './pmks-path-adapter';
import { Mechanism } from '../mechanism/mechanism';

const request = (): PathSynthesisRequest => {
  const curve = evaluateFourBar(pathFourBarParameters(), 360, true);
  if (!curve.valid) throw new Error(curve.reason);
  return {
    family: 'four-bar',
    target: { points: curve.poses.map((p) => p.P), closed: true, interpolation: 'polyline' },
    direction: 'counterclockwise',
    correspondence: { kind: 'monotone-free-timing' },
    settings: { ...DEFAULT_PATH_SETTINGS, starts: 1, generations: 60, maxEvaluations: 6500 },
  };
};

describe('strict monotone correspondence', () => {
  it('matches exhaustive ordered assignment on a small reversal-prone example', () => {
    const target = [0, 0.85, 0.2, 1].map((x) => ({ x, y: 0 }));
    const curve = Array.from({ length: 9 }, (_, i) => ({ x: i / 8, y: 0 }));
    const got = orderedTiming(target, curve, false);
    let minimum = Infinity;
    for (let a = 1; a < 7; a++)
      for (let b = a + 1; b < 8; b++) {
        minimum = Math.min(minimum, (a / 8 - 0.85) ** 2 + (b / 8 - 0.2) ** 2);
      }
    expect((got[1] - 0.85) ** 2 + (got[2] - 0.2) ** 2).toBeCloseTo(minimum, 12);
    expect(got[2]).toBeGreaterThan(got[1]);
    expect(() => orderedTiming(target, [{ x: NaN, y: 0 }], false)).toThrow();
  });
  for (const id of ['near-toggle', 'non-grashof', 'non-grashof-cw', 'clockwise'])
    it(`retains feasible fixed-branch free timing for ${id}`, () => {
      const fixture = PATH_BENCHMARK_FIXTURES.find((f) => f.id === id)!,
        p = fixture.parameters;
      const curve = evaluateFourBar(p, 360, fixture.closed);
      if (!curve.valid) throw new Error(curve.reason);
      const prepared = preparePath(
        {
          points: curve.poses.map((pose) => pose.P),
          closed: fixture.closed,
          interpolation: 'polyline',
        },
        64
      );
      if (!prepared.valid) throw new Error(prepared.message);
      const g = Math.hypot(p.D.x - p.A.x, p.D.y - p.A.y);
      const trial = fitFourBar(
        [Math.log(p.crank / g), Math.log(p.coupler / g), Math.log(p.rocker / g), p.theta0, p.sweep],
        p.assembly,
        p.direction,
        prepared.path,
        {},
        'monotone-free-timing'
      );
      if (!('candidate' in trial)) throw new Error(trial.reason);
      expect(trial.candidate.correspondence?.monotone).toBe(true);
      expect(trial.candidate.parameters.assembly).toBe(p.assembly);
      const sign = p.direction === 'clockwise' ? -1 : 1;
      expect(
        trial.candidate.angles
          .slice(1)
          .every((angle, i) => sign * (angle - trial.candidate.angles[i]) > 0)
      ).toBe(true);
    });
  it('rejects corrupted production playback even when free timing reports low geometric error', () => {
    const r = searchPathSync({
      ...request(),
      settings: { ...DEFAULT_PATH_SETTINGS, starts: 1, generations: 1, maxEvaluations: 100 },
    });
    const original = Mechanism.prototype.isMechanismValid;
    const spy = vi.spyOn(Mechanism.prototype, 'isMechanismValid').mockImplementation(function (
      this: Mechanism
    ) {
      this.joints[10][2].x += 20;
      return original.call(this);
    });
    try {
      const verified = validatePathResult(r);
      expect(verified.best).toBeUndefined();
      expect(verified.rankedCandidates).toEqual([]);
      expect(verified.rejectedFinalists!.length).toBeGreaterThan(0);
    } finally {
      spy.mockRestore();
    }
  });
  it('finds ordered nonuniform open timing with fixed endpoints deterministically', () => {
    const target = Array.from({ length: 12 }, (_, i) => ({ x: (i / 11) ** 1.5, y: 0 }));
    const trajectory = Array.from({ length: 89 }, (_, i) => ({ x: i / 88, y: 0 }));
    const p = orderedTiming(target, trajectory, false);
    expect(p).toEqual(orderedTiming(target, trajectory, false));
    const r = refineTiming(target, p, false, (t) => ({ x: t, y: 0 }));
    expect(r[0]).toBe(0);
    expect(r.at(-1)).toBe(1);
    expect(Math.max(...r.map((v, i) => Math.abs(v - target[i].x)))).toBeLessThan(0.001);
  });
  it('cannot reverse or collapse correspondence even for repeated closest points', () => {
    const target = Array.from({ length: 16 }, () => ({ x: 0.5, y: 0 }));
    const trajectory = Array.from({ length: 129 }, (_, i) => ({ x: i / 128, y: 0 }));
    const r = refineTiming(target, orderedTiming(target, trajectory, true), true, (t) => ({
      x: t,
      y: 0,
    }));
    const d = timingDiagnostics(
      pathFourBarParameters(),
      r,
      true,
      'monotone-free-timing',
      0,
      129,
      1
    );
    expect(d.monotone).toBe(true);
    expect(d.minDelta).toBeGreaterThanOrEqual(0.05 * d.meanDelta - 1e-10);
    expect(d.maxDelta).toBeLessThanOrEqual(8 * d.meanDelta + 1e-10);
  });
  it('handles the closed seam without a duplicate target endpoint and supports CW', () => {
    const curve = (t: number) => ({ x: Math.cos(2 * Math.PI * t), y: Math.sin(2 * Math.PI * t) });
    const target = Array.from({ length: 32 }, (_, i) => curve(i / 32));
    const r = orderedTiming(
      target,
      Array.from({ length: 257 }, (_, i) => curve(i / 256)),
      true
    );
    expect(r).toEqual(Array.from({ length: 32 }, (_, i) => i / 32));
    for (const direction of ['clockwise', 'counterclockwise'] as const) {
      const d = timingDiagnostics(
        { ...pathFourBarParameters(), theta0: 6.2, direction },
        r,
        true,
        'monotone-free-timing',
        0,
        257,
        1
      );
      expect(d.monotone).toBe(true);
      expect(Math.sign(d.inputEnd - d.inputStart)).toBe(direction === 'clockwise' ? -1 : 1);
    }
  });
  it('keeps a clear baseline and improves a known four-bar without exposing its dimensions', () => {
    const r = request(),
      equal = searchPathSync({ ...r, correspondence: { kind: 'equal-input-angle' } }),
      free = searchPathSync(r);
    expect(equal.best!.correspondence!.mode).toBe('equal-input-angle');
    expect(free.best!.errors.normalizedRms).toBeLessThan(equal.best!.errors.normalizedRms * 0.6);
    expect(free.best!.correspondence!.monotone).toBe(true);
    expect(free.best!.production.status).toBe('unchecked');
    expect(free.best).toEqual(searchPathSync(r).best);
    const verified = validatePathResult(free);
    expect(verified.best?.production.status).toBe('passed');
    expect(verified.rankedCandidates!.every((c) => c.production.status === 'passed')).toBe(true);
  }, 120000);
  it('fits transformed targets equivalently for fixed nonlinear geometry', () => {
    const p = pathFourBarParameters(),
      vector = [Math.log(p.crank / 4), Math.log(p.coupler / 4), Math.log(p.rocker / 4), p.theta0];
    const errors: number[] = [],
      worldErrors: number[] = [];
    for (const q of [p, transformPathParameters(p, 3, 1.1, 9, -7)]) {
      const curve = evaluateFourBar(q, 360, true);
      if (!curve.valid) throw new Error(curve.reason);
      const target = preparePath(
        { points: curve.poses.map((x) => x.P), closed: true, interpolation: 'polyline' },
        64
      );
      if (!target.valid) throw new Error(target.message);
      const trial = fitFourBar(
        vector,
        1,
        'counterclockwise',
        target.path,
        {},
        'monotone-free-timing'
      );
      if (!('candidate' in trial)) throw new Error(trial.reason);
      errors.push(trial.candidate.errors.normalizedRms);
      worldErrors.push(trial.candidate.errors.rms);
    }
    // The existing axis-aligned bounding-box diagonal changes slightly under rotation.
    expect(worldErrors[0] * 3).toBeCloseTo(worldErrors[1], 8);
    expect(Math.abs(errors[0] / errors[1] - 1)).toBeLessThan(0.05);
  });
  it('yields and cancels within free-timing search without exposing an insertable result', () => {
    let stopped = false;
    const run = searchPath(request(), { cancelled: () => stopped });
    expect(run.next().done).toBe(false);
    stopped = true;
    const step = run.next();
    expect(step.done).toBe(true);
    if (step.done) {
      expect(step.value.status).toBe('cancelled');
      expect(step.value.rankedCandidates).toBeUndefined();
    }
  });
  it('ranks verified candidates and removes geometric duplicates without changing RMS', () => {
    const result = searchPathSync({
      ...request(),
      settings: { ...DEFAULT_PATH_SETTINGS, starts: 1, generations: 1, maxEvaluations: 100 },
    });
    const a = result.best!;
    expect(a).toBeDefined();
    a.production = { status: 'passed', samples: 10 };
    const b = structuredClone(a);
    b.errors.normalizedRms += 0.01;
    const rejected = structuredClone(a);
    rejected.production = { status: 'failed', samples: 0, reason: 'corrupted trajectory' };
    const ranked = rankCandidates([b, rejected, a], result.target!);
    expect(ranked.ranked).toEqual([a]);
    expect(ranked.duplicates).toEqual([b]);
    expect(ranked.rejected).toEqual([rejected]);
    expect(a.compactness!.groundRatio).toBeGreaterThan(0);
  });
});
