// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Joint, RealJoint } from '../../app/model/joint';
import { buildMechanism } from '../../test-utils/verification/fixture';
import { pantographFixture } from '../../test-utils/verification/classic-fixtures';

// What a pantograph promises is a similarity: the pen's path is the tracer's,
// scaled about a fixed point. That is two separate claims — the three points
// stay in line, and the ratio never changes — and both are checked here at
// every sample rather than at the pose the linkage was drawn in.

const built = buildMechanism(pantographFixture());
const frames = built.mechanism.joints;
const at = (frame: Joint[], id: string) => frame.find((joint) => joint.id === id)!;
const span = (a: Joint, b: Joint) => Math.hypot(a.x - b.x, a.y - b.y);

/** How far a point sits off the line through two others. */
function offLine(point: Joint, from: Joint, to: Joint): number {
  const ex = to.x - from.x;
  const ey = to.y - from.y;
  return Math.abs((point.x - from.x) * ey - (point.y - from.y) * ex) / Math.hypot(ex, ey);
}

const ROUNDING = 2e-3;

describe('a pantograph copying a coupler curve', () => {
  it('is a mechanism the app will run, all the way round', () => {
    expect(built.mechanism.dof).toBe(1);
    expect(built.mechanism.isMechanismValid()).toBe(true);
    // The four-bar is a crank-rocker, so the drive turns rather than rocking and
    // the cycle closes: one sample a degree, and the last is the first again.
    expect(frames.length).toBe(361);
    for (const id of ['T', 'P', 'J', 'K', 'L']) {
      expect(span(at(frames[0], id), at(frames[frames.length - 1], id))).toBeLessThan(ROUNDING);
    }
  });

  it('keeps every bar the length it was drawn', () => {
    const bars: [string, string][] = [
      ['G', 'R'],
      ['R', 'S'],
      ['R', 'T'],
      ['S', 'T'],
      ['H', 'S'],
      ['J', 'K'],
      ['K', 'O'],
      ['J', 'O'],
      ['J', 'L'],
      ['L', 'T'],
      ['J', 'T'],
      ['K', 'P'],
      ['L', 'P'],
    ];
    for (const [a, b] of bars) {
      const drawn = span(at(frames[0], a), at(frames[0], b));
      for (const frame of frames) {
        expect(Math.abs(span(at(frame, a), at(frame, b)) - drawn)).toBeLessThan(ROUNDING);
      }
    }
  });

  it('stays a parallelogram rather than folding into the crossed form', () => {
    // JKPL: opposite sides equal is how it was drawn, and the antiparallelogram
    // satisfies that too — what separates them is that the pen stays on the same
    // side, which the collinearity test below is the sharp form of. Here it is
    // enough that the four corners never come into line.
    for (const frame of frames) {
      expect(offLine(at(frame, 'P'), at(frame, 'J'), at(frame, 'K'))).toBeGreaterThan(0.2);
    }
  });

  it('keeps the pivot, the pen and the tracer in one line', () => {
    for (const frame of frames) {
      expect(offLine(at(frame, 'P'), at(frame, 'O'), at(frame, 'T'))).toBeLessThan(ROUNDING);
    }
  });

  it('copies at a fixed ratio of two', () => {
    for (const frame of frames) {
      const pivot = at(frame, 'O');
      const toPen = span(pivot, at(frame, 'P'));
      const toTracer = span(pivot, at(frame, 'T'));
      expect(toPen).toBeGreaterThan(0.5);
      expect(Math.abs(toTracer / toPen - 2)).toBeLessThan(2e-3);
    }
  });

  it('copies a curve rather than a circle', () => {
    // A circle scaled is another circle, and two circles prove nothing about
    // similarity. The tracer has to be drawing something with a shape, so this
    // asks how far its path is from round.
    const tracer = frames.map((frame) => at(frame, 'T'));
    const cx = tracer.reduce((sum, point) => sum + point.x, 0) / tracer.length;
    const cy = tracer.reduce((sum, point) => sum + point.y, 0) / tracer.length;
    const radii = tracer.map((point) => Math.hypot(point.x - cx, point.y - cy));
    expect(Math.max(...radii) / Math.min(...radii)).toBeGreaterThan(2);
  });

  it('puts both curves on screen, and nothing else', () => {
    const traced = built.joints
      .filter((joint) => joint instanceof RealJoint && joint.showCurve)
      .map((joint) => joint.id);
    expect(traced.sort()).toEqual(['P', 'T']);
    // And they are two curves rather than one: the pen's is half the size and
    // somewhere else, which is the whole picture the mechanism is for.
    const extent = (id: string) => {
      const xs = frames.map((frame) => at(frame, id).x);
      const ys = frames.map((frame) => at(frame, id).y);
      return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
    };
    const [tracerWidth, tracerHeight] = extent('T');
    const [penWidth, penHeight] = extent('P');
    expect(penWidth / tracerWidth).toBeCloseTo(0.5, 2);
    expect(penHeight / tracerHeight).toBeCloseTo(0.5, 2);
    expect(tracerWidth).toBeGreaterThan(1);
  });

  it('carries no mass, being a demonstration of shape', () => {
    for (const link of built.links) {
      expect(link.mass).toBe(0);
      expect((link as { massMoI?: number }).massMoI).toBe(0);
    }
  });
});
