import { buildMechanism } from '../../../test-utils/verification/fixture';
import { stephensonIiiEx2Fixture } from '../../../test-utils/verification/fixtures';
import {
  squareRodSliderCrankFixture,
  ellipticalTrammelFixture,
  cylinderBoomFixture,
} from '../../../test-utils/verification/slot-fixtures';
import { crankCycle, relativeClose } from '../../../test-utils/verification/cycle-verification';
import { pmksCycleMetadata } from './pmks-cycle-metadata';
import { analyzePmksCycle } from './pmks-cycle-analysis';
import { MODEL_SCALE } from '../render-scale';

describe('S5 actual drive and sequence metadata', () => {
  it('uses unwrapped geometric driver angles independent of subset order and reverse playback', () => {
    const request = crankCycle();
    const indices = [360, 270, 0, 90];
    const original = pmksCycleMetadata(request.mechanism, indices, request);
    const reverse = pmksCycleMetadata(request.mechanism.withReversedDrive()!, indices, request);
    expect(reverse).toEqual(original);
    expect(original.sequence).toMatchObject({
      order: 'explicit',
      reverses: null,
      closure: 'open',
      coversAllSolvedSamples: false,
    });
    const sample = original.samples[0].drive;
    if (sample.kind !== 'angle') throw new Error('No angle');
    relativeClose(sample.canonicalRad, 0);
    relativeClose(sample.unwrappedRad, 2 * Math.PI);
    const backward = pmksCycleMetadata(request.mechanism, [360, 270, 180, 90, 0], request);
    expect(backward.sequence.order).toBe('reverse');
    expect(backward.samples.map((s) => s.timeSeconds)).toEqual(
      [Math.PI, (3 * Math.PI) / 4, Math.PI / 2, Math.PI / 4, 0].map((t) => expect.closeTo(t, 8))
    );
  });

  it('identifies the 199-sample reversing sixbar without inventing a full turn', () => {
    const mechanism = buildMechanism(stephensonIiiEx2Fixture()).mechanism;
    const metadata = pmksCycleMetadata(
      mechanism,
      mechanism.joints.map((_, i) => i),
      crankCycle()
    );
    expect(metadata.samples).toHaveLength(199);
    expect(metadata.sequence.reverses).toBe(true);
    const angles = metadata.samples.map((s) =>
      s.drive.kind === 'angle' ? s.drive.unwrappedRad : NaN
    );
    expect(Math.max(...angles) - Math.min(...angles)).toBeLessThan(Math.PI);
    expect(metadata.samples[0].drive).toMatchObject({
      kind: 'angle',
      jointId: mechanism.joints[0].find((j) => 'input' in j && j.input)!.id,
    });
  });

  it('retains both turns of the 721-sample branch-swapping slider crank', () => {
    const mechanism = buildMechanism(squareRodSliderCrankFixture()).mechanism;
    const metadata = pmksCycleMetadata(mechanism, [0, 360, 720], crankCycle());
    expect(mechanism.joints).toHaveLength(721);
    const angles = metadata.samples.map((s) =>
      s.drive.kind === 'angle' ? s.drive.unwrappedRad : NaN
    );
    relativeClose(Math.abs(angles[2] - angles[0]), 4 * Math.PI);
    relativeClose(Math.abs(angles[1] - angles[0]), 2 * Math.PI);
  });

  it('reports prismatic displacement with its reference while preserving the structural slider refusal', () => {
    const fixture = ellipticalTrammelFixture(true, MODEL_SCALE);
    const mechanism = buildMechanism(fixture).mechanism;
    const request = {
      ...crankCycle(),
      mechanism,
      coordinateSpace: 'model' as const,
      sampleIndices: mechanism.joints.map((_, i) => i),
    };
    const metadata = pmksCycleMetadata(mechanism, request.sampleIndices, request);
    expect(metadata.samples[0].drive).toMatchObject({
      kind: 'length',
      displacementM: 0,
      reference: 'initial-position-along-slot',
    });
    expect(
      metadata.samples.some(
        (s) => s.drive.kind === 'length' && Math.abs(s.drive.displacementM) > 0.01
      )
    ).toBe(true);
    const result = analyzePmksCycle({ ...request, sampleIndices: [0, 1] });
    expect(result.status).toBe('failed');
    expect(result.samples[0]).toMatchObject({
      stage: 'snapshot',
      code: 'unsupported-joint-type',
      drive: { kind: 'length' },
    });
    const floating = buildMechanism(cylinderBoomFixture(MODEL_SCALE)).mechanism;
    expect(pmksCycleMetadata(floating, [0], request).samples[0].drive).toMatchObject({
      kind: 'unavailable',
      reason: 'A floating prismatic drive has no supported displacement reference in S5.',
    });
  });
});
