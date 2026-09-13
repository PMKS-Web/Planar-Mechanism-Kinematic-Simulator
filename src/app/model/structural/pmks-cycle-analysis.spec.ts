import { buildMechanism } from '../../../test-utils/verification/fixture';
import {
  structuralCrankFixture,
  structuralToggleFixture,
} from '../../../test-utils/verification/structural-fixtures';
import {
  crankCycle,
  cycleSamples,
  relativeClose,
  freezeGraph,
} from '../../../test-utils/verification/cycle-verification';
import {
  memberAB,
  noMemberLoad,
  memberConfiguration,
} from '../../../test-utils/verification/member-verification';
import { analyzePmksCycle } from './pmks-cycle-analysis';
import { snapshotPmksMemberMotion } from './pmks-dynamic-state';
import { loadCaseFromPmksForces, snapshotPmksConfiguration } from './pmks-configuration';
import { analyzeDynamic } from './dynamic-force-solver';
import { analyzeStatic } from './static-force-solver';
import { recoverDynamicMemberLoads } from './member-load-recovery';
import { findMemberStressExtrema } from './stress-extrema';
import { evaluateMemberStress } from './member-stress';
import { analyzeCycle } from './cycle-analysis';
import { pmksCycleMetadata } from './pmks-cycle-metadata';
import { StructuralAnalysisService } from '../../services/structural-analysis.service';
import type { LoadCase } from './loads';

const tipLoad = (follower = false): LoadCase => ({
  name: '100 N at the material tip',
  loads: [
    {
      kind: 'point-force',
      linkId: 'AB',
      at: { frame: 'link', positionM: { x: 2, y: 0 } },
      directionFrame: follower ? 'link' : 'global',
      forceN: { x: 0, y: -100 },
    },
  ],
});

