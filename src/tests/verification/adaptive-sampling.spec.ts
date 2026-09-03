import { buildMechanism } from '../../test-utils/verification/fixture';
import { stephensonIiiEx2Fixture, wattIFixture } from '../../test-utils/verification/fixtures';

/**
 * Adaptive sampling: a rocking input's small arc is cut into a full cycle's
 * worth of samples instead of a degree apiece, so a linkage that barely moves
 * does not animate in a handful of frames.
 *
 * The refinement re-walks an arc the coarse pass has already measured, and a
 * coarse limit is wherever the solver failed -- sometimes a genuine toggle,
 * sometimes a fold too sharp for a one-degree seed. A finer step can walk
 * through such a fold into arc the coarse pass never saw, so the refined pass
 * must prove it closes a cycle or the coarse one is kept. Watt I is the
 * standing example of a sliver: eleven degrees of swing, twenty samples at a
 * degree each, and a fine pass that once wandered off it.
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

  it('refines a sliver of a swing into a full cycle, walking the same arc', () => {
    // Watt I's crank swings eleven degrees between two limits, so at a degree
    // a sample its cycle is a twenty-sample sliver. The fine pass used to sail
    // off that arc: at the limit the two assembly branches meet, and the walk
    // back, re-solved from a pose that close to the fold, took the other one
    // as often as not -- out into the 168-degree lobe the sliver's branch
    // never visits, and on until the sample cap called the whole thing broken.
    // The coarse sliver was kept as the lesser evil. The walk back is now put
    // on the poses the walk out found, so the fine pass closes the same arc.
    const degree = buildMechanism(wattIFixture()).mechanism;
    const adaptive = buildMechanism(wattIFixture(), 'adaptive').mechanism;

    expect(degree.joints.length).toBeLessThan(30);
    expect(adaptive.isMechanismValid()).toBe(true);
    expect(adaptive.reciprocates).toBe(true);
    expect(adaptive.joints.length).toBeGreaterThan(300);

    // The same swing: the crank pin reaches the same two extremes, to within
    // one coarse sample, and no further.
    const pivot = degree.joints[0].find((joint) => joint.id === 'A')!;
    const angles = (mechanism: typeof degree) =>
      mechanism.joints.map((frame) => {
        const pin = frame.find((joint) => joint.id === 'B')!;
        return Math.atan2(pin.y - pivot.y, pin.x - pivot.x);
      });
    const coarse = angles(degree);
    const fine = angles(adaptive);
    expect(Math.max(...fine)).toBeCloseTo(Math.max(...coarse), 1);
    expect(Math.min(...fine)).toBeCloseTo(Math.min(...coarse), 1);

    // And it comes home exactly, because the way home is the way out.
    const last = adaptive.joints[adaptive.joints.length - 1];
    adaptive.joints[0].forEach((joint, index) => {
      expect(last[index].x).toBe(joint.x);
      expect(last[index].y).toBe(joint.y);
    });
  });
});
