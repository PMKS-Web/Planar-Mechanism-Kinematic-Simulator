// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Joint } from '../../app/model/joint';
import { buildMechanismAtScale } from '../../test-utils/verification/fixture';
import { parallelGripperFixture } from '../../test-utils/verification/slot-fixtures';
import { MODEL_SCALE } from '../../app/model/render-scale';

/**
 * A gripper has to grip.
 *
 * The drawing this replaced satisfied every test written for it — its members
 * kept their lengths, both of its arms moved, its jaw gap changed — and still
 * did the wrong thing, because none of those asks whether the jaws move
 * *toward each other*. Played back it lifted the whole assembly four units up
 * the screen while the gap between the tips changed by half of one. So the
 * assertions here are about the pair rather than about each jaw: the gap has
 * to change, and the midpoint between the tips has to stay where it is.
 */

const S = MODEL_SCALE;

interface Frame {
  at: (id: string) => Joint;
}

function frames(): Frame[] {
  // Built at model scale, and at the object scale the drawn guide is measured
  // against. A grounded guide's length is in mark units, so a fixture built in
  // user units gives the ram a slot thousands of times its own travel and the
  // solver reports a dead position at the first step.
  const { mechanism } = buildMechanismAtScale(parallelGripperFixture(S), 1 * MODEL_SCALE);
  return mechanism.joints.map((joint) => ({
    at: (id: string) => joint.find((candidate) => candidate.id === id)!,
  }));
}

const distance = (a: Joint, b: Joint) => Math.hypot(a.x - b.x, a.y - b.y) / S;

describe('a gripper whose jaws stay parallel', () => {
  const solved = frames();

  it('simulates at all', () => {
    expect(solved.length).toBeGreaterThan(20);
  });

  it('keeps every member the length it was drawn', () => {
    const bars: [string, string][] = [
      ['B', 'D'],
      ['C', 'E'],
      ['D', 'E'],
      ['E', 'F'],
      ['A', 'D'],
      ['G', 'I'],
      ['H', 'J'],
      ['I', 'J'],
      ['J', 'K'],
      ['A', 'I'],
    ];
    for (const [from, to] of bars) {
      const spans = solved.map((frame) => distance(frame.at(from), frame.at(to)));
      const drift = Math.max(...spans) - Math.min(...spans);
      expect(drift / spans[0]).toBeLessThan(1e-3);
    }
  });

  it('closes its jaws on each other rather than carrying them along', () => {
    const gaps = solved.map((frame) => (frame.at('F').y - frame.at('K').y) / S);
    const middles = solved.map((frame) => (frame.at('F').y + frame.at('K').y) / 2 / S);
    const swing = Math.max(...gaps) - Math.min(...gaps);
    const drift = Math.max(...middles) - Math.min(...middles);
    // The gap has to be the motion, and the drift has to be nothing: the two
    // jaws are mirror images driven from a pin on their mirror line, so
    // whatever one does the other does upside down and the midpoint cannot
    // move at all.
    expect(swing).toBeGreaterThan(0.5);
    expect(drift).toBeLessThan(1e-6);
  });

  it('keeps each jaw at the attitude it was drawn', () => {
    // What the parallelogram is for. A jaw hung on one bar would swing; hung
    // on two equal bars it is carried without turning, so its two pins stay
    // level with each other however far it travels.
    for (const [near, far] of [
      ['D', 'E'],
      ['I', 'J'],
    ]) {
      // As a share of the jaw's own span rather than an absolute distance: the
      // solver carries a few parts per million over a run, and a jaw that had
      // actually turned would show a rise of the same order as its length.
      const span = distance(solved[0].at(near), solved[0].at(far));
      const tilts = solved.map((frame) => Math.abs(frame.at(far).y - frame.at(near).y) / S);
      expect(Math.max(...tilts) / span).toBeLessThan(1e-4);
    }
  });
});
