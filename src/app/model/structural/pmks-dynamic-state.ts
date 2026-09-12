import type { Mechanism } from '../mechanism/mechanism';
import { MODEL_SCALE } from '../render-scale';
import { siUnitFactorsForLength } from '../unit-conversions';
import type { StructuralConfiguration } from './configuration';
import { analyzeDynamic, validateDynamicState } from './dynamic-force-solver';
import { validateConfiguration } from './equilibrium-solver';
import type { BodyDynamicState } from './dynamic-state';
import type { LoadCase } from './loads';
import { PmksStructuralFrame, snapshotPmksConfiguration } from './pmks-configuration';
import { DynamicForceAnalysisResult, StructuralFailure, structuralFailure } from './results';

/** The mechanism object is the explicitly selected partition, never an implicit index zero. */
export interface PmksDynamicSample {
  readonly mechanism: Mechanism;
  readonly sampleIndex: number;
  readonly lengthUnit: PmksStructuralFrame['lengthUnit'];
  readonly coordinateSpace: PmksStructuralFrame['coordinateSpace'];
}

export type DynamicStateSnapshot =
  | {
      readonly status: 'ok';
      readonly sampleIndex: number;
      readonly timeSeconds: number;
      readonly accelerationSource: 'pmks-analytical';
      readonly configuration: StructuralConfiguration;
      readonly states: readonly BodyDynamicState[];
    }
  | StructuralFailure;

/** Copy authoritative root properties and analytical accelerations for exactly this sample. */
export function snapshotPmksDynamicState(sample: PmksDynamicSample): DynamicStateSnapshot {
  const { mechanism, sampleIndex } = sample;
  if (
    !mechanism ||
    !Number.isInteger(sampleIndex) ||
    sampleIndex < 0 ||
    !mechanism.joints[sampleIndex] ||
    !mechanism.links[sampleIndex] ||
    !Number.isFinite(mechanism.timeNum[sampleIndex]) ||
    !Number.isFinite(mechanism.inputAngularVelocities[sampleIndex])
  ) {
    return structuralFailure(
      'invalid-dynamic-state',
      'Select an existing solved sample with a finite time and input rate.'
    );
  }
  const snapshot = snapshotPmksConfiguration({
    joints: mechanism.joints[sampleIndex],
    links: mechanism.links[sampleIndex],
    lengthUnit: sample.lengthUnit,
    coordinateSpace: sample.coordinateSpace,
  });
  if (snapshot.status !== 'ok') return structuralFailure(snapshot.status, snapshot.message);
  const { configuration } = snapshot;
  const invalidConfiguration = validateConfiguration(configuration);
  if (invalidConfiguration) return invalidConfiguration;
  const distance =
    siUnitFactorsForLength(sample.lengthUnit).distanceToM /
    (sample.coordinateSpace === 'model' ? MODEL_SCALE : 1);
  try {
    const rates = mechanism.snapshotAccelerations(sampleIndex);
    const states = configuration.bodies.map((body): BodyDynamicState => {
      const acceleration = rates.linkAccelerations.get(body.id);
      return {
        linkId: body.id,
        centerOfMassAccelerationMPerS2: {
          x: acceleration ? acceleration[0] * distance : NaN,
          y: acceleration ? acceleration[1] * distance : NaN,
        },
        angularAccelerationRadPerS2: rates.linkAngularAccelerations.get(body.id) ?? NaN,
      };
    });
    const invalid = validateDynamicState(configuration, states);
    if (invalid) return invalid;
    return {
      status: 'ok',
      sampleIndex,
      timeSeconds: mechanism.timeNum[sampleIndex],
      accelerationSource: 'pmks-analytical',
      configuration,
      states,
    };
  } catch (error) {
    return structuralFailure(
      'invalid-dynamic-state',
      'Analytical accelerations are unavailable: ' + (error as Error).message
    );
  }
}

export function analyzePmksDynamicFrame(
  sample: PmksDynamicSample,
  loadCase: LoadCase
): DynamicForceAnalysisResult {
  const snapshot = snapshotPmksDynamicState(sample);
  return snapshot.status === 'ok'
    ? analyzeDynamic(snapshot.configuration, snapshot.states, loadCase)
    : { mode: 'dynamic', ...snapshot };
}
