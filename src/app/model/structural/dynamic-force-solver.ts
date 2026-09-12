import type { StructuralConfiguration } from './configuration';
import type { BodyDynamicState } from './dynamic-state';
import { analyzeEquilibrium, validateConfiguration } from './equilibrium-solver';
import { finiteVector, LoadCase } from './loads';
import { DynamicForceAnalysisResult, StructuralFailure, structuralFailure } from './results';

export function validateDynamicState(
  configuration: StructuralConfiguration,
  states: readonly BodyDynamicState[]
): StructuralFailure | undefined {
  const invalid = validateConfiguration(configuration);
  if (invalid) return invalid;
  if (configuration.bodies.some((body) => !body.massProperties)) {
    return structuralFailure(
      'invalid-properties',
      'Dynamics requires mass, CoM, and inertia for every moving body.'
    );
  }
  const ids = new Set(configuration.bodies.map((body) => body.id));
  if (!Array.isArray(states) || states.length !== ids.size) {
    return structuralFailure(
      'invalid-dynamic-state',
      'Supply exactly one acceleration state per moving root body.'
    );
  }
  for (const state of states) {
    if (
      !state ||
      !ids.delete(state.linkId) ||
      !finiteVector(state.centerOfMassAccelerationMPerS2) ||
      !Number.isFinite(state.angularAccelerationRadPerS2)
    ) {
      return structuralFailure(
        'invalid-dynamic-state',
        'Accelerations must be finite and identify each moving root body exactly once.'
      );
    }
  }
  return undefined;
}

/** Newton-Euler inverse dynamics. No velocities, geometry solving, or PMKS state required. */
export function analyzeDynamic(
  configuration: StructuralConfiguration,
  states: readonly BodyDynamicState[],
  loadCase: LoadCase
): DynamicForceAnalysisResult {
  const invalid = validateDynamicState(configuration, states);
  if (invalid) return { mode: 'dynamic', ...invalid };
  const byId = new Map(states.map((state) => [state.linkId, state]));
  const targets = configuration.bodies.map((body) => {
    const mass = body.massProperties!;
    const state = byId.get(body.id)!;
    return {
      centerOfMassM: mass.centerOfMassM,
      forceN: {
        x: mass.massKg * state.centerOfMassAccelerationMPerS2.x,
        y: mass.massKg * state.centerOfMassAccelerationMPerS2.y,
      },
      momentAboutCoMNm: mass.inertiaKgM2 * state.angularAccelerationRadPerS2,
    };
  });
  const result = analyzeEquilibrium(configuration, loadCase, targets);
  if (result.status !== 'ok') return { mode: 'dynamic', ...result };
  return {
    mode: 'dynamic',
    status: 'ok',
    diagnostics: result.diagnostics,
    jointReactions: result.jointReactions,
    driverReactions: result.driverReactions,
    bodyEquilibrium: result.bodyEquilibrium,
  };
}
