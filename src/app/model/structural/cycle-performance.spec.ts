import { writeFileSync } from 'node:fs';
import { crankCycle, cycleSamples } from '../../../test-utils/verification/cycle-verification';
import { snapshotPmksMemberMotion } from './pmks-dynamic-state';
import { analyzeDynamic } from './dynamic-force-solver';
import { recoverDynamicMemberLoads } from './member-load-recovery';
import { findMemberStressExtrema } from './stress-extrema';
import { evaluateMemberStress } from './member-stress';
import { analyzePmksCycle } from './pmks-cycle-analysis';
import { aggregateCycle } from './cycle-envelope';
import { pmksCycleMetadata } from './pmks-cycle-metadata';
import { noMemberLoad } from '../../../test-utils/verification/member-verification';

it('measures 361 samples with separated S2/S3/S4, histories and aggregation without a machine-speed gate', () => {
  const request = crankCycle();
  // Warm fixture, math and JIT once; timing is diagnostic, never a correctness gate.
  expect(analyzePmksCycle(request).status).toBe('complete');
  const batches = [];
  let outputBytes = 0;
  for (let batch = 0; batch < 3; batch++) {
    const ms = { snapshot: 0, S2: 0, S3: 0, S4: 0, fixedPoints: 0, aggregation: 0, endToEnd: 0 };
    const timed = <T>(key: keyof typeof ms, action: () => T): T => {
      const start = performance.now();
      const result = action();
      ms[key] += performance.now() - start;
      return result;
    };
    for (const sampleIndex of request.sampleIndices) {
      const snapshot = timed('snapshot', () =>
        snapshotPmksMemberMotion({ ...request, sampleIndex })
      );
      if (snapshot.status !== 'ok') throw new Error(snapshot.message);
      const eq = timed('S2', () =>
        analyzeDynamic(snapshot.configuration, snapshot.states, noMemberLoad)
      );
      const loads = timed('S3', () =>
        recoverDynamicMemberLoads(
          snapshot.configuration,
          request.member,
          noMemberLoad,
          eq,
          snapshot.states[0],
          request.recovery
        )
      );
      if (loads.status !== 'ok') throw new Error(loads.message);
      const stress = timed('S4', () =>
        findMemberStressExtrema(loads, request.section, request.material)
      );
      expect(stress.status).toBe('ok');
      timed('fixedPoints', () =>
        request.materialPoints!.forEach((p) => {
          expect(
            evaluateMemberStress(
              loads,
              request.section,
              { xM: p.xi * loads.member.lengthM, yM: p.eta * 0.01, side: p.side },
              request.material
            ).status
          ).toBe('ok');
        })
      );
    }
    const result = timed('endToEnd', () => analyzePmksCycle(request));
    expect(cycleSamples(result)).toHaveLength(361);
    const pure = {
      ...request,
      ...pmksCycleMetadata(request.mechanism, request.sampleIndices, request),
      readSample: () => {
        throw new Error('Aggregation must not solve');
      },
    };
    timed('aggregation', () => aggregateCycle(pure, result.samples));
    outputBytes = new TextEncoder().encode(JSON.stringify(result)).length;
    batches.push({
      totalMs: ms,
      perSampleMs: Object.fromEntries(Object.entries(ms).map(([k, v]) => [k, v / 361])),
    });
  }
  if (process.env['PMKS_BENCHMARK_CYCLE'])
    writeFileSync(
      'artifacts/s5-performance.json',
      JSON.stringify(
        {
          sampleCount: 361,
          memberCount: 1,
          fixedPoints: 3,
          serializedOutputBytes: outputBytes,
          batches,
          note: 'JSON byte count is a storage estimate, not measured heap; no equilibrium matrices, configurations, or S3 diagrams retained.',
        },
        null,
        2
      ) + '\n'
    );
  expect(batches).toHaveLength(3);
});
