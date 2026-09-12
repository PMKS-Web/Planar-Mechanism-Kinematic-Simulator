import { writeFileSync } from 'node:fs';
import {
  memberAB,
  uniformAB,
  memberConfiguration,
  memberSuccess,
  verifyMemberCuts,
} from '../../../test-utils/verification/member-verification';
import type { LoadCase } from './loads';
import { analyzeStatic } from './static-force-solver';
import { analyzeDynamic } from './dynamic-force-solver';
import { recoverStaticMemberLoads, recoverDynamicMemberLoads } from './member-load-recovery';
import { evaluateMemberLoads } from './member-diagram';

/** Measures recovery of precomputed equilibrium, without SVD or position-solving time. */
it('measures static/dynamic per-member recovery and station queries at two event densities', () => {
  const configuration = memberConfiguration();
  const motion = {
    linkId: 'AB',
    centerOfMassAccelerationMPerS2: { x: -4, y: 3 },
    angularAccelerationRadPerS2: 3,
    angularVelocityRadPerS: 2,
  };
  const options = { massDistribution: uniformAB, gravityModel: 'uniform-line' as const };
  const measurements = [];
  for (const pointLoads of [1, 10]) {
    const load: LoadCase = {
      name: 'Member benchmark',
      gravityMPerS2: { x: 0, y: -9.80665 },
      loads: Array.from({ length: pointLoads }, (_, i) => ({
        kind: 'point-force' as const,
        linkId: 'AB',
        directionFrame: 'global' as const,
        at: {
          frame: 'global' as const,
          positionM: { x: (2 * (i + 1)) / (pointLoads + 1), y: 0.1 },
        },
        forceN: { x: 2, y: -10 },
      })),
    };
    const staticEq = analyzeStatic(configuration, load);
    const dynamicEq = analyzeDynamic(configuration, [motion], load);
    const staticDiagram = memberSuccess(
      recoverStaticMemberLoads(configuration, memberAB, load, staticEq, options)
    );
    const dynamicDiagram = memberSuccess(
      recoverDynamicMemberLoads(configuration, memberAB, load, dynamicEq, motion, options)
    );
    verifyMemberCuts(configuration, load, staticEq, staticDiagram);
    verifyMemberCuts(configuration, load, dynamicEq, dynamicDiagram, motion);
    const operations = {
      staticRecovery: () =>
        recoverStaticMemberLoads(configuration, memberAB, load, staticEq, options),
      dynamicRecovery: () =>
        recoverDynamicMemberLoads(configuration, memberAB, load, dynamicEq, motion, options),
      stationQuery: () => evaluateMemberLoads(dynamicDiagram, { xM: 0.731, side: 'right' }),
    };
    for (const [operation, run] of Object.entries(operations)) {
      for (let i = 0; i < 25; i++) expect(run().status).toBe('ok');
      const batches = [];
      for (let batch = 0; batch < 5; batch++) {
        const start = performance.now();
        for (let i = 0; i < 100; i++) {
          if (run().status !== 'ok') throw new Error('Benchmark recovery failed');
        }
        batches.push((performance.now() - start) / 100);
      }
      batches.sort((a, b) => a - b);
      measurements.push({
        operation,
        pointLoads,
        medianMsPerMemberSample: batches[2],
        minMs: batches[0],
        maxMs: batches[4],
        samplesPerBatch: 100,
        batches: 5,
      });
    }
  }
  if (process.env['PMKS_BENCHMARK_MEMBER']) {
    writeFileSync('artifacts/s3-performance.json', JSON.stringify(measurements, null, 2) + '\n');
  }
  expect(measurements).toHaveLength(6);
});
