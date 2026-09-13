import type { Mechanism } from '../mechanism/mechanism';
import type { LoadCase } from './loads';
import {
  loadCaseFromPmksForces,
  PmksStructuralFrame,
  snapshotPmksConfiguration,
} from './pmks-configuration';
import { snapshotPmksMemberMotion } from './pmks-dynamic-state';
import { pmksCycleMetadata } from './pmks-cycle-metadata';
import { analyzeCycle } from './cycle-analysis';
import type { CycleAnalysisOptions, CycleAnalysisResult, CycleSampleInput } from './cycle-results';

export interface PmksCycleRequest extends CycleAnalysisOptions {
  /** This object IS the selected partition; never inferred from UI state or mechanisms[0]. */
  readonly mechanism: Mechanism;
  readonly sampleIndices: readonly number[];
  readonly lengthUnit: PmksStructuralFrame['lengthUnit'];
  readonly coordinateSpace: PmksStructuralFrame['coordinateSpace'];
  readonly loading:
    | { readonly kind: 'saved-load-case'; readonly loadCase: LoadCase }
    | {
        readonly kind: 'pmks-forces';
        readonly name: string;
        readonly gravityMPerS2?: LoadCase['gravityMPerS2'];
      };
}

export function analyzePmksCycle(request: PmksCycleRequest): CycleAnalysisResult {
  const metadata = pmksCycleMetadata(request.mechanism, request.sampleIndices, request);
  return analyzeCycle({
    ...request,
    ...metadata,
    readSample: ({ sampleIndex }): CycleSampleInput => {
      const { mechanism } = request;
      if (
        !Number.isInteger(sampleIndex) ||
        sampleIndex < 0 ||
        !mechanism.joints[sampleIndex] ||
        !mechanism.links[sampleIndex] ||
        !Number.isFinite(mechanism.timeNum[sampleIndex])
      ) {
        return {
          status: 'failed',
          stage: 'snapshot',
          code: 'invalid-sample',
          message: 'Select an existing solved sample with a finite time.',
        };
      }
      const frame: PmksStructuralFrame = {
        joints: mechanism.joints[sampleIndex],
        links: mechanism.links[sampleIndex],
        lengthUnit: request.lengthUnit,
        coordinateSpace: request.coordinateSpace,
      };
      // Native Force instances already moved with this frame. Convert each matching frame, never zero once.
      if (request.loading.kind === 'pmks-forces' && !mechanism.forces[sampleIndex])
        return {
          status: 'failed',
          stage: 'snapshot',
          code: 'missing-force-sample',
          message: 'The selected sample has no native force snapshot.',
        };
      const loadCase =
        request.loading.kind === 'saved-load-case'
          ? request.loading.loadCase
          : {
              ...loadCaseFromPmksForces(frame, mechanism.forces[sampleIndex], request.loading.name),
              gravityMPerS2: request.loading.gravityMPerS2,
            };
      if (request.mode === 'dynamic') {
        const snapshot = snapshotPmksMemberMotion({ ...request, sampleIndex });
        if (snapshot.status !== 'ok')
          return {
            status: 'failed',
            stage: 'snapshot',
            code: snapshot.status,
            message: snapshot.message,
          };
        return {
          status: 'ok',
          configuration: snapshot.configuration,
          loadCase,
          motion: snapshot.states,
        };
      }
      const snapshot = snapshotPmksConfiguration(frame);
      if (snapshot.status !== 'ok')
        return {
          status: 'failed',
          stage: 'snapshot',
          code: snapshot.status,
          message: snapshot.message,
        };
      return { status: 'ok', configuration: snapshot.configuration, loadCase };
    },
  });
}
