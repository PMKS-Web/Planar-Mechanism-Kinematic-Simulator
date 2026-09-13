import {
  crankCycle,
  cycleSamples,
  relativeClose,
} from '../../../test-utils/verification/cycle-verification';
import {
  memberConfiguration,
  noMemberLoad,
} from '../../../test-utils/verification/member-verification';
import { analyzeCycle } from './cycle-analysis';
import { analyzePmksCycle } from './pmks-cycle-analysis';
import { pmksCycleMetadata } from './pmks-cycle-metadata';
import { aggregateCycle } from './cycle-envelope';
import type { CycleAnalysisRequest } from './cycle-results';

describe('S5 pure cycle orchestration and aggregation', () => {
  it('retains signed angular-acceleration stress reversals with independently integrated N/V/M', () => {
    const request = crankCycle();
    const metadata = pmksCycleMetadata(request.mechanism, [0, 1, 2], request);
    const result = analyzeCycle({
      ...request,
      ...metadata,
      readSample: (_, i) => ({
        status: 'ok',
        configuration: memberConfiguration(),
        loadCase: noMemberLoad,
        motion: [
          {
            linkId: 'AB',
            source: 'prescribed',
            angularVelocityRadPerS: 2,
            angularAccelerationRadPerS2: (i - 1) * 3,
            centerOfMassAccelerationMPerS2: { x: -4, y: (i - 1) * 3 },
          },
        ],
      }),
    });
    for (const [i, s] of cycleSamples(result).entries()) {
      const N = 6,
        V = (i - 1) * 4.5,
        M = -(i - 1) * 2.5;
      for (const p of s.points) {
        const eta = Number(p.id);
        expect(p.stress.internalLoads).toEqual({
          axialN: expect.closeTo(N, 8),
          shearN: expect.closeTo(V, 8),
          momentNm: expect.closeTo(M, 8),
        });
        relativeClose(
          p.stress.normalStressPa,
          N / 0.0002 - (M * eta * 0.01) / ((0.01 * 0.02 ** 3) / 12)
        );
        relativeClose(p.stress.transverseShearStressPa, ((-1.5 * V) / 0.0002) * (1 - eta ** 2));
      }
    }
    const top = result.histories[2].statistics!.normal;
    relativeClose(top.minimumPa, -3720000);
    relativeClose(top.maximumPa, 3780000);
    relativeClose(top.rangePa, 7500000);
    relativeClose(top.midrangePa, 30000);
    expect(result.histories[1].statistics!.shear.minimumPa).toBeLessThan(0);
    expect(result.histories[1].statistics!.shear.maximumPa).toBeGreaterThan(0);
  });

  it('keeps a fixed material point distinct from a critical station that moves with the load direction', () => {
    const request = crankCycle();
    const result = analyzePmksCycle({
      ...request,
      mode: 'static',
      sampleIndices: [0, 180],
      loading: {
        kind: 'saved-load-case',
        loadCase: {
          name: 'Tip force and interior couple',
          loads: [
            {
              kind: 'point-force',
              linkId: 'AB',
              at: { frame: 'link', positionM: { x: 2, y: 0 } },
              directionFrame: 'global',
              forceN: { x: 0, y: -100 },
            },
            {
              kind: 'moment',
              linkId: 'AB',
              at: { frame: 'link', positionM: { x: 1, y: 0 } },
              momentNm: 200,
            },
          ],
        },
      },
    });
    const samples = cycleSamples(result);
    relativeClose(samples[0].stress.maximumAbsoluteNormal.point.location.xM, 1);
    relativeClose(samples[1].stress.maximumAbsoluteNormal.point.location.xM, 0);
    relativeClose(samples[0].points[2].stress.location.xM, 1);
    relativeClose(samples[1].points[2].stress.location.xM, 1);
    expect(samples[1].points[2].stress.vonMisesStressPa).toBeLessThan(
      samples[1].stress.maximumVonMises.valuePa
    );
  });

  it('honors left/right limits at a fixed load discontinuity', () => {
    const request = crankCycle();
    const result = analyzePmksCycle({
      ...request,
      mode: 'static',
      sampleIndices: [0, 90],
      materialPoints: ['left', 'right'].map((side) => ({
        id: side,
        xi: 0.5,
        eta: 1,
        side: side as 'left' | 'right',
      })),
      loading: {
        kind: 'saved-load-case',
        loadCase: {
          name: 'Located couple',
          loads: [
            {
              kind: 'moment',
              linkId: 'AB',
              at: { frame: 'link', positionM: { x: 1, y: 0 } },
              momentNm: 10,
            },
          ],
        },
      },
    });
    for (const s of cycleSamples(result)) {
      relativeClose(
        Math.abs(
          s.points[0].stress.internalLoads.momentNm - s.points[1].stress.internalLoads.momentNm
        ),
        10
      );
    }
  });

  it('reports heterogeneous provenance and withholds a combined yield claim', () => {
    const request = crankCycle();
    const metadata = pmksCycleMetadata(request.mechanism, [0, 1], request);
    const result = analyzeCycle({
      ...request,
      ...metadata,
      readSample: (_, i) => ({
        status: 'ok',
        configuration: memberConfiguration(),
        loadCase: noMemberLoad,
        motion: [
          {
            linkId: 'AB',
            source: i ? undefined : 'prescribed',
            angularVelocityRadPerS: 2,
            angularAccelerationRadPerS2: 0,
            centerOfMassAccelerationMPerS2: { x: -4, y: 0 },
          },
        ],
      }),
    });
    expect(result.status).toBe('complete');
    expect(result.provenance).toEqual({ status: 'heterogeneous', variantCount: 2 });
    expect(result.envelope!.yield.status).toBe('unavailable');
  });

  it('never labels a conservative upper bound as an attained location, and resolves exact ties in request order', () => {
    const request = crankCycle();
    const result = analyzePmksCycle({ ...request, sampleIndices: [0] });
    const sample = cycleSamples(result)[0];
    const tied = [
      { ...sample, sampleIndex: 90, sequenceIndex: 0 },
      { ...sample, sampleIndex: 0, sequenceIndex: 1 },
    ];
    const pure: CycleAnalysisRequest = {
      ...request,
      ...pmksCycleMetadata(request.mechanism, [90, 0], request),
      readSample: () => {
        throw new Error('Aggregation must not solve');
      },
    };
    const envelope = aggregateCycle(pure, tied).envelope!;
    expect(envelope.maximumVonMises.sample.sampleIndex).toBe(90);
    expect(envelope.maximumConservativeVonMises).not.toHaveProperty('location');
    expect(envelope.maximumConservativeVonMises.attainedWitness).toEqual(
      sample.stress.maximumVonMises
    );
  });

  it('retains zero-demand unbounded FoS without NaN or an invented finite value', () => {
    const result = analyzePmksCycle({ ...crankCycle(), mode: 'static', sampleIndices: [0, 90] });
    const criterion = result.envelope!.yield;
    expect(criterion.status).toBe('available');
    if (criterion.status !== 'available') throw new Error('No criterion');
    expect(criterion.governing.criterion).toMatchObject({
      status: 'available',
      utilization: 0,
      factorOfSafety: null,
      factorOfSafetyState: 'unbounded-zero-demand',
    });
  });
});
