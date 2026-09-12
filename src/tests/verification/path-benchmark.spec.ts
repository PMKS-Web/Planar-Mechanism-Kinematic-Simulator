import '../../app/model/joint';
import { mkdirSync, writeFileSync } from 'node:fs';
import { PATH_BENCHMARK_FIXTURES } from '../../test-utils/verification/path-benchmark-fixtures';
import {
  aggregateBenchmarks,
  BENCHMARK_SETTINGS,
  benchmarkMarkdown,
  oracleError,
  PathBenchmarkRow,
  productionReference,
  runBenchmarkMode,
} from '../../test-utils/verification/path-benchmark';

describe('production path benchmark gallery', () => {
  for (const fixture of PATH_BENCHMARK_FIXTURES)
    it(`${fixture.id} supplies a complete verified target and timing oracle`, () => {
      const reference = productionReference(fixture);
      expect(reference.sourceValidation.status).toBe('passed');
      expect(reference.oracle).toHaveLength(64);
      expect(reference.oracle[0]).toBeCloseTo(0, 8);
      expect(reference.oracle.slice(1).every((v, i) => v > reference.oracle[i])).toBe(true);
    });
});

// Expensive quality comparison is explicit; the ordinary suite still validates every source.
describe.skipIf(!process.env['PMKS_PATH_BENCHMARK'])(
  'equal-angle versus free-timing benchmark',
  () => {
    const rows: PathBenchmarkRow[] = [];
    const selected = process.env['PMKS_PATH_BENCHMARK_CASES']?.split(',');
    afterAll(() => {
      if (selected) return;
      expect(rows).toHaveLength(PATH_BENCHMARK_FIXTURES.length);
      const equal = aggregateBenchmarks(rows, 'equal'),
        free = aggregateBenchmarks(rows, 'free');
      expect(free.verifiedRate).toBeGreaterThanOrEqual(equal.verifiedRate);
      expect(free.meanNormalizedRms!).toBeLessThan(equal.meanNormalizedRms! * 0.8);
      const nonuniform = rows.find((row) => row.id === 'nonuniform-speed')!;
      expect(nonuniform.free.normalizedRms!).toBeLessThan(nonuniform.equal.normalizedRms! * 0.6);
    });
    for (const fixture of PATH_BENCHMARK_FIXTURES.filter(
      (f) => !selected || selected.includes(f.id)
    ))
      it(
        fixture.id,
        () => {
          const reference = productionReference(fixture);
          const equal = runBenchmarkMode(reference, 'equal-input-angle');
          const free = runBenchmarkMode(reference, 'monotone-free-timing');
          rows.push({
            id: fixture.id,
            description: fixture.description,
            categories: fixture.categories,
            transformOf: fixture.transformOf,
            sourceSamples: reference.sourceSamples,
            requestedSweep: reference.requestedSweep,
            sourceValidation: reference.sourceValidation,
            oracle: oracleError(reference),
            equal,
            free,
          });
          mkdirSync('artifacts/path-free-timing', { recursive: true });
          writeFileSync(
            'artifacts/path-free-timing/benchmark.json',
            JSON.stringify(
              {
                schemaVersion: 1,
                settings: BENCHMARK_SETTINGS,
                units: 'PMKS model coordinates (200 per displayed unit)',
                equal: aggregateBenchmarks(rows, 'equal'),
                free: aggregateBenchmarks(rows, 'free'),
                improvedCases: rows.filter(
                  (r) =>
                    r.free.normalizedRms !== null &&
                    r.equal.normalizedRms !== null &&
                    r.free.normalizedRms < r.equal.normalizedRms
                ).length,
                rows,
              },
              null,
              2
            )
          );
          writeFileSync('artifacts/path-free-timing/benchmark.md', benchmarkMarkdown(rows));
          console.log(
            `${fixture.id}: equal=${equal.normalizedRms?.toFixed(5)}, free=${free.normalizedRms?.toFixed(5)}, verified=${equal.verified}/${free.verified}`
          );
          expect(free.correspondence?.monotone ?? true).toBe(true);
        },
        120000
      );
  }
);
