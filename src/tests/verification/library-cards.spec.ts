// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { RealJoint } from '../../app/model/joint';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RealLink } from '../../app/model/link';
import { barHalfWidth } from '../../app/model/joint-marks';
import { turnsClockwise } from '../../app/model/drive-direction';
import { SettingsService } from '../../app/services/settings.service';
import {
  MechanismFixture,
  buildMechanism,
  buildMechanismAtScale,
  inModelUnits,
} from '../../test-utils/verification/fixture';
import { pumpingFieldFixture } from '../../test-utils/verification/ensemble-fixtures';
import {
  FOUR_BAR_PINS,
  LOCOMOTIVE_OBJECT_SCALE,
  PLIERS_OBJECT_SCALE,
  SUSPENSION_OBJECT_SCALE,
  crankDrivenPumpjackFixture,
  doubleWishboneFixture,
  dwellSixBarFixture,
  fixedLengthFourBarFixture,
  fourBarCardFixture,
  lockingPliersFixture,
  parallelogramFixture,
  scotchYokeOnRodFixture,
  steamLocomotiveFixture,
  toggleClampInInchesFixture,
  wattStraightLineFixture,
} from '../../test-utils/verification/library-card-fixtures';
import { toggleClampFixture } from '../../test-utils/verification/force-fixtures';
import { ellipticalTrammelFixture } from '../../test-utils/verification/slot-fixtures';
import { TEMPLATE_LINKAGES } from '../../app/component/MODALS/templates/template-linkages';
import { TEMPLATE_CARDS } from '../../app/component/MODALS/templates/template-catalog';
import { MODEL_SCALE } from '../../app/model/render-scale';
import { ForceUnit, LengthUnit } from '../../app/model/unit-enums';
import { buildMechanismFixture } from '../fixtures/mechanism-fixtures';
import { TEMPLATE_BASELINES } from './template-baseline';

// The library cards drawn for a reader, redrawn or new. Each promise a card's
// description makes about its drawing is checked here against the solved
// motion, because a card that says "the crank turns all the way round" over a
// crank that rocks is the kind of mistake nobody notices from the thumbnail.

type At = (id: string) => { x: number; y: number };

/** Every solved frame of a fixture, as a lookup by joint id. */
function solvedFrames(fixture: MechanismFixture): At[] {
  const { mechanism } = buildMechanism(fixture);
  expect(mechanism.isMechanismValid()).toBe(true);
  return mechanism.joints.map((frame) => (id: string) => frame.find((joint) => joint.id === id)!);
}

/**
 * Every solved frame of a published card, solved as the app solves it: in
 * model units, at the card's own object scale, and read back in its units.
 *
 * `solvedFrames` builds at the fixture's own numbers, which moves a linkage of
 * pins exactly as the app does. A cylinder is different: where its seal can go
 * is measured in the object scale, so a cylinder card has to be solved at the
 * scale it is published at or its travel is somebody else's.
 */
