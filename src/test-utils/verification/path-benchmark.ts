// Enter PMKS through joint.ts before the mutually dependent mechanism classes.
import '../../app/model/joint';
import { Mechanism } from '../../app/model/mechanism/mechanism';
import { pathMechanism, validatePathMechanism } from '../../app/model/synthesis/pmks-path-adapter';
import { PathBenchmarkFixture, transformPathParameters } from './path-benchmark-fixtures';
import {
  CorrespondenceMode,
  DEFAULT_PATH_SETTINGS,
  PathPoint,
  PathSynthesisRequest,
  PathSynthesisResult,
} from '../../app/model/synthesis/path-types';
import { synthesizePath } from '../../app/model/synthesis/path-synthesis';
import { preparePath, distance } from '../../app/model/synthesis/path-target';

export const BENCHMARK_SETTINGS = {
  ...DEFAULT_PATH_SETTINGS,
  starts: 1,
  generations: 90,
  maxEvaluations: 16000,
};

/** These settings and the target are all the optimizer sees. No generating dimensions or angles. */
export function productionReference(fixture: PathBenchmarkFixture) {
  const p = transformPathParameters(fixture.parameters, 200);
  const check = validatePathMechanism(
    p,
    Math.max(p.crank, p.coupler, p.rocker, distance(p.A, p.D))
  );
  if (check.status !== 'passed')
    throw new Error(`${fixture.id}: source verification: ${check.reason}`);
  const entities = pathMechanism(p);
  const mechanism = new Mechanism(
    entities.joints,
    entities.links,
    [],
    [],
    false,
    'cm',
    p.direction === 'clockwise' ? -1 : 1
  );
  if (!mechanism.isMechanismValid()) throw new Error(`${fixture.id}: invalid source`);
  const points: PathPoint[] = [],
    angles: number[] = [];
  let prior = p.theta0,
    progress = 0;
  for (const frame of mechanism.joints) {
    const theta = Math.atan2(frame[1].y - frame[0].y, frame[1].x - frame[0].x);
    const delta = Math.atan2(Math.sin(theta - prior), Math.cos(theta - prior));
    const next = progress + delta * (p.direction === 'clockwise' ? -1 : 1);
    if (next < progress - 1e-6) break;
    if (next >= p.sweep - 1e-8) {
      if (!fixture.closed && points.length) {
        const f = (p.sweep - progress) / (next - progress);
        const last = points.at(-1)!;
        points.push({
          x: last.x + f * (frame[4].x - last.x),
          y: last.y + f * (frame[4].y - last.y),
        });
        angles.push(p.sweep);
      }
      progress = next;
      break;
    }
    points.push({ x: frame[4].x, y: frame[4].y });
    angles.push(next);
    progress = next;
    prior = theta;
  }
  if (progress < p.sweep - 1e-5 || points.length < 3)
    throw new Error(`${fixture.id}: source did not cover requested sweep (${progress}/${p.sweep})`);
  const target = { points, closed: fixture.closed, interpolation: 'polyline' as const };
  // The oracle follows exactly the same polyline arc length as preparePath, including the seam.
  const ends = fixture.closed ? [...points, points[0]] : points;
  const unwrapped = fixture.closed ? [...angles, p.sweep] : angles;
  const lengths = [0];
  for (let i = 1; i < ends.length; i++)
    lengths.push(lengths.at(-1)! + distance(ends[i - 1], ends[i]));
  const total = lengths.at(-1)!;
  const oracle = Array.from({ length: BENCHMARK_SETTINGS.sampleCount }, (_, i) => {
    const at =
      (total * i) /
      (fixture.closed ? BENCHMARK_SETTINGS.sampleCount : BENCHMARK_SETTINGS.sampleCount - 1);
    let j = 1;
    while (j < lengths.length - 1 && lengths[j] < at) j++;
    const f = (at - lengths[j - 1]) / (lengths[j] - lengths[j - 1]);
    return (unwrapped[j - 1] + f * (unwrapped[j] - unwrapped[j - 1])) / p.sweep;
  });
  return {
    target,
    oracle,
    sourceValidation: check,
    sourceSamples: points.length,
    requestedSweep: p.sweep,
  };
}

export function benchmarkRequest(
  reference: ReturnType<typeof productionReference>,
  mode: CorrespondenceMode
): PathSynthesisRequest {
  return {
    family: 'four-bar',
    target: reference.target,
    correspondence: { kind: mode },
    direction: 'either',
    settings: { ...BENCHMARK_SETTINGS },
  };
}

