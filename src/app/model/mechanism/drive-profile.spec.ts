import { Injector } from '@angular/core';
import { createMechanismHarness } from '../../../test-utils/mechanism-harness';
import { DriveProfile, driveProfileOf, fractionalSampleAlong, sampleAlong } from './drive-profile';
import { ActiveObjService } from '../../services/active-obj.service';
import { ColorService } from '../../services/color.service';
import { DragStateService } from '../../services/drag-state.service';
import { GridUtilsService } from '../../services/grid-utils.service';
import { MechanismService } from '../../services/mechanism.service';
import { NumberUnitParserService } from '../../services/number-unit-parser.service';
import { SettingsService } from '../../services/settings.service';
import { SvgGridService } from '../../services/svg-grid.service';
import { SynthesisBuilderService } from '../../services/synthesis/synthesis-builder.service';
import { MechanismBuilder } from '../../services/transcoding/mechanism-builder';
import { StringTranscoder } from '../../services/transcoding/string-transcoder';
import { TemplateID, TEMPLATE_LINKAGES } from '../../component/MODALS/templates/template-linkages';
import { silentNotifications } from '../../../test-utils/notification-stub';
import { buildMechanism } from '../../../test-utils/verification/fixture';
import { squareRodSliderCrankFixture } from '../../../test-utils/verification/slot-fixtures';

/** The solved first mechanism of a template, and what its input does. */
function profileOf(template: TemplateID): DriveProfile {
  const { service, settings, active } = createMechanismHarness();

  const decoder = new StringTranscoder();
  decoder.decodeURL(TEMPLATE_LINKAGES[template]);
  new MechanismBuilder(service, decoder, settings, active).build(true);
  service.updateMechanism();

  const profile = driveProfileOf(service.mechanisms[0]);
  expect(profile, `${template} has a drive profile`).toBeDefined();
  return profile!;
}

