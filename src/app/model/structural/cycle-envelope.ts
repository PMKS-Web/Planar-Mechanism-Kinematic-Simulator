import type {
  CycleAnalysisRequest,
  CycleAnalysisResult,
  CycleSampleResult,
  CycleFailure,
  SuccessfulCycleSample,
  CycleEnvelope,
  CycleBoundWitness,
  SignedHistoryStatistics,
} from './cycle-results';

/** Stable ties: first requested sample wins. No sorting, interpolation, or zero filling. */
export function aggregateCycle(
  request: CycleAnalysisRequest,
  samples: readonly CycleSampleResult[],
  setupFailure?: CycleFailure
): CycleAnalysisResult {
  const good = samples.filter((s): s is SuccessfulCycleSample => s.status === 'ok');
  const variants = new Set(
    good.map((s) =>
      JSON.stringify({
        ...s.stress.provenance,
        material: s.material,
        gravity: s.loadSource.gravityMPerS2,
        criterionStatus: s.stress.conservativeYieldCriterion.status,
      })
    )
  );
  const gaps: {
    startSequenceIndex: number;
    endSequenceIndex: number;
    failures: Extract<CycleSampleResult, { status: 'failed' }>[];
  }[] = [];
  samples.forEach((sample, i) => {
    if (sample.status === 'ok') return;
    const last = gaps[gaps.length - 1];
    if (last && last.endSequenceIndex === i - 1) {
      last.endSequenceIndex = i;
      last.failures.push(sample);
    } else gaps.push({ startSequenceIndex: i, endSequenceIndex: i, failures: [sample] });
  });
  const fraction = samples.length ? good.length / samples.length : 0;
  return {
    status:
      setupFailure || !good.length
        ? 'failed'
        : good.length === samples.length
          ? 'complete'
          : 'incomplete',
    coverageKind: 'sampled',
    sequence: structuredClone(request.sequence),
    setupFailure,
    requestedAnalysis: structuredClone({
      member: request.member,
      mode: request.mode,
      section: request.section,
      material: request.material,
      recovery: request.recovery,
      materialPoints: request.materialPoints,
    }),
    coverage: {
      requested: samples.length,
      successful: good.length,
      failed: samples.length - good.length,
      fraction,
      percent: 100 * fraction,
    },
    gaps,
    provenance: {
      status: variants.size > 1 ? 'heterogeneous' : variants.size ? 'consistent' : 'unavailable',
      variantCount: variants.size,
    },
    samples,
    envelope: good.length ? envelope(good, variants.size === 1) : null,
    histories: (request.materialPoints ?? []).map((point) => ({
      point: { ...point },
      entries: samples.map((s) =>
        s.status === 'failed'
          ? s
          : {
              ...metadata(s),
              status: 'ok' as const,
              stress: s.points.find((p) => p.id === point.id)!.stress,
            }
      ),
      statistics: good.length
        ? {
            scope: 'successful-requested-samples' as const,
            normal: statistics(
              good.map((s) => s.points.find((p) => p.id === point.id)!.stress.normalStressPa)
            ),
            shear: statistics(
              good.map(
                (s) => s.points.find((p) => p.id === point.id)!.stress.transverseShearStressPa
              )
            ),
          }
        : null,
    })),
  };
}

function metadata(s: CycleSampleResult) {
  return {
    sampleIndex: s.sampleIndex,
    sequenceIndex: s.sequenceIndex,
    timeSeconds: s.timeSeconds,
    drive: s.drive,
  };
}
function maximum<T>(items: readonly T[], value: (item: T) => number): T {
  return items.reduce((best, item) => (value(item) > value(best) ? item : best));
}
function bound(s: SuccessfulCycleSample): CycleBoundWitness {
  return {
    sample: metadata(s),
    upperBoundPa: s.stress.diagnostics.vonMisesUpperBoundPa,
    attainedWitness: s.stress.maximumVonMises,
    diagnostics: s.stress.diagnostics,
    criterion: s.stress.conservativeYieldCriterion,
  };
}
function envelope(samples: readonly SuccessfulCycleSample[], consistent: boolean): CycleEnvelope {
  const attained = (
    key:
      | 'maximumTensileNormal'
      | 'maximumCompressiveNormal'
      | 'maximumAbsoluteNormal'
      | 'maximumAbsoluteShear'
      | 'maximumVonMises'
  ) => {
    const sample = maximum(samples, (s) => s.stress[key].valuePa);
    return { sample: metadata(sample), extremum: sample.stress[key] };
  };
  const usableYield =
    consistent && samples.every((s) => s.stress.conservativeYieldCriterion.status === 'available');
  return {
    scope: 'successful-requested-samples',
    maximumTensileNormal: attained('maximumTensileNormal'),
    maximumCompressiveNormal: attained('maximumCompressiveNormal'),
    maximumAbsoluteNormal: attained('maximumAbsoluteNormal'),
    maximumAbsoluteShear: attained('maximumAbsoluteShear'),
    maximumVonMises: attained('maximumVonMises'),
    maximumConservativeVonMises: bound(
      maximum(samples, (s) => s.stress.diagnostics.vonMisesUpperBoundPa)
    ),
    yield: usableYield
      ? {
          status: 'available',
          governing: bound(
            maximum(samples, (s) => {
              const criterion = s.stress.conservativeYieldCriterion;
              return criterion.status === 'available' ? criterion.utilization : -Infinity;
            })
          ),
        }
      : {
          status: 'unavailable',
          reason: consistent
            ? 'One or more successful samples lack a usable yield criterion.'
            : 'Successful samples have heterogeneous analysis provenance.',
        },
  };
}
function statistics(values: readonly number[]): SignedHistoryStatistics {
  const minimumPa = values.reduce((a, b) => Math.min(a, b));
  const maximumPa = values.reduce((a, b) => Math.max(a, b));
  const rangePa = maximumPa - minimumPa;
  return {
    minimumPa,
    maximumPa,
    rangePa,
    midrangePa: (maximumPa + minimumPa) / 2,
    amplitudePa: rangePa / 2,
  };
}
