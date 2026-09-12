import { writeFileSync } from 'node:fs';
import { buildMechanism } from '../../../test-utils/verification/fixture';
import { structuralDynamicCrankFixture } from '../../../test-utils/verification/structural-fixtures';
import { offsetLoadFourBarFixture } from '../../../test-utils/verification/force-fixtures';
import { bellCrankFixture } from '../../../test-utils/verification/workshop-fixtures';
import { LengthUnit } from '../unit-enums';
import { analyzeDynamic } from './dynamic-force-solver';
import { analyzePmksDynamicFrame, snapshotPmksDynamicState } from './pmks-dynamic-state';

/** A diagnostic benchmark, never a machine-speed gate. Set PMKS_BENCHMARK_STRUCTURAL=1 for JSON. */
it('measures stateless per-sample analysis on one, three, and five moving bodies', () => {
  const measurements = [];
  for (const fixture of [
    structuralDynamicCrankFixture,
    offsetLoadFourBarFixture,
    bellCrankFixture,
  ]) {
    const mechanism = buildMechanism(fixture()).mechanism;
    const selected = {
      mechanism,
      sampleIndex: 0,
      lengthUnit: LengthUnit.METER,
      coordinateSpace: 'project' as const,
    };
    const samples = [0, 10, 20, 30, 40].map((sampleIndex) => ({ ...selected, sampleIndex }));
    const snapshots = samples.map((sample) => snapshotPmksDynamicState(sample));
    const load = { name: 'Benchmark', loads: [] };
    const operations = {
      pure: (i: number) => {
        const snapshot = snapshots[i % samples.length];
        if (snapshot.status !== 'ok') throw new Error(snapshot.status);
        return analyzeDynamic(snapshot.configuration, snapshot.states, load);
      },
      adapter: (i: number) => snapshotPmksDynamicState(samples[i % samples.length]),
      combined: (i: number) => analyzePmksDynamicFrame(samples[i % samples.length], load),
    };
    for (const [operation, run] of Object.entries(operations)) {
      for (let i = 0; i < 25; i++) expect(run(i).status).toBe('ok');
      const batches = [];
      for (let batch = 0; batch < 5; batch++) {
        const start = performance.now();
        for (let i = 0; i < 50; i++) {
          if (run(i).status !== 'ok') throw new Error('Benchmark sample failed');
        }
        batches.push((performance.now() - start) / 50);
      }
      batches.sort((a, b) => a - b);
      measurements.push({
        fixture: fixture.name,
        operation,
        medianMsPerSample: batches[2],
        minMsPerSample: batches[0],
        maxMsPerSample: batches[4],
        samplesPerBatch: 50,
        batches: 5,
      });
    }
  }
  if (process.env['PMKS_BENCHMARK_STRUCTURAL']) {
    writeFileSync('artifacts/s2-performance.json', JSON.stringify(measurements, null, 2) + '\n');
  }
  expect(measurements).toHaveLength(9);
});