describe('Where a machine says its input is', () => {
  beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  it('sweeps a crank that goes all the way round once across the track', () => {
    const profile = profileOf('4-Bar');

    expect(profile.continuous, 'the crank turns all the way round').toBe(true);
    expect(profile.linear).toBe(false);
    // Zero is the pose the drawing was authored in, and it climbs from there.
    expect(profile.along[0]).toBeCloseTo(0, 6);
    expect(profile.along[Math.floor(profile.along.length / 2)]).toBeCloseTo(0.5, 2);
    expect(profile.along.at(-1)!).toBeGreaterThan(0.99);
    // Never off the end: a turn is the whole track, not more than it.
    expect(profile.along.every((value) => value >= 0 && value <= 1)).toBe(true);
  });

  it('runs a clockwise crank left to right', () => {
    // The app stores a clockwise drive as a negative speed, which is the
    // opposite of the direction a reader expects the handle to travel.
    const profile = profileOf('4-Bar');
    expect(profile.along[1]).toBeGreaterThan(profile.along[0]);
  });

  it('spans a branch-swapping two-revolution cycle once, so a drag cannot flicker', () => {
    // The tangency slider-crank closes only after two crank revolutions.
    // Wrapped to one turn, sample t and t+360 shared a handle position, and
    // the scrubber flickered between the two assembly branches while
    // dragging, float noise picking the winner on each event.
    const { mechanism } = buildMechanism(squareRodSliderCrankFixture());
    const profile = driveProfileOf(mechanism)!;

    expect(profile.continuous).toBe(true);
    expect(profile.along).toHaveLength(721);
    // Monotone: every handle position names exactly one pose.
    for (let i = 1; i < profile.along.length; i++) {
      expect(profile.along[i]).toBeGreaterThan(profile.along[i - 1]);
    }
    expect(profile.along[0]).toBeCloseTo(0, 9);
    expect(profile.along.at(-1)!).toBeCloseTo(1, 9);

    // A simulated drag across the whole track lands on nearby samples in
    // order, never across the cycle to the other branch. Distance is measured
    // round the loop: the right edge of the track is the left edge, and both
    // name the same (closed) pose -- a real branch flicker is a ~360-sample
    // hop, which no seam can excuse.
    const last = profile.along.length - 1;
    let previous = 0;
    for (let i = 0; i <= 200; i++) {
      const sample = sampleAlong(profile, i / 200, previous);
      const hop = Math.abs(sample - previous);
      expect(Math.min(hop, last - hop)).toBeLessThanOrEqual(8);
      previous = sample;
    }
  });

  it('measures a ram between the ends of its own stroke, not its clock', () => {
    const profile = profileOf('Cylinder_Boom');

    expect(profile.linear, 'the input is a ram').toBe(true);
    expect(profile.continuous, 'a ram runs out of stroke and comes back').toBe(false);
    // Both ends of the track are reached, and only at the ends of the stroke.
    expect(Math.min(...profile.along)).toBeCloseTo(0, 6);
    expect(Math.max(...profile.along)).toBeCloseTo(1, 6);
    // And it comes back: the last sample is not the far end.
    expect(profile.along.at(-1)!).toBeLessThan(1);
  });

  it('starts a ram wherever the drawing was authored, not at zero', () => {
    // The whole point of measuring position rather than time: a ram drawn half
    // extended starts the handle half way along, because that is where it is.
    const profile = profileOf('Cylinder_Boom');
    expect(profile.along[0]).toBeGreaterThan(0.05);
    expect(profile.along[0]).toBeLessThan(0.95);
  });

  it('reads a place on the track back to the sample that is at it', () => {
    const profile = profileOf('Cylinder_Boom');
    const sample = sampleAlong(profile, profile.along[40], 40);
    expect(profile.along[sample]).toBeCloseTo(profile.along[40], 6);
  });

  it('keeps a drag on the leg the machine is already on', () => {
    // A ram passes every position twice, once each way. Pulling the handle back
    // a little should walk back along the way it came, not jump to the return
    // leg at the same extension.
    const profile = profileOf('Cylinder_Boom');
    const last = profile.along.length - 1;
    const outbound = Math.round(last * 0.25);
    const returning = Math.round(last * 0.85);

    expect(sampleAlong(profile, profile.along[outbound], outbound)).toBeLessThan(last / 2);
    expect(sampleAlong(profile, profile.along[returning], returning)).toBeGreaterThan(last / 2);
  });

  it('retraces the way it came, and changes legs only at a turnaround', () => {
    // The boom is authored mid-stroke, so its track has three legs: closing to
    // the bottom of the stroke, out to the top, and closing again to where it
    // started. Every extension is passed two or three times.
    const profile = profileOf('Cylinder_Boom');
    const turns = turnaroundsOf(profile.along);
    expect(turns.length).toBe(2);
    const [bottom, top] = turns;
    // Mid-way up the extending leg, pulling back walks back down that leg.
    const mid = Math.round((bottom + top) / 2);
    const back = fractionalSampleAlong(profile, profile.along[mid - 3], mid);
    expect(back).toBeCloseTo(mid - 3, 6);
    // At the top of the stroke the two ways on are the same distance, and the
    // tie goes forward in time: the ram that was pushed out comes home.
    const home = fractionalSampleAlong(profile, profile.along[top + 3], top);
    expect(home).toBeCloseTo(top + 3, 6);
  });

  it('closes the cycle across its seam rather than jumping a third of it', () => {
    const profile = profileOf('Cylinder_Boom');
    const last = profile.along.length - 1;
    // The last sample and the first are the same place. Asked, from the end,
    // for the place one sample into the opening leg, the answer is that
    // sample and not the same extension a hundred samples away.
    const on = fractionalSampleAlong(profile, profile.along[1], last);
    expect(on).toBeCloseTo(1, 6);
  });

  it('never jumps while the handle is dragged out and back across the whole stroke', () => {
    const profile = profileOf('Cylinder_Boom');
    const last = profile.along.length - 1;
    const count = last + 1;
    const stops: number[] = [];
    for (let v = profile.along[0]; v <= 1; v += 0.01) stops.push(v);
    for (let v = 1; v >= 0; v -= 0.01) stops.push(v);
    for (let v = 0; v <= profile.along[0]; v += 0.01) stops.push(v);
    let near = 0;
    let worst = 0;
    for (const along of stops) {
      const at = sampleAlong(profile, along, near);
      const forward = (((at - near) % count) + count) % count;
      worst = Math.max(worst, Math.min(forward, count - forward));
      near = at;
    }
    // A hundredth of the stroke is a handful of samples on this machine; a
    // leg change at the wrong place was a hundred and more.
    expect(worst).toBeLessThanOrEqual(8);
  });

  it('answers between samples, so a drag is not a series of small jumps', () => {
    // A degree of crank is a couple of pixels of track. Snapping to the nearest
    // sample held the drawing still for those two pixels and then jumped it,
    // which is what a reader sees as stutter.
    const profile = profileOf('4-Bar');
    const half = (profile.along[10] + profile.along[11]) / 2;
    const at = fractionalSampleAlong(profile, half, 10);
    expect(at).toBeGreaterThan(10);
    expect(at).toBeLessThan(11);
    // And still lands exactly on a sample when that is what was asked for.
    expect(fractionalSampleAlong(profile, profile.along[10], 10)).toBe(10);
  });

  it('treats the two ends of a loop as the same place', () => {
    // For a crank that goes all the way round the right edge of the track is
    // the left edge; dragging past the end comes back to the start rather than
    // stopping dead against it.
    const profile = profileOf('4-Bar');
    expect(sampleAlong(profile, 1, 0)).toBe(0);
  });

  it('lands a drag TO the right edge on the last sample, not sample zero', () => {
    // The two ends of the loop are the same pose, but not the same readout: a
    // drag arriving at the right edge should read as the end of the cycle
    // (24.00 s, 720 degrees), and it used to snap to 0.00 s because the tie
    // between the two ends went to whichever sample the scan met first.
    const { mechanism } = buildMechanism(squareRodSliderCrankFixture());
    const profile = driveProfileOf(mechanism)!;
    const last = profile.along.length - 1;
    expect(sampleAlong(profile, 1, last - 4)).toBe(last);
    // And from rest at the start, the same place is still the start.
    expect(sampleAlong(profile, 1, 0)).toBe(0);
  });
});

/** The samples at which the track turns back, by the sign of its slope. */
function turnaroundsOf(track: number[]): number[] {
  const turns: number[] = [];
  for (let i = 1; i < track.length - 1; i++) {
    const before = Math.sign(track[i] - track[i - 1]);
    const after = Math.sign(track[i + 1] - track[i]);
    if (before && after && before !== after) turns.push(i);
  }
  return turns;
}
