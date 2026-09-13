import { analyzeStatic } from './static-force-solver';
import { analyzeDynamic } from './dynamic-force-solver';
import { recoverDynamicMemberLoads, recoverStaticMemberLoads } from './member-load-recovery';
import { findMemberStressExtrema } from './stress-extrema';
import { evaluateMemberStress } from './member-stress';
import { aggregateCycle } from './cycle-envelope';
import type {
  CycleAnalysisRequest,
  CycleAnalysisResult,
  CycleFailure,
  CycleSampleMetadata,
  CycleSampleResult,
} from './cycle-results';

/** No physics here: every stage delegates to the existing strict S1/S2, S3 and S4 APIs. */
export function analyzeCycle(request: CycleAnalysisRequest): CycleAnalysisResult {
  const invalid = validateRequest(request);
  if (invalid) {
    return aggregateCycle(
      request,
      request.samples.map((sample, sequenceIndex) => ({
        ...sample,
        sequenceIndex,
        ...invalid,
      })),
      invalid
    );
  }
  const samples = request.samples.map((sample, sequenceIndex) =>
    analyzeSample(request, sample, sequenceIndex)
  );
  return aggregateCycle(request, samples);
}

function validateRequest(request: CycleAnalysisRequest): CycleFailure | undefined {
  const points = request.materialPoints ?? [];
  if (
    !request.samples.length ||
    !['static', 'dynamic'].includes(request.mode) ||
    !request.member ||
    !request.recovery ||
    new Set(points.map((p) => p.id)).size !== points.length ||
    points.some(
      (p) =>
        !p.id ||
        !Number.isFinite(p.xi) ||
        p.xi < 0 ||
        p.xi > 1 ||
        !Number.isFinite(p.eta) ||
        Math.abs(p.eta) > 1 ||
        !['left', 'right'].includes(p.side)
    )
  ) {
    return {
      status: 'failed',
      stage: 'setup',
      code: 'invalid-cycle-request',
      message:
        'Supply samples, mode, member, recovery options, and unique fixed points with xi in [0,1], eta in [-1,1], and an explicit side.',
    };
  }
  return undefined;
}

function analyzeSample(
  request: CycleAnalysisRequest,
  sample: CycleSampleMetadata,
  sequenceIndex: number
): CycleSampleResult {
  const metadata = { ...sample, sequenceIndex };
  let stage: CycleFailure['stage'] = 'snapshot';
  const fail = (
    code: string,
    message: string,
    upstreamDiagnostics?: unknown
  ): CycleSampleResult => ({
    ...metadata,
    status: 'failed',
    stage,
    code,
    message,
    upstreamDiagnostics,
  });
  try {
    const input = request.readSample(sample, sequenceIndex);
    if (input.status !== 'ok') return { ...metadata, ...input };
    const { configuration, loadCase, motion } = input;
    stage = 'equilibrium';
    const equilibrium =
      request.mode === 'dynamic'
        ? analyzeDynamic(configuration, motion ?? [], loadCase)
        : analyzeStatic(configuration, loadCase);
    if (equilibrium.status !== 'ok')
      return fail(
        equilibrium.status,
        equilibrium.diagnostics.message ?? equilibrium.status,
        structuredClone(equilibrium.diagnostics)
      );
    stage = 'member-loads';
    const state = motion?.find((s) => s.linkId === request.member.bodyId);
    if (request.mode === 'dynamic' && !state)
      return fail('invalid-dynamic-state', 'The selected member has no motion state.');
    const loads =
      'mode' in equilibrium
        ? recoverDynamicMemberLoads(
            configuration,
            request.member,
            loadCase,
            equilibrium,
            state!,
            request.recovery
          )
        : recoverStaticMemberLoads(
            configuration,
            request.member,
            loadCase,
            equilibrium,
            request.recovery
          );
    if (loads.status !== 'ok') return fail(loads.status, loads.message);
    stage = 'stress';
    const stress = findMemberStressExtrema(loads, request.section, request.material);
    if (stress.status !== 'ok') return fail(stress.status, stress.message);
    const points = [];
    for (const point of request.materialPoints ?? []) {
      const value = evaluateMemberStress(
        loads,
        request.section,
        {
          xM: point.xi * loads.member.lengthM,
          yM: point.eta * stress.provenance.sectionProperties.extremeFiberM,
          side: point.side,
        },
        request.material
      );
      if (value.status !== 'ok') return fail(value.status, value.message);
      points.push({ id: point.id, stress: value });
    }
    return {
      ...metadata,
      status: 'ok',
      stress,
      points,
      memberLengthM: loads.member.lengthM,
      material: structuredClone(request.material ?? null),
      loadSource: { name: loadCase.name, gravityMPerS2: structuredClone(loadCase.gravityMPerS2) },
      diagnostics: { ...loads.diagnostics },
    };
  } catch (error) {
    return fail('sample-exception', error instanceof Error ? error.message : String(error));
  }
}
