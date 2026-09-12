import { writeFileSync } from 'node:fs';
import {
  stressRectangle,
  stressCircle,
  extremaSuccess,
} from '../../../test-utils/verification/stress-verification';
import {
  memberAB,
  memberConfiguration,
  memberSuccess,
  uniformAB,
  verifyMemberCuts,
} from '../../../test-utils/verification/member-verification';
import { structuralUniformMemberFixture } from '../../../test-utils/verification/structural-fixtures';
import { analyzeStatic } from './static-force-solver';
import { recoverStaticMemberLoads } from './member-load-recovery';
import { evaluateMemberStress } from './member-stress';
import { findSectionStressExtrema, findMemberStressExtrema } from './stress-extrema';

/** Diagnostic only: excludes all S1/S2/S3 and fixture setup; no machine-speed gate. */
it('measures stress points, section extrema, and whole-member extrema on both supported sections', () => {
  const c = memberConfiguration(structuralUniformMemberFixture());
  const load = { name: 'Uniform self-weight', loads: [], gravityMPerS2: { x: 0, y: -10 } };
  const eq = analyzeStatic(c, load);
  const loads = memberSuccess(
    recoverStaticMemberLoads(c, memberAB, load, eq, {
      gravityModel: 'uniform-line',
      massDistribution: uniformAB,
    })
  );
  verifyMemberCuts(c, load, eq, loads);
  const measurements = [];
  for (const section of [stressRectangle, stressCircle]) {
    const extrema = extremaSuccess(findMemberStressExtrema(loads, section));
    expect(extrema.maximumVonMises.point.location.xM).toBeCloseTo(2, 7);
    const operations = {
      point: () => evaluateMemberStress(loads, section, { xM: 1.13, side: 'right', yM: 0.005 }),
      section: () => findSectionStressExtrema(loads, section, { xM: 1.13, side: 'right' }),
      member: () => findMemberStressExtrema(loads, section),
    };
    for (const [operation, run] of Object.entries(operations)) {
      for (let i = 0; i < 25; i++) expect(run().status).toBe('ok');
      const batches = [];
      for (let batch = 0; batch < 5; batch++) {
        const start = performance.now();
        for (let i = 0; i < 50; i++)
          if (run().status !== 'ok') throw new Error('Stress benchmark failed');
        batches.push((performance.now() - start) / 50);
      }
      batches.sort((a, b) => a - b);
      measurements.push({
        section: section.kind,
        operation,
        medianMs: batches[2],
        minMs: batches[0],
        maxMs: batches[4],
        samplesPerBatch: 50,
        batches: 5,
      });
    }
  }
  if (process.env['PMKS_BENCHMARK_STRESS'])
    writeFileSync('artifacts/s4-performance.json', JSON.stringify(measurements, null, 2) + '\n');
  expect(measurements).toHaveLength(6);
});
