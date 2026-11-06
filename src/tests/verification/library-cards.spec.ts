// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Joint } from '../../app/model/joint';
import { RealLink } from '../../app/model/link';
import { MechanismFixture, buildMechanism } from '../../test-utils/verification/fixture';
import { pumpingFieldFixture } from '../../test-utils/verification/ensemble-fixtures';
import {
  FOUR_BAR_PINS,
  crankDrivenPumpjackFixture,
  fixedLengthFourBarFixture,
  fourBarCardFixture,
  scotchYokeOnRodFixture,
} from '../../test-utils/verification/library-card-fixtures';
import { ellipticalTrammelFixture } from '../../test-utils/verification/slot-fixtures';
import { TEMPLATE_BASELINES } from './template-baseline';

// The library cards redrawn for a reader. Each promise a card's description
// makes about its drawing is checked here against the solved motion, because
// a card that says "the crank turns all the way round" over a crank that rocks
// is the kind of mistake nobody notices from the thumbnail.

type At = (id: string) => Joint;

/** Every solved frame of a fixture, as a lookup by joint id. */
function solvedFrames(fixture: MechanismFixture): At[] {
  const { mechanism } = buildMechanism(fixture);
  expect(mechanism.isMechanismValid()).toBe(true);
  return mechanism.joints.map((frame) => (id: string) => frame.find((joint) => joint.id === id)!);
}

/** How far a body turned over a cycle, in degrees, counting every wrap. */
function degreesTurned(frames: At[], pivot: string, tip: string): number {
  const bearing = (at: At) => Math.atan2(at(tip).y - at(pivot).y, at(tip).x - at(pivot).x);
  let total = 0;
  for (let i = 1; i < frames.length; i++) {
    let step = bearing(frames[i]) - bearing(frames[i - 1]);
    while (step > Math.PI) step -= 2 * Math.PI;
    while (step < -Math.PI) step += 2 * Math.PI;
    total += step;
  }
  return Math.abs((total * 180) / Math.PI);
}

function span(values: number[]): number {
  return Math.max(...values) - Math.min(...values);
}

describe('the Start Here four-bar', () => {
  it('stands on the pins of the first four-bar drawing', () => {
    const first = TEMPLATE_BASELINES['4-Bar'].joints;
    for (const [id, pin] of Object.entries(FOUR_BAR_PINS)) {
      const was = first.find((joint) => joint.id === id)!;
      expect(pin.x).toBeCloseTo(was.x, 3);
      expect(pin.y).toBeCloseTo(was.y, 3);
    }
  });

  it('turns its crank all the way round', () => {
    expect(degreesTurned(solvedFrames(fourBarCardFixture()), 'A', 'B')).toBeCloseTo(360, 0);
  });

  it('traces a point lifted off the coupler, which draws a curve rather than a line', () => {
    const fixture = fourBarCardFixture();
    expect(fixture.joints.filter((joint) => joint.trace).map((joint) => joint.id)).toEqual(['T']);

    const frames = solvedFrames(fixture);
    const { B, C } = FOUR_BAR_PINS;
    const t = fixture.joints.find((joint) => joint.id === 'T')!;
    const offBar =
      Math.abs((C.x - B.x) * (t.y - B.y) - (C.y - B.y) * (t.x - B.x)) /
      Math.hypot(C.x - B.x, C.y - B.y);
    expect(offBar).toBeGreaterThan(1);

    const path = frames.map((at) => at('T'));
    expect(span(path.map((p) => p.x))).toBeGreaterThan(1);
    expect(span(path.map((p) => p.y))).toBeGreaterThan(1);
  });
});

describe('the four-bar with fixed lengths', () => {
  it('is the Four-Bar card without its traced point', () => {
    const plain = fixedLengthFourBarFixture();
    const traced = fourBarCardFixture();
    for (const joint of plain.joints) {
      expect(traced.joints.find((other) => other.id === joint.id)).toMatchObject({
        x: joint.x,
        y: joint.y,
      });
    }
    expect(plain.joints.some((joint) => joint.trace)).toBe(false);
  });

  it('holds the crank at its angle and the coupler and rocker at their lengths', () => {
    const { links } = buildMechanism(fixedLengthFourBarFixture());
    const holds = Object.fromEntries(
      links.map((link) => [link.id, (link as RealLink).hold ?? 'none'])
    );
    expect(holds).toEqual({ AB: 'angle', BC: 'length', CD: 'length' });
  });
});

describe('the pumpjack, driven at its crank', () => {
  it('drives the crank at its ground pin and nothing else', () => {
    const inputs = crankDrivenPumpjackFixture().joints.filter((joint) => joint.input);
    expect(inputs).toEqual([expect.objectContaining({ id: 'A', ground: true })]);
  });

  it('turns the crank right round, and the beam nods without turning over', () => {
    const frames = solvedFrames(crankDrivenPumpjackFixture());
    expect(degreesTurned(frames, 'A', 'M')).toBeCloseTo(360, 0);
    expect(degreesTurned(frames, 'S', 'H')).toBeLessThan(1);
  });

  it('lifts the pump rod straight up and down', () => {
    const rod = solvedFrames(crankDrivenPumpjackFixture()).map((at) => at('R'));
    expect(span(rod.map((p) => p.x))).toBeLessThan(1e-3);
    expect(span(rod.map((p) => p.y))).toBeGreaterThan(1);
  });

  it('drives every pump in the field at its crank too', () => {
    const field = pumpingFieldFixture();
    const inputs = field.joints.filter((joint) => joint.input);
    expect(inputs.length).toBe(3);
    expect(inputs.every((joint) => joint.ground)).toBe(true);
  });
});

describe('the Scotch yoke on a guided rod', () => {
  const frames = solvedFrames(scotchYokeOnRodFixture());

  it('turns its disc all the way round', () => {
    expect(degreesTurned(frames, 'A', 'B')).toBeCloseTo(360, 0);
  });

  it('moves the rod by exactly the crank radius times the cosine of its angle', () => {
    // The closed form a Scotch yoke is known for: no connecting rod, so no
    // harmonic but the first.
    const start = frames[0]('G').x;
    for (const at of frames) {
      const crank = Math.atan2(at('B').y - at('A').y, at('B').x - at('A').x);
      expect(at('G').x - start).toBeCloseTo(Math.cos(crank) - 1, 3);
    }
  });

  it('keeps the rod level, on its bearings’ line, and the yoke upright', () => {
    for (const at of frames) {
      for (const id of ['E', 'F', 'G']) expect(at(id).y).toBeCloseTo(0, 6);
      expect(at('C').x).toBeCloseTo(at('D').x, 6);
    }
  });
});

describe('the elliptical trammel card', () => {
  it('traces the point on the bar that draws the ellipse', () => {
    const traced = ellipticalTrammelFixture(true, 1).joints.filter((joint) => joint.trace);
    expect(traced.map((joint) => joint.id)).toEqual(['T']);
  });

  it('leaves the undriven mobility case untraced', () => {
    expect(ellipticalTrammelFixture().joints.some((joint) => joint.trace)).toBe(false);
  });
});
