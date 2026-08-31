// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Joint, RealJoint } from '../../app/model/joint';
import { buildMechanism } from '../../test-utils/verification/fixture';
import { peaucellierFixture, PEAUCELLIER } from '../../test-utils/verification/classic-fixtures';

// The claim this linkage makes is stronger than any other straight-line linkage
// in the library makes: not "nearly straight over the middle of the stroke" but
// straight, everywhere, exactly. So the test is the claim — the pen's x never
// moves — rather than a tolerance band fitted to whatever it happened to draw.

const { crank, long, side } = PEAUCELLIER;
/** Where the inversion sends the crank pin's circle: x = (long² - side²) / (2 · crank). */
const LINE_X = (long ** 2 - side ** 2) / (2 * crank);

const built = buildMechanism(peaucellierFixture());
const frames = built.mechanism.joints;
const at = (frame: Joint[], id: string) => frame.find((joint) => joint.id === id)!;
const span = (a: Joint, b: Joint) => Math.hypot(a.x - b.x, a.y - b.y);

// Solved positions are rounded to four decimals, and a length is a difference
// of two of them, so a few of those quanta is as exact as a bar can be. The
// crank's own bar carries the extra drift of stepping its angle 400 times.
const ROUNDING = 2e-3;

describe('the Peaucellier-Lipkin straight-line linkage', () => {
  it('is a mechanism the app will run', () => {
    expect(built.mechanism.dof).toBe(1);
    expect(built.mechanism.isMechanismValid()).toBe(true);
    expect(frames.length).toBeGreaterThan(300);
    for (const frame of frames) {
      for (const joint of frame) {
        expect(Number.isFinite(joint.x) && Number.isFinite(joint.y)).toBe(true);
      }
    }
  });

  it('is drawn to the proportions that make the line exact', () => {
    // Both inequalities in the fixture's comment, checked rather than trusted.
    // The first keeps the pen clear of the crank pin; the second is what lets
    // the cell assemble at all.
    expect(long ** 2 - side ** 2).toBeGreaterThan((2 * crank) ** 2);
    expect(long - side).toBeLessThan(2 * crank);

    const first = frames[0];
    // The crank equal to the ground offset is the whole inversion trick: it is
    // what puts the driven pin on a circle *through* the center O.
    expect(span(at(first, 'O'), at(first, 'C'))).toBeCloseTo(crank, 6);
    expect(span(at(first, 'C'), at(first, 'P'))).toBeCloseTo(crank, 6);
    expect(span(at(first, 'O'), at(first, 'A'))).toBeCloseTo(long, 6);
    expect(span(at(first, 'O'), at(first, 'B'))).toBeCloseTo(long, 6);
    for (const [a, b] of [
      ['A', 'P'],
      ['B', 'P'],
      ['A', 'Q'],
      ['B', 'Q'],
    ]) {
      expect(span(at(first, a), at(first, b))).toBeCloseTo(side, 6);
    }
  });

  it('keeps every bar the length it was drawn', () => {
    const bars: [string, string][] = [
      ['C', 'P'],
      ['O', 'A'],
      ['O', 'B'],
      ['A', 'P'],
      ['B', 'P'],
      ['A', 'Q'],
      ['B', 'Q'],
    ];
    for (const [a, b] of bars) {
      const drawn = span(at(frames[0], a), at(frames[0], b));
      for (const frame of frames) {
        expect(Math.abs(span(at(frame, a), at(frame, b)) - drawn)).toBeLessThan(ROUNDING);
      }
    }
  });

  it('inverts the crank pin in a circle about O', () => {
    // |OP| · |OQ| = long² - side², which is the identity the rhombus and the two
    // long arms enforce and the reason the output is a line rather than a curve.
    const power = long ** 2 - side ** 2;
    for (const frame of frames) {
      const center = at(frame, 'O');
      const product = span(center, at(frame, 'P')) * span(center, at(frame, 'Q'));
      expect(Math.abs(product - power)).toBeLessThan(1e-2);
    }
  });

  it('draws an exactly straight line, not an approximation to one', () => {
    const xs = frames.map((frame) => at(frame, 'Q').x);
    const ys = frames.map((frame) => at(frame, 'Q').y);
    for (const x of xs) {
      expect(Math.abs(x - LINE_X)).toBeLessThan(ROUNDING);
    }
    // A long line, and one the pen actually travels: a linkage jammed at a point
    // would satisfy the straightness test above and draw nothing.
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(2 * long);
    // Both ways from the drawn pose, so the stroke is not a one-sided stub.
    expect(Math.max(...ys)).toBeGreaterThan(long);
    expect(Math.min(...ys)).toBeLessThan(-long);
  });

  it('traces the pen and nothing else', () => {
    const traced = built.joints
      .filter((joint) => joint instanceof RealJoint && joint.showCurve)
      .map((joint) => joint.id);
    expect(traced).toEqual(['Q']);
  });

  it('carries no mass, being a demonstration of shape', () => {
    for (const link of built.links) {
      expect(link.mass).toBe(0);
      expect((link as { massMoI?: number }).massMoI).toBe(0);
    }
  });
});
