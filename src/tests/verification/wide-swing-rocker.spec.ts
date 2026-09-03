// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Joint } from '../../app/model/joint';
import { buildMechanism } from '../../test-utils/verification/fixture';
import { wideSwingRockerFixture } from '../../test-utils/verification/fixtures';

// A cycle was a count: 360 samples of a revolute input and the crank was home,
// so the cycle was closed -- whether or not the rest of the drawing was. This
// linkage is not. After one clockwise turn its crank is back where it started
// and every other joint is on the other assembly branch, half a mechanism
// away; 75 degrees further the input stops. The count called that a loop, the
// playback bar said "Loops", and the drawing teleported once a turn.
//
// An independent continuation of the configuration curve says what it is: a
// rocker with a 444-degree swing, its limits at -435.1 and +8.9 degrees of
// crank from the drawn pose. So it goes out 435 degrees, comes back the same
// way, goes 8 degrees past the start, and comes back again.
describe('a rocker whose swing is wider than a turn', () => {
  const { mechanism } = buildMechanism(wideSwingRockerFixture());
  const frames = mechanism.joints;
  const at = (t: number, id: string): Joint => frames[t].find((j) => j.id === id)!;
  const OUT = 435;
  const BACK = 8;

  it('reverses rather than looping', () => {
    expect(mechanism.isMechanismValid()).toBe(true);
    expect(mechanism.reciprocates).toBe(true);
    expect(frames.length).toBe(2 * (OUT + BACK) + 1);
  });

  it('is not home after one turn, which is why one turn is not its cycle', () => {
    const seam = Math.max(
      ...frames[0].map((joint, index) =>
        Math.hypot(frames[360][index].x - joint.x, frames[360][index].y - joint.y)
      )
    );
    // The crank pin is: it is the count that was wrong, not the crank.
    const crank = at(360, 'C');
    expect(Math.hypot(crank.x - at(0, 'C').x, crank.y - at(0, 'C').y)).toBeLessThan(1e-3);
    expect(seam).toBeGreaterThan(3);
  });

  it('comes home over the poses it went out on, to the digit', () => {
    // Out to the far limit and back: sample OUT + k retraces sample OUT - k.
    for (let k = 0; k <= OUT; k++) {
      const out = frames[OUT - k];
      const back = frames[OUT + k];
      out.forEach((joint, index) => {
        expect(back[index].x, `${joint.id} at ${k} from the limit`).toBe(joint.x);
        expect(back[index].y, `${joint.id} at ${k} from the limit`).toBe(joint.y);
      });
    }
    // Then the short leg, and home again on the very last sample.
    const last = frames[frames.length - 1];
    frames[0].forEach((joint, index) => {
      expect(last[index].x).toBe(joint.x);
      expect(last[index].y).toBe(joint.y);
    });
  });

  it('keeps every bar its length throughout', () => {
    // So a failure above is read as the wrong branch, not a linkage that came
    // apart: both branches are legal assemblies.
    for (const link of mechanism.links[0]) {
      const ids = link.joints.map((joint) => joint.id);
      for (let a = 0; a < ids.length; a++) {
        for (let b = a + 1; b < ids.length; b++) {
          const rest = Math.hypot(
            at(0, ids[a]).x - at(0, ids[b]).x,
            at(0, ids[a]).y - at(0, ids[b]).y
          );
          for (let t = 0; t < frames.length; t += 7) {
            const now = Math.hypot(
              at(t, ids[a]).x - at(t, ids[b]).x,
              at(t, ids[a]).y - at(t, ids[b]).y
            );
            expect(Math.abs(now - rest)).toBeLessThan(2e-3);
          }
        }
      }
    }
  });
});
