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
});
