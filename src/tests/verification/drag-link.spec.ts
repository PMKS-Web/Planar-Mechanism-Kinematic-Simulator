// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Joint } from '../../app/model/joint';
import { buildMechanism } from '../../test-utils/verification/fixture';
import { DRAG_LINK, dragLinkFixture } from '../../test-utils/verification/workshop-fixtures';

// The claim this template makes is a negative one about the four-bar people
// already know: the output does *not* reverse. A spec that only checked the
// mechanism ran would pass just as happily on a crank-rocker, so the assertion
// that matters here is the unwrapped output angle closing a full turn.

describe('a drag-link four-bar', () => {
  const { mechanism } = buildMechanism(dragLinkFixture());
  const at = (t: number, id: string): Joint => mechanism.joints[t].find((j) => j.id === id)!;
  const frames = mechanism.joints.length;

  /** The output crank's angle at every frame, unwrapped so turns accumulate. */
  const outputAngles = (): number[] => {
    const angles: number[] = [];
    let previous = 0;
    let total = 0;
    for (let t = 0; t < frames; t++) {
      const raw = Math.atan2(at(t, 'C').y - at(t, 'D').y, at(t, 'C').x - at(t, 'D').x);
      if (t > 0) {
        let step = raw - previous;
        while (step > Math.PI) step -= 2 * Math.PI;
        while (step < -Math.PI) step += 2 * Math.PI;
        total += step;
      }
      previous = raw;
      angles.push(total);
    }
    return angles;
  };

  it('has one degree of freedom and solves', () => {
    expect(mechanism.dof).toBe(1);
    expect(mechanism.isMechanismValid()).toBe(true);
    // A revolute input that goes round closes on 360 one-degree samples.
    expect(frames).toBe(361);
    for (let t = 0; t < frames; t++) {
      for (const id of ['A', 'B', 'C', 'D']) {
        expect(Number.isFinite(at(t, id).x) && Number.isFinite(at(t, id).y)).toBe(true);
      }
    }
  });

  it('is Grashof with the frame as its shortest bar, which is what makes it a double crank', () => {
    const bars = [DRAG_LINK.frame, DRAG_LINK.driver, DRAG_LINK.coupler, DRAG_LINK.follower];
    const sorted = [...bars].sort((a, b) => a - b);
    expect(sorted[0]).toBe(DRAG_LINK.frame);
    // Strictly less, so there is no change point for the linkage to fall
    // through partway round.
    expect(sorted[0] + sorted[3]).toBeLessThan(sorted[1] + sorted[2]);
  });

  it('turns the output crank a full revolution instead of rocking it', () => {
    const angles = outputAngles();
    const swept = angles[frames - 1];
    expect(Math.abs(swept)).toBeCloseTo(2 * Math.PI, 2);
    // Rocking would show up as the unwrapped angle turning back on itself. It
    // never does: every step carries on the same way as the first.
    const forward = swept > 0;
    for (let t = 1; t < frames; t++) {
      const step = angles[t] - angles[t - 1];
      expect(forward ? step : -step, `output reversed at frame ${t}`).toBeGreaterThan(0);
    }
  });

  it('runs the output at a markedly uneven rate, which is what it is for', () => {
    const angles = outputAngles();
    const steps: number[] = [];
    for (let t = 1; t < frames; t++) steps.push(Math.abs(angles[t] - angles[t - 1]));
    // One degree of input per sample, so a step is directly the output-to-input
    // rate in radians. Better than four to one between the slow and fast halves.
    expect(Math.max(...steps) / Math.min(...steps)).toBeGreaterThan(4);
  });

  it('keeps every bar its own length', () => {
    const spans: [string, string, number][] = [
      ['A', 'B', DRAG_LINK.driver],
      ['B', 'C', DRAG_LINK.coupler],
      ['C', 'D', DRAG_LINK.follower],
      ['A', 'D', DRAG_LINK.frame],
    ];
    for (let t = 0; t < frames; t++) {
      for (const [a, b, length] of spans) {
        const now = Math.hypot(at(t, a).x - at(t, b).x, at(t, a).y - at(t, b).y);
        expect(Math.abs(now - length), `|${a}${b}| at frame ${t}`).toBeLessThan(2e-3);
      }
    }
  });

  it('comes round in six seconds, which is a pace worth watching', () => {
    expect(mechanism.cyclePeriod).toBeGreaterThan(5);
    expect(mechanism.cyclePeriod).toBeLessThan(8);
  });

  it('carries no mass, so nothing distracts from the kinematics', () => {
    for (const link of mechanism.links[0]) {
      expect(link.mass).toBe(0);
    }
  });
});