function publishedFrames(fixture: MechanismFixture, objectScale: number): At[] {
  const { mechanism } = buildMechanismAtScale(inModelUnits(fixture), objectScale);
  expect(mechanism.isMechanismValid()).toBe(true);
  return mechanism.joints.map((frame) => (id: string) => {
    const joint = frame.find((one) => one.id === id)!;
    return { x: joint.x / MODEL_SCALE, y: joint.y / MODEL_SCALE };
  });
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

/** A body's bearing at every frame, in degrees, unwrapped so it never jumps a turn. */
function bearings(frames: At[], pivot: string, tip: string): number[] {
  const out: number[] = [];
  for (const at of frames) {
    let angle = (Math.atan2(at(tip).y - at(pivot).y, at(tip).x - at(pivot).x) * 180) / Math.PI;
    const last = out[out.length - 1];
    if (last !== undefined) angle += 360 * Math.round((last - angle) / 360);
    out.push(angle);
  }
  return out;
}

/**
 * The most frames in a row, around a closed cycle, over which `values` stay
 * within `tolerance` of each other.
 */
function longestSteadyRun(values: number[], tolerance: number): number {
  // The last frame repeats the first, so the cycle is every frame but that one.
  const cycle = values.slice(0, -1);
  let longest = 0;
  for (let start = 0; start < cycle.length; start++) {
    let low = cycle[start];
    let high = cycle[start];
    let length = 1;
    while (length < cycle.length) {
      const next = cycle[(start + length) % cycle.length];
      low = Math.min(low, next);
      high = Math.max(high, next);
      if (high - low > tolerance) break;
      length++;
    }
    longest = Math.max(longest, length);
  }
  return longest;
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

describe('the parallelogram', () => {
  const frames = solvedFrames(parallelogramFixture());

  it('turns its crank all the way round', () => {
    expect(degreesTurned(frames, 'A', 'B')).toBeCloseTo(360, 0);
  });

  it('passes through the two poses where every pin is on one line', () => {
    // The change points, where a parallelogram could carry on crossed. They
    // fall between samples, so what is counted is the crank pin crossing the
    // frame's line.
    let crossings = 0;
    for (let i = 1; i < frames.length; i++) {
      if (Math.sign(frames[i]('B').y) !== Math.sign(frames[i - 1]('B').y)) crossings++;
    }
    expect(crossings).toBe(2);
  });

  it('carries its coupler round level, so the traced point circles like the crank pin', () => {
    const startB = frames[0]('B');
    const startT = frames[0]('T');
    for (const at of frames) {
      expect(at('C').y - at('B').y).toBeCloseTo(0, 9);
      expect(at('T').x - at('B').x).toBeCloseTo(startT.x - startB.x, 9);
      expect(at('T').y - at('B').y).toBeCloseTo(startT.y - startB.y, 9);
    }
  });
});

describe('Watt’s straight-line mechanism', () => {
  const frames = solvedFrames(wattStraightLineFixture());
  const coupler = 1.5;

  it('rocks its input rather than turning it', () => {
    expect(span(bearings(frames, 'A', 'B'))).toBeLessThan(180);
  });

  it('runs the coupler’s midpoint along a nearly straight line through the start', () => {
    // The stretch of the cycle around the start where the midpoint stays
    // within 1% of the coupler's length of the vertical line it starts on.
    const near = (at: At) => Math.abs(at('M').x) < 0.01 * coupler;
    const stretch: number[] = [];
    for (let i = 0; i < frames.length && near(frames[i]); i++) stretch.push(frames[i]('M').y);
    for (let i = frames.length - 1; i > 0 && near(frames[i]); i--) stretch.push(frames[i]('M').y);
    // About one and a half lengths; a degree of input between samples clips
    // a little off each end.
    expect(span(stretch)).toBeGreaterThan(1.4 * coupler);
  });

  it('and curls away from the line at the ends of its travel', () => {
    expect(span(frames.map((at) => at('M').x))).toBeGreaterThan(0.25 * coupler);
  });
});

describe('the six-bar with a dwell', () => {
  const frames = solvedFrames(dwellSixBarFixture());
  const output = bearings(frames, 'O', 'Q');

  it('turns its crank all the way round', () => {
    expect(degreesTurned(frames, 'A', 'B')).toBeCloseTo(360, 0);
  });

  it('holds its output within half a degree for over a hundred degrees of crank', () => {
    // A pin input is sampled a degree of crank apart.
    expect(longestSteadyRun(output, 0.5)).toBeGreaterThan(100);
  });

  it('and swings it through more than fifty-five degrees the rest of the turn', () => {
    expect(span(output)).toBeGreaterThan(55);
  });

  it('starts in the pause', () => {
    expect(span(output.slice(0, 30))).toBeLessThan(0.5);
  });
});

describe('the toggle clamp card, in inches', () => {
  const { service, settings } = buildMechanismFixture(TEMPLATE_LINKAGES['Toggle_Clamp']);

  it('opens in inches and pounds-force', () => {
    expect(settings.lengthUnit.value).toBe(LengthUnit.INCH);
    expect(settings.forceUnit.value).toBe(ForceUnit.LBF);
  });

  it('stands on the centimeter clamp’s numbers, each read as an inch', () => {
    for (const joint of toggleClampFixture().joints) {
      const opened = service.joints.find((one) => one.id === joint.id)!;
      expect(opened.x / MODEL_SCALE).toBeCloseTo(joint.x, 6);
      expect(opened.y / MODEL_SCALE).toBeCloseTo(joint.y, 6);
    }
  });

  it('weighs its parts in pounds and loads its pad in pounds-force', () => {
    const inches = toggleClampInInchesFixture();
    for (const link of inches.links) {
      expect(service.links.find((one) => one.id === link.joints)!.mass).toBeCloseTo(link.mass!, 6);
    }
    expect(service.forces.map((force) => force.mag)).toEqual([Math.hypot(...inches.load!.vector)]);
  });
});

/** The joints a card opens with that drive it. */
function inputsOf(id: keyof typeof TEMPLATE_LINKAGES): string[] {
  const { service } = buildMechanismFixture(TEMPLATE_LINKAGES[id]);
  return service.joints
    .filter((joint) => joint instanceof RealJoint && joint.input)
    .map((joint) => joint.id);
}

/**
 * Where each joint of a card lands on its picture, in the picture's pixels.
 *
 * Read off the catalog's placement, which is in centimeters, and the SVG's own
 * size: the same arithmetic the backdrop service does to put the picture up.
 */
function onPicture(id: string, centimetersPerUnit: number) {
  const card = TEMPLATE_CARDS.find((one) => one.id === id)!;
  const backdrop = card.backdrop!;
  const svg = readFileSync(resolve(__dirname, '../../..', 'src', backdrop.src), 'utf8');
  const [, width, height] = svg.match(/<svg[^>]* width="([\d.]+)" height="([\d.]+)"/)!.map(Number);
  const wide = backdrop.width / centimetersPerUnit;
  const perUnit = width / wide;
  const left = (backdrop.centerX ?? 0) / centimetersPerUnit - wide / 2;
  const top = (backdrop.centerY ?? 0) / centimetersPerUnit + height / perUnit / 2;
  const pins = [...svg.matchAll(/<circle class="(?:pin|rivet)" cx="([\d.]+)" cy="([\d.]+)"/g)].map(
    ([, cx, cy]) => ({ x: Number(cx), y: Number(cy) })
  );
  return {
    pins,
    at: (joint: { x: number; y: number }) => ({
      x: (joint.x - left) * perUnit,
      y: (top - joint.y) * perUnit,
    }),
  };
}

/** Whether a pin is drawn within a pixel and a half of each named joint. */
function pinsUnder(id: string, fixture: MechanismFixture, joints: string[], perUnit: number) {
  const picture = onPicture(id, perUnit);
  return joints.filter((name) => {
    const spot = picture.at(fixture.joints.find((joint) => joint.id === name)!);
    return !picture.pins.some((pin) => Math.hypot(pin.x - spot.x, pin.y - spot.y) < 1.5);
  });
}

describe('the locking pliers', () => {
  const frames = publishedFrames(lockingPliersFixture(), PLIERS_OBJECT_SCALE);
  /** How far the jaws are open, in degrees of the lower jaw, from where they start. */
  const open = bearings(frames, 'A', 'J').map((angle, _, all) => angle - all[0]);
  /**
   * How far the handle's front stretch is from lying along the toggle link, in
   * degrees: negative short of center, positive past it.
   */
  const bend = frames.map((at) => {
    const front = Math.atan2(at('C').y - at('B').y, at('C').x - at('B').x);
    const toggle = Math.atan2(at('D').y - at('C').y, at('D').x - at('C').x);
    return ((front - toggle) * 180) / Math.PI;
  });
  const handle = bearings(frames, 'B', 'G');

  it('opens in inches', () => {
    const { settings } = buildMechanismFixture(TEMPLATE_LINKAGES['Locking_Pliers']);
    expect(settings.lengthUnit.value).toBe(LengthUnit.INCH);
  });

  it('is driven by the cylinder standing in for a hand, and by nothing else', () => {
    expect(inputsOf('Locking_Pliers')).toEqual(['S']);
  });

  it('starts just short of center', () => {
    expect(bend[0]).toBeLessThan(0);
    expect(bend[0]).toBeGreaterThan(-4);
  });

  it('closes its jaws furthest where the toggle link comes into line', () => {
    const atCenter = bend.indexOf(bend.reduce((a, b) => (Math.abs(b) < Math.abs(a) ? b : a)));
    expect(Math.abs(bend[atCenter])).toBeLessThan(0.5);
    expect(open[atCenter] - Math.min(...open)).toBeLessThan(0.01);
  });

  it('keeps turning the handle there while the jaw stands still', () => {
    const near = frames.map((_, i) => i).filter((i) => Math.abs(bend[i]) < 2);
    expect(span(near.map((i) => handle[i]))).toBeGreaterThan(2);
    expect(span(near.map((i) => open[i]))).toBeLessThan(0.1);
  });

  it('goes just past center, and the jaws barely reopen there', () => {
    expect(Math.max(...bend)).toBeGreaterThan(1);
    expect(Math.max(...bend)).toBeLessThan(5);
    const past = frames.map((_, i) => i).filter((i) => bend[i] > 0);
    expect(Math.max(...past.map((i) => open[i])) - Math.min(...open)).toBeLessThan(0.2);
  });

  it('opens its jaws about twenty degrees at the other end', () => {
    expect(span(open)).toBeGreaterThan(18);
    expect(span(open)).toBeLessThan(22);
  });

  it('lies on its picture, a rivet under every pin', () => {
    expect(pinsUnder('Locking_Pliers', lockingPliersFixture(), ['A', 'B', 'C'], 2.54)).toEqual([]);
  });
});

describe('the double-wishbone suspension', () => {
  const fixture = doubleWishboneFixture();
  const frames = publishedFrames(fixture, SUSPENSION_OBJECT_SCALE);
  /** Where the tire meets the road: midway between its two bottom corners. */
  const contact = frames.map((at) => ({
    x: (at('U').x + at('V').x) / 2,
    y: (at('U').y + at('V').y) / 2,
  }));
  /** How far the upright has turned, in degrees, counter-clockwise: its top toward the car. */
  const lean = bearings(frames, 'B', 'C').map((angle, _, all) => angle - all[0]);
  const pin = (id: string) => fixture.joints.find((joint) => joint.id === id)!;

  it('is driven by its shock absorber, and by nothing else', () => {
    expect(inputsOf('Double_Wishbone')).toEqual(['S']);
  });

  it('is drawn at full size, with an upper arm shorter than the lower', () => {
    const lower = Math.hypot(pin('B').x - pin('A').x, pin('B').y - pin('A').y);
    const upper = Math.hypot(pin('C').x - pin('D').x, pin('C').y - pin('D').y);
    expect(lower).toBeGreaterThan(30);
    expect(lower).toBeLessThan(45);
    expect(upper).toBeLessThan(lower * 0.75);
  });

  it('moves the wheel about eight centimeters up and down', () => {
    const heights = contact.map((point) => point.y - contact[0].y);
    expect(Math.max(...heights)).toBeGreaterThan(7);
    expect(Math.min(...heights)).toBeLessThan(-7);
    expect(span(heights)).toBeLessThan(18);
  });

  it('leans the top of the wheel toward the car as it rises', () => {
    const highest = contact.indexOf(contact.reduce((a, b) => (b.y > a.y ? b : a)));
    expect(lean[highest]).toBeGreaterThan(1);
  });

  it('keeps the tire from sliding more than two centimeters sideways', () => {
    expect(span(contact.map((point) => point.x))).toBeLessThan(2);
  });

  it('carries the tire with the upright, as one body', () => {
    const tilt = bearings(frames, 'U', 'X').map((angle, i) => angle - lean[i]);
    expect(span(tilt)).toBeLessThan(1e-6);
  });

  it('traces the hub and the four corners of the tire', () => {
    const traced = fixture.joints.filter((joint) => joint.trace).map((joint) => joint.id);
    expect(traced).toEqual(expect.arrayContaining(['T', 'U', 'V', 'W', 'X']));
  });

  it('draws the tire as the picture does: 22 cm wide, 64 cm across, on the road', () => {
    const { service } = buildMechanismFixture(TEMPLATE_LINKAGES['Double_Wishbone']);
    const half = barHalfWidth(SettingsService.objectScale) / MODEL_SCALE;
    const corners = ['U', 'V', 'W', 'X'].map((id) => service.joints.find((j) => j.id === id)!);
    const xs = corners.map((joint) => joint.x / MODEL_SCALE);
    const ys = corners.map((joint) => joint.y / MODEL_SCALE);
    expect(Math.min(...xs) - half).toBeCloseTo(49, 2);
    expect(Math.max(...xs) + half).toBeCloseTo(71, 2);
    expect(Math.min(...ys) - half).toBeCloseTo(0, 2);
    expect(Math.max(...ys) + half).toBeCloseTo(64, 2);
  });

  it('lies on its picture, a pin under every joint the body and arms share', () => {
    expect(pinsUnder('Double_Wishbone', fixture, ['A', 'B', 'C', 'D', 'K', 'M'], 1)).toEqual([]);
  });
});

describe('the steam locomotive', () => {
  const fixture = steamLocomotiveFixture();
  const frames = publishedFrames(fixture, LOCOMOTIVE_OBJECT_SCALE);
  const { service, settings } = buildMechanismFixture(TEMPLATE_LINKAGES['Steam_Locomotive']);
  // Read now: the size is a static, and test-setup.ts resets it before every test.
  const objectScale = SettingsService.objectScale;
  const driving = bearings(frames, 'D', 'E');
  const level = (from: string, to: string) => frames.map((at) => at(to).y - at(from).y);

  it('opens in meters', () => {
    expect(settings.lengthUnit.value).toBe(LengthUnit.METER);
  });

  it('is driven at its driving axle, clockwise, so the engine runs to the right', () => {
    expect(inputsOf('Steam_Locomotive')).toEqual(['D']);
    expect(
      turnsClockwise((service.joints.find((joint) => joint.id === 'D') as RealJoint).driveSpeed)
    ).toBe(true);
  });

  it('draws its three wheels as discs 1.4 m across, standing on the rail', () => {
    const half = barHalfWidth(objectScale);
    for (const [wheel, axle] of [
      ['ABC', 'A'],
      ['DEFM', 'D'],
      ['GHI', 'G'],
    ]) {
      const link = service.links.find((one) => one.id === wheel) as RealLink;
      const center = service.joints.find((joint) => joint.id === axle)!;
      const reach = Math.max(
        ...link.joints.map((joint) => Math.hypot(joint.x - center.x, joint.y - center.y))
      );
      expect(link.isCircle).toBe(true);
      expect(link.discCenter()?.id).toBe(axle);
      expect((reach + half) / MODEL_SCALE).toBeCloseTo(0.7, 6);
      expect(center.y / MODEL_SCALE).toBeCloseTo(0.7, 6);
    }
  });

  it('turns the other two wheels in step with the driving wheel', () => {
    for (const [axle, pin] of [
      ['A', 'B'],
      ['G', 'H'],
    ]) {
      const turned = bearings(frames, axle, pin).map((angle, i) => angle - driving[i]);
      expect(span(turned)).toBeLessThan(1e-3);
    }
  });

  it('keeps both coupling rods level, as a parallelogram does', () => {
    expect(span(level('B', 'E'))).toBeLessThan(1e-6);
    expect(span(level('E', 'H'))).toBeLessThan(1e-6);
  });

  it('slides the crosshead level, through a stroke twice the crank', () => {
    expect(span(frames.map((at) => at('J').y))).toBeLessThan(1e-6);
    expect(span(frames.map((at) => at('J').x))).toBeCloseTo(0.6, 3);
  });

  describe('its valve gear', () => {
    const valve = frames.map((at) => at('R').x);
    const middle = (Math.max(...valve) + Math.min(...valve)) / 2;
    const crosshead = frames.map((at) => at('J').x);
    const ahead = crosshead.indexOf(Math.max(...crosshead));
    const behind = crosshead.indexOf(Math.min(...crosshead));

    it('slides the piston valve level, about ten centimeters each way', () => {
      expect(span(frames.map((at) => at('V').y))).toBeLessThan(1e-6);
      expect(span(frames.map((at) => at('V').x - at('R').x))).toBeLessThan(1e-6);
      expect(span(valve)).toBeGreaterThan(0.15);
      expect(span(valve)).toBeLessThan(0.25);
    });

    it('is already open to the end the piston is leaving at each end of the stroke', () => {
      // The valve is fed between its heads, so moving it forward opens the front
      // port to steam and moving it back opens the rear one.
      expect(valve[ahead] - middle).toBeGreaterThan(0.03);
      expect(valve[behind] - middle).toBeLessThan(-0.03);
    });

    it('opens the rear port while the piston moves forward, and the front port on the way back', () => {
      // The crank pin is at the top of its circle halfway through the forward
      // stroke, and at the bottom halfway back.
      const pinHeight = frames.map((at) => at('E').y);
      const top = pinHeight.indexOf(Math.max(...pinHeight));
      const bottom = pinHeight.indexOf(Math.min(...pinHeight));
      expect(valve[top] - middle).toBeLessThan(-0.06);
      expect(valve[bottom] - middle).toBeGreaterThan(0.06);
    });

    it('swings the expansion link and the combination lever no more than a real one', () => {
      const link = bearings(frames, 'N', 'O');
      const lever = bearings(frames, 'S', 'Q');
      expect(span(link)).toBeLessThan(60);
      expect(span(lever)).toBeLessThan(45);
    });
  });

  it('lies on its picture: a hub under every axle and a pin under the trunnion', () => {
    expect(pinsUnder('Steam_Locomotive', fixture, ['A', 'D', 'G', 'N'], 100)).toEqual([]);
  });
});
