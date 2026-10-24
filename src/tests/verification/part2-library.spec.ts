import { MODEL_SCALE } from '../../app/model/render-scale';
import { buildMechanismAtScale } from '../../test-utils/verification/fixture';
import {
  hydraulicCrossheadFixture,
  offsetMountHatchFixture,
  reciprocatingSawFixture,
  slottedToolDriveFixture,
} from '../../test-utils/verification/part2-library-fixtures';

describe('part 2 library examples', () => {
  for (const make of [
    hydraulicCrossheadFixture,
    offsetMountHatchFixture,
    reciprocatingSawFixture,
    slottedToolDriveFixture,
  ]) {
    it(`${make.name} runs through a nontrivial motion`, () => {
      const fixture = make();
      fixture.joints.forEach((j) => {
        j.x *= MODEL_SCALE;
        j.y *= MODEL_SCALE;
      });
      for (const load of fixture.loads ?? []) {
        load.at[0] *= MODEL_SCALE;
        load.at[1] *= MODEL_SCALE;
      }
      const built = buildMechanismAtScale(fixture, 0.7 * MODEL_SCALE);

      expect(built.mechanism.isMechanismValid()).toBe(true);
      expect(built.mechanism.joints.length).toBeGreaterThan(20);
      if (fixture.loads?.length) {
        for (const mode of ['static', 'dynamic'] as const) {
          const series = built.mechanism.getForceAnalysis(mode);
          expect(series.diagnostic).toBeUndefined();
          expect(series.successfulFrames).toBe(series.frames.length);
        }
      }
    });
  }
});