describe('S5 solved-sample stress cycle', () => {
  it('evaluates all 361 precision-crank samples and independently verifies centripetal tension', () => {
    const request = crankCycle();
    const result = analyzePmksCycle(request);
    const samples = cycleSamples(result);
    expect(result.coverage).toEqual({
      requested: 361,
      successful: 361,
      failed: 0,
      fraction: 1,
      percent: 100,
    });
    expect(result.coverageKind).toBe('sampled');
    expect(result.sequence).toMatchObject({
      closure: 'closed',
      duplicateEndpointPose: true,
      reverses: false,
      coversAllSolvedSamples: true,
    });
    expect(result.provenance.status).toBe('consistent');
    for (const sample of samples) {
      relativeClose(sample.stress.maximumVonMises.valuePa, 8 / 0.0002);
      relativeClose(sample.stress.maximumAbsoluteNormal.point.location.xM, 0);
      expect(sample.stress.provenance.motionSource).toBe('pmks-analytical');
      for (const point of sample.points) {
        relativeClose(point.stress.normalStressPa, 6 / 0.0002);
        relativeClose(point.stress.transverseShearStressPa, 0);
      }
    }
    for (const i of [0, 90, 180, 270, 360]) {
      const drive = samples[i].drive;
      expect(drive.kind).toBe('angle');
      if (drive.kind !== 'angle') throw new Error('Missing angle');
      relativeClose(drive.unwrappedRad, (i * Math.PI) / 180);
      relativeClose(samples[i].timeSeconds!, (i * Math.PI) / 360);
    }
    expect(result.envelope!.yield.status).toBe('available');
    if (result.envelope!.yield.status === 'available') {
      const criterion = result.envelope!.yield.governing.criterion;
      if (criterion.status !== 'available') throw new Error('Missing criterion');
      relativeClose(criterion.factorOfSafety!, 6250);
    }
  });

  it('resolves a world-fixed direction at each pose and preserves signed top/center/bottom histories', () => {
    const request = {
      ...crankCycle(),
      mode: 'static' as const,
      loading: { kind: 'saved-load-case' as const, loadCase: tipLoad() },
    };
    const result = analyzePmksCycle(request);
    const samples = cycleSamples(result);
    for (const s of samples) {
      const angle = (s.sampleIndex * Math.PI) / 180;
      const N = -100 * Math.sin(angle),
        V = 100 * Math.cos(angle),
        M = -100 * Math.cos(angle);
      for (const p of s.points) {
        const eta = Number(p.id);
        relativeClose(
          p.stress.normalStressPa,
          N / 0.0002 - (M * eta * 0.01) / ((0.01 * 0.02 ** 3) / 12)
        );
        relativeClose(p.stress.transverseShearStressPa, ((-1.5 * V) / 0.0002) * (1 - eta ** 2));
        expect(p.stress.principalStress1Pa).toBeGreaterThanOrEqual(p.stress.principalStress2Pa);
      }
    }
    for (const history of result.histories) {
      expect(history.entries.map((e) => e.sampleIndex)).toEqual(request.sampleIndices);
      const stats = history.statistics!;
      relativeClose(stats.normal.minimumPa, -stats.normal.maximumPa);
      relativeClose(stats.normal.rangePa, 2 * stats.normal.maximumPa);
      relativeClose(stats.normal.midrangePa, 0, 1e-5);
    }
    relativeClose(
      samples[0].stress.maximumVonMises.valuePa,
      samples[180].stress.maximumVonMises.valuePa
    );
    relativeClose(
      samples[90].stress.maximumVonMises.valuePa,
      samples[270].stress.maximumVonMises.valuePa
    );
    const follower = cycleSamples(
      analyzePmksCycle({
        ...request,
        loading: { kind: 'saved-load-case', loadCase: tipLoad(true) },
      })
    );
    for (const s of follower) relativeClose(s.points[2].stress.normalStressPa, 150e6);
    expect(samples[180].points[2].stress.normalStressPa).toBeLessThan(0);
  });

  it('matches independent manual S2/S3/S4 orchestration, including bounds and fixed points', () => {
    const request = {
      ...crankCycle(),
      sampleIndices: [270, 30, 0, 360, 90],
      loading: {
        kind: 'saved-load-case' as const,
        loadCase: { ...tipLoad(), gravityMPerS2: { x: 0, y: -9.81 } },
      },
    };
    const result = new StructuralAnalysisService().analyzeCycle(request);
    for (const s of cycleSamples(result)) {
      const snapshot = snapshotPmksMemberMotion({ ...request, sampleIndex: s.sampleIndex });
      if (snapshot.status !== 'ok') throw new Error(snapshot.message);
      freezeGraph(snapshot);
      const eq = analyzeDynamic(snapshot.configuration, snapshot.states, request.loading.loadCase);
      freezeGraph(eq);
      const loads = recoverDynamicMemberLoads(
        snapshot.configuration,
        request.member,
        request.loading.loadCase,
        eq,
        snapshot.states[0],
        request.recovery
      );
      freezeGraph(loads);
      const stress = findMemberStressExtrema(loads, request.section, request.material);
      freezeGraph(stress);
      expect(s.stress).toEqual(stress);
      expect(s.points[2].stress).toEqual(
        evaluateMemberStress(
          loads,
          request.section,
          { xM: s.memberLengthM / 2, yM: 0.01, side: 'right' },
          request.material
        )
      );
    }
    const envelope = result.envelope!;
    expect(envelope.maximumConservativeVonMises.upperBoundPa).toBe(
      Math.max(...cycleSamples(result).map((s) => s.stress.diagnostics.vonMisesUpperBoundPa))
    );
    expect(envelope.maximumConservativeVonMises.diagnostics.vonMisesGapPa).toBeGreaterThanOrEqual(
      0
    );
    expect(result.samples.map((s) => s.sampleIndex)).toEqual(request.sampleIndices);
    expect(result.sequence.order).toBe('explicit');
    const yieldResult = envelope.yield;
    if (
      yieldResult.status !== 'available' ||
      yieldResult.governing.criterion.status !== 'available'
    )
      throw new Error('No criterion');
    expect(yieldResult.governing.criterion.factorOfSafety).toBe(
      Math.min(
        ...cycleSamples(result).map((s) => {
          const c = s.stress.conservativeYieldCriterion;
          return c.status === 'available' ? c.factorOfSafety! : Infinity;
        })
      )
    );
  });

  it('converts native PMKS forces from each matching solved frame, including local forces', () => {
    for (const local of [false, true]) {
      const fixture = structuralCrankFixture();
      fixture.load = { ...fixture.load!, local };
      const request = {
        ...crankCycle(),
        mechanism: buildMechanism(fixture).mechanism,
        sampleIndices: [0, 90, 180, 270, 360],
        mode: 'static' as const,
        loading: { kind: 'pmks-forces' as const, name: 'Native force' },
      };
      const samples = cycleSamples(analyzePmksCycle(request));
      for (const s of samples) {
        const frame = {
          ...request,
          joints: request.mechanism.joints[s.sampleIndex],
          links: request.mechanism.links[s.sampleIndex],
        };
        const load = loadCaseFromPmksForces(
          frame,
          request.mechanism.forces[s.sampleIndex],
          'Native force'
        );
        const manual = cycleSamples(
          analyzePmksCycle({
            ...request,
            sampleIndices: [s.sampleIndex],
            loading: { kind: 'saved-load-case', loadCase: load },
          })
        );
        expect(s.stress).toEqual(manual[0].stress);
      }
      if (local)
        relativeClose(
          samples[2].points[2].stress.normalStressPa,
          samples[0].points[2].stress.normalStressPa
        );
      else expect(samples[2].points[2].stress.normalStressPa).toBeLessThan(0);
    }
  });

  it('retains a world-fixed application point and exposes poses outside the member as gaps', () => {
    const load = tipLoad();
    const point = load.loads[0];
    if (point.kind !== 'point-force') throw new Error('Wrong fixture');
    const result = analyzePmksCycle({
      ...crankCycle(),
      mode: 'static',
      sampleIndices: [0, 180, 360],
      loading: {
        kind: 'saved-load-case',
        loadCase: {
          ...load,
          loads: [{ ...point, at: { frame: 'global', positionM: { x: 2, y: 0 } } }],
        },
      },
    });
    expect(result.status).toBe('incomplete');
    expect(result.coverage.successful).toBe(2);
    expect(result.samples[1]).toMatchObject({
      status: 'failed',
      stage: 'member-loads',
      code: 'load-not-on-supported-member',
      sampleIndex: 180,
    });
    expect(result.histories[0].entries[1].status).toBe('failed');
    expect(result.gaps).toHaveLength(1);
    expect(result.envelope!.scope).toBe('successful-requested-samples');
  });

  it('keeps explicit invalid-index gaps, missing material, singular poses, and setup failure honest', () => {
    const request = crankCycle();
    const result = analyzePmksCycle({
      ...request,
      sampleIndices: [0, -1, 999, 90],
      material: undefined,
    });
    expect(result.status).toBe('incomplete');
    expect(result.coverage.percent).toBe(50);
    expect(result.gaps[0]).toMatchObject({ startSequenceIndex: 1, endSequenceIndex: 2 });
    expect(result.gaps[0].failures.map((s) => s.timeSeconds)).toEqual([null, null]);
    expect(result.envelope!.yield.status).toBe('unavailable');
    expect(analyzePmksCycle({ ...request, sampleIndices: [] }).setupFailure?.stage).toBe('setup');
    expect(
      analyzePmksCycle({
        ...request,
        materialPoints: [{ id: 'bad', xi: 2, eta: 0, side: 'right' }],
      }).status
    ).toBe('failed');
    const metadata = pmksCycleMetadata(request.mechanism, [0, 1, 2], request);
    const normal = memberConfiguration();
    const toggle = memberConfiguration(structuralToggleFixture());
    const singular = analyzeCycle({
      ...request,
      ...metadata,
      mode: 'static',
      readSample: (_, i) => ({
        status: 'ok',
        configuration: i === 1 ? toggle : normal,
        loadCase: noMemberLoad,
      }),
    });
    expect(singular.status).toBe('incomplete');
    expect(singular.samples[1]).toMatchObject({ status: 'failed', stage: 'equilibrium' });
    expect(singular.histories[0].entries[1].status).toBe('failed');
  });

  it('does not mutate frozen mechanism, load, section, material, or requests and repeats deterministically', () => {
    const request = { ...crankCycle(), sampleIndices: [0, 30, 90, 180, 360] };
    freezeGraph(request);
    const first = analyzePmksCycle(request);
    freezeGraph(first);
    expect(analyzePmksCycle(request)).toEqual(first);
  });

  it('propagates S4 and S3 refusals without changing existing tolerances or mass authority', () => {
    const request = { ...crankCycle(), sampleIndices: [0, 90] };
    const badSection = analyzePmksCycle({ ...request, section: { kind: 'circle', diameterM: -1 } });
    expect(badSection.envelope).toBeNull();
    expect(badSection.samples[0]).toMatchObject({
      status: 'failed',
      stage: 'stress',
      code: 'invalid-section-properties',
    });
    for (const frame of request.mechanism.links) {
      const link = frame[0] as import('../link').RealLink;
      link.massMoI = 0.667; // Exactly the legacy thousandths value for 2/3, not a new tolerance.
    }
    const mismatch = analyzePmksCycle(request);
    expect(mismatch.status).toBe('failed');
    expect(mismatch.samples[0]).toMatchObject({
      stage: 'member-loads',
      code: 'mass-distribution-mismatch',
    });
  });
});
