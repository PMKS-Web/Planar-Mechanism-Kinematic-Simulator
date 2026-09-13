import { buildMechanism } from './fixture';
import { structuralCrankFixture } from './structural-fixtures';
import { memberAB, noMemberLoad, uniformAB } from './member-verification';
import { stressRectangle } from './stress-verification';
import { LengthUnit } from '../../app/model/unit-enums';
import type { PmksCycleRequest } from '../../app/model/structural/pmks-cycle-analysis';
import type {
  CycleAnalysisResult,
  SuccessfulCycleSample,
} from '../../app/model/structural/cycle-results';

/** Parameterization of the published structural crank; no new verification geometry. */
export function crankCycle(): PmksCycleRequest {
  const fixture = structuralCrankFixture();
  fixture.load = undefined;
  fixture.inputAngVel = 2;
  const mechanism = buildMechanism(fixture).mechanism;
  return {
    mechanism,
    sampleIndices: mechanism.joints.map((_, i) => i),
    lengthUnit: LengthUnit.METER,
    coordinateSpace: 'project',
    member: memberAB,
    mode: 'dynamic',
    section: stressRectangle,
    material: { name: 'Test steel', yieldStrengthPa: 250e6 },
    recovery: { massDistribution: uniformAB, gravityModel: 'uniform-line' },
    loading: { kind: 'saved-load-case', loadCase: noMemberLoad },
    materialPoints: [-1, 0, 1].map((eta) => ({ id: String(eta), xi: 0.5, eta, side: 'right' })),
  };
}
export function cycleSamples(result: CycleAnalysisResult): SuccessfulCycleSample[] {
  if (result.status !== 'complete') throw new Error(JSON.stringify(result.gaps.slice(0, 2)));
  return result.samples as SuccessfulCycleSample[];
}
export function relativeClose(actual: number, expected: number, tolerance = 1e-8): void {
  // Allow 10 micro-Pa at analytical zero after hundreds of trigonometric steps.
  expect(Math.abs(actual - expected)).toBeLessThan(
    1e-5 + tolerance * Math.max(1, Math.abs(expected))
  );
}

export function freezeGraph(value: unknown, seen = new WeakSet<object>()): void {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  Object.values(value).forEach((child) => freezeGraph(child, seen));
  Object.freeze(value);
}
