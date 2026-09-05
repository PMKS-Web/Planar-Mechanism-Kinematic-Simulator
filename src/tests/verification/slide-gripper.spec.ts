// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Joint } from '../../app/model/joint';
import { buildMechanismAtScale } from '../../test-utils/verification/fixture';
import { slideGripperFixture } from '../../test-utils/verification/slot-fixtures';
import { MODEL_SCALE } from '../../app/model/render-scale';
import {
  fillRatesByDifference,
  SampleRates,
} from '../../app/model/mechanism/finite-difference-kinematics';
import { Mechanism } from '../../app/model/mechanism/mechanism';

// A parallel gripper the way a manufacturer draws one: a carriage on the ram,
// two vertical rails, and a jaw each side hung from the carriage by two equal
// links whose far pins ride the rails. The rails hold each jaw level and the
// links turn the carriage's travel into the jaw's. Drawn after a reference
// gripper (MotionGen, 5 Sep 2026); it is the library's Parallel Gripper.
//
// Checked without a second solver: that the thing it is drawn to do, it does.
// The jaws stay level, the rail pins stay on their rails, the two jaws mirror
// each other, and one stroke of the ram carries the tips from a hand's width
// apart to touching and back.

const S = MODEL_SCALE;

let built: Mechanism;

function frames(): ((id: string) => Joint)[] {
  // objectScale is process-wide and the ram's stroke is measured against it.
  const { mechanism } = buildMechanismAtScale(slideGripperFixture(S), 1 * S);
  expect(mechanism.isMechanismValid()).toBe(true);
  expect(mechanism.dof).toBe(1);
  built = mechanism;
  return mechanism.joints.map((joint) => (id: string) => joint.find((one) => one.id === id)!);
}

const emptyRates = (): SampleRates => ({
  jointVel: new Map(),
  jointAcc: new Map(),
  linkCoM: new Map(),
  linkVel: new Map(),
  linkAcc: new Map(),
  linkAngPos: new Map(),
  linkAngVel: new Map(),
  linkAngAcc: new Map(),
});

describe('a gripper on rails', () => {
  const solved = frames();
  const gap = (at: (id: string) => Joint) => (at('S').y - at('X').y) / S;

  it('runs a whole cycle', () => {
    expect(solved.length).toBeGreaterThan(300);
  });

  it('keeps each jaw level: the two rail pins never drift apart vertically', () => {
    const rest = (solved[0]('Q').y - solved[0]('M').y) / S;
    for (const at of solved) {
      expect((at('Q').y - at('M').y) / S).toBeCloseTo(rest, 2);
      expect((at('V').y - at('T').y) / S).toBeCloseTo(-rest, 2);
    }
  });

  it('keeps every rail pin on its rail', () => {
    for (const at of solved) {
      expect(at('M').x / S).toBeCloseTo(at('K').x / S, 3);
      expect(at('T').x / S).toBeCloseTo(at('K').x / S, 3);
      expect(at('Q').x / S).toBeCloseTo(at('O').x / S, 3);
      expect(at('V').x / S).toBeCloseTo(at('O').x / S, 3);
    }
  });

  it('mirrors the two jaws about the axis', () => {
    for (const at of solved) {
      expect(at('S').y / S).toBeCloseTo(-at('X').y / S, 2);
      expect(at('S').x / S).toBeCloseTo(at('X').x / S, 2);
    }
  });

  it('has a velocity and an acceleration at every joint and sample, read off the poses', () => {
    // No chain of dyads reaches this mechanism, so the analytic rate solver
    // leaves every joint blank; the graphs fill the blanks by differencing
    // the solved positions. Every value is finite, and the velocity agrees
    // with a difference quotient of the position it came from.
    const count = built.joints.length;
    for (let t = 0; t < count; t += 17) {
      const rates = emptyRates();
      fillRatesByDifference(built, t, rates);
      for (const joint of built.joints[t]) {
        const v = rates.jointVel.get(joint.id)!;
        const a = rates.jointAcc.get(joint.id)!;
        expect(v.every(Number.isFinite), `${joint.id} velocity at ${t}`).toBe(true);
        expect(a.every(Number.isFinite), `${joint.id} acceleration at ${t}`).toBe(true);
      }
      if (t > 0 && t < count - 1) {
        const s = solved[t];
        const before = solved[t - 1];
        const after = solved[t + 1];
        const dt = built.timeNum[t + 1] - built.timeNum[t - 1];
        const quotient = (after('S').y - before('S').y) / dt;
        expect(rates.jointVel.get('S')![1]).toBeCloseTo(quotient, 3);
        expect(rates.linkAngVel.get('GM')).toBeDefined();
        void s;
      }
    }
    // Something moves: the jaw tip's speed is not zero over the stroke.
    const peak = Math.max(
      ...Array.from({ length: count }, (_, t) => {
        const rates = emptyRates();
        fillRatesByDifference(built, t, rates);
        return Math.hypot(...rates.jointVel.get('S')!);
      })
    );
    expect(peak).toBeGreaterThan(0);
  });

  it('closes the tips to touching and opens them a hand apart, once per stroke', () => {
    const gaps = solved.map(gap);
    const narrowest = Math.min(...gaps);
    const widest = Math.max(...gaps);
    expect(narrowest).toBeGreaterThanOrEqual(0);
    expect(narrowest).toBeLessThan(0.05);
    expect(widest).toBeGreaterThan(2);
    // Pushing the carriage toward the jaws closes them: the gap falls as the
    // rod pin advances, and rises as it withdraws.
    const advancing = solved.slice(1).filter((at, i) => at('D').x > solved[i]('D').x);
    const closing = solved.slice(1).filter((at, i) => gap(at) < gap(solved[i]));
    expect(closing.length).toBeGreaterThan(solved.length / 3);
    expect(advancing.length).toBe(closing.length);
  });
});
