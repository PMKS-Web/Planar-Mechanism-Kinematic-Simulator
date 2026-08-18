import { buildMechanism } from '../../test-utils/verification/fixture';
import { stephensonIiiEx2Fixture, wattIFixture } from '../../test-utils/verification/fixtures';

/**
 * Adaptive sampling: a rocking input's small arc is cut into a full cycle's
 * worth of samples instead of a degree apiece, so a linkage that barely moves
 * does not animate in a handful of frames.
 *
 * The refinement re-walks an arc the coarse pass has already measured, and a
 * coarse limit is wherever the solver failed -- sometimes a genuine toggle,
 * sometimes a fold too sharp for a one-degree seed. A finer step walks through
 * such a fold into arc the coarse pass never saw, so the refined pass must
 * prove it closes a cycle or the coarse one is kept. Watt I is the standing
 * example: its coarse read is a 20-sample sliver, and the fine pass sails off
 * it, so the sliver is what the reader keeps seeing.
 */
describe('adaptive sampling of rocking inputs', () => {
  it('cuts a genuine rocker cycle into a full complement of samples', () => {
    const degree = buildMechanism(stephensonIiiEx2Fixture()).mechanism;
    const adaptive = buildMechanism(stephensonIiiEx2Fixture(), 'adaptive').mechanism;

    expect(adaptive.isMechanismValid()).toBe(true);
    expect(degree.joints.length).toBeLessThan(240);
    expect(adaptive.joints.length).toBeGreaterThan(300);

    // The same mechanism, denser: it starts in the same pose and comes home.
    degree.joints[0].forEach((joint, index) => {
      const twin = adaptive.joints[0][index];
      expect(twin.x).toBeCloseTo(joint.x, 6);
      expect(twin.y).toBeCloseTo(joint.y, 6);
    });
    const last = adaptive.joints[adaptive.joints.length - 1];
    adaptive.joints[0].forEach((joint, index) => {
      expect(Math.hypot(last[index].x - joint.x, last[index].y - joint.y)).toBeLessThan(0.05);
    });
  });

  it('keeps the coarse cycle when the fine pass does not close one', () => {
    const degree = buildMechanism(wattIFixture()).mechanism;
    const adaptive = buildMechanism(wattIFixture(), 'adaptive').mechanism;

    expect(adaptive.isMechanismValid()).toBe(true);
    expect(adaptive.joints.length).toBe(degree.joints.length);
  });
});