export function benchmarkMeasurement(
  result: PathSynthesisResult,
  oracle: readonly number[],
  wallMs: number
) {
  const best = result.best,
    p = best?.parameters;
  const timingRms =
    best && p
      ? Math.sqrt(
          best.angles.reduce(
            (sum, a, i) =>
              sum +
              ((a - p.theta0) / (p.direction === 'clockwise' ? -p.sweep : p.sweep) - oracle[i]) **
                2,
            0
          ) / oracle.length
        )
      : null;
  return {
    status: result.status,
    success: !!best && best.errors.normalizedRms <= result.acceptableNormalizedRms,
    verified: best?.production.status === 'passed',
    normalizedRms: best?.errors.normalizedRms ?? null,
    rms: best?.errors.rms ?? null,
    maximum: best?.errors.maximum ?? null,
    evaluations: result.diagnostics.evaluations,
    runtimeMs: wallMs,
    meanObjectiveMs: (result.diagnostics.objectiveMs ?? 0) / result.diagnostics.evaluations,
    meanCorrespondenceMs:
      (result.diagnostics.correspondenceMs ?? 0) / result.diagnostics.evaluations,
    maxObjectiveMs: result.diagnostics.maxObjectiveMs,
    production: best?.production ?? null,
    compactness: best?.compactness ?? null,
    fittedSweep: p?.sweep ?? null,
    correspondence: best?.correspondence ?? null,
    oracleProgressRms: timingRms,
    parameters: p ?? null,
    rankedCandidates: result.rankedCandidates?.length ?? 0,
    rejectedFinalists: result.rejectedFinalists?.map((c) => c.production.reason) ?? [],
    duplicateFinalists: result.duplicateFinalists?.length ?? 0,
    rejectionReason: best ? null : result.diagnostics.messages.join(' '),
  };
}

export function runBenchmarkMode(
  reference: ReturnType<typeof productionReference>,
  mode: CorrespondenceMode
) {
  const start = performance.now();
  const result = synthesizePath(benchmarkRequest(reference, mode));
  return benchmarkMeasurement(result, reference.oracle, performance.now() - start);
}

export function oracleError(reference: ReturnType<typeof productionReference>) {
  const prepared = preparePath(reference.target, BENCHMARK_SETTINGS.sampleCount);
  if (!prepared.valid) throw new Error(prepared.message);
  return { dimension: prepared.path.dimension, progress: reference.oracle };
}

export type BenchmarkMeasurement = ReturnType<typeof benchmarkMeasurement>;
export interface PathBenchmarkRow {
  id: string;
  description: string;
  categories: string[];
  transformOf?: string;
  sourceSamples: number;
  requestedSweep: number;
  sourceValidation: ReturnType<typeof validatePathMechanism>;
  oracle: ReturnType<typeof oracleError>;
  equal: BenchmarkMeasurement;
  free: BenchmarkMeasurement;
}

export function aggregateBenchmarks(rows: readonly PathBenchmarkRow[], mode: 'equal' | 'free') {
  const results = rows.map((r) => r[mode]),
    errors = results.flatMap((r) => (r.normalizedRms === null ? [] : [r.normalizedRms]));
  const quantile = (v: number[], q: number) => {
    const sorted = [...v].sort((a, b) => a - b);
    return sorted.length ? sorted[Math.ceil(q * (sorted.length - 1))] : null;
  };
  return {
    cases: rows.length,
    successRate: results.filter((r) => r.success).length / results.length,
    verifiedRate: results.filter((r) => r.verified).length / results.length,
    medianNormalizedRms: quantile(errors, 0.5),
    meanNormalizedRms: errors.length ? errors.reduce((a, b) => a + b, 0) / errors.length : null,
    p90NormalizedRms: quantile(errors, 0.9),
    worstNormalizedRms: quantile(errors, 1),
    medianRuntimeMs: quantile(
      results.map((r) => r.runtimeMs),
      0.5
    ),
    p90RuntimeMs: quantile(
      results.map((r) => r.runtimeMs),
      0.9
    ),
    medianEvaluations: quantile(
      results.map((r) => r.evaluations),
      0.5
    ),
  };
}

export function benchmarkMarkdown(rows: readonly PathBenchmarkRow[]): string {
  const percent = (v: number | null) => (v === null ? '—' : `${(100 * v).toFixed(3)}%`);
  return (
    '# Four-bar path synthesis benchmark\n\nEqual settings and seeds; production-generated targets; dimensions withheld. RMS is paired geometric error in internal PMKS units. Success means verified and normalized RMS ≤ 2.5%. Missing fits are excluded from error quantiles and included as failures in rates.\n\n' +
    '## Aggregate\n\n```json\n' +
    JSON.stringify(
      { equal: aggregateBenchmarks(rows, 'equal'), free: aggregateBenchmarks(rows, 'free') },
      null,
      2
    ) +
    '\n```\n\n' +
    '| Case | Equal RMS/L | Free RMS/L | Free reduction | Equal / free seconds | Verified equal / free |\n| --- | ---: | ---: | ---: | ---: | --- |\n' +
    rows
      .map(
        (r) =>
          `| ${r.id} | ${percent(r.equal.normalizedRms)} | ${percent(r.free.normalizedRms)} | ${r.equal.normalizedRms && r.free.normalizedRms !== null ? percent(1 - r.free.normalizedRms / r.equal.normalizedRms) : '—'} | ${(r.equal.runtimeMs / 1000).toFixed(2)} / ${(r.free.runtimeMs / 1000).toFixed(2)} | ${r.equal.verified} / ${r.free.verified} |`
      )
      .join('\n') +
    '\n'
  );
}
