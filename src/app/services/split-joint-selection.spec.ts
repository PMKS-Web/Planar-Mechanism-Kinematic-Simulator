import { Injector } from '@angular/core';
import { PrisJoint, RealJoint, RevJoint } from '../model/joint';
import { buildMechanism, MechanismFixture } from '../../test-utils/verification/fixture';
import {
  splitDanglingSliderFixture,
  splitPinFixture,
  splitSliderFixture,
} from '../../test-utils/verification/split-joint-fixtures';
import { createMechanismHarness } from '../../test-utils/mechanism-harness';
import { encodeUrlOf } from '../../test-utils/url-encoding';
import { SplitJointService } from './split-joint.service';
import { StringTranscoder } from './transcoding/string-transcoder';
import { MechanismBuilder } from './transcoding/mechanism-builder';
import { MechanismService } from './mechanism.service';
import { SettingsService } from './settings.service';
import { ActiveObjService } from './active-obj.service';

function scene(fixture: MechanismFixture) {
  const harness = createMechanismHarness();
  const built = buildMechanism(fixture);
  harness.service.joints = built.joints;
  harness.service.links = built.links;
  harness.service.finishStructuralEdit(false);
  const injector = Injector.create({
    parent: harness.injector,
    providers: [{ provide: SplitJointService, deps: [] }],
  });
  const joint = harness.service.joints.find((one) => one.id === 'B') as RealJoint;
  return { ...harness, joint, split: injector.get(SplitJointService) };
}

describe('choosing a joint split', () => {
  it.each(['pin-in-slot', 'prismatic'] as const)(
    'splits the two links on a detached %s without requiring a type change',
    (type) => {
      const s = scene(splitDanglingSliderFixture(type));
      const slider = s.joint as PrisJoint;
      expect(slider.isDangling).toBe(true);
      expect(s.split.choiceFor(slider).refusal).toBeUndefined();
      s.split.request(slider);
      expect(s.split.requestedFor(slider)).toBe(true);
      expect(s.saveCount()).toBe(0);
      expect(s.split.split(slider, { kind: 'detach', links: ['BE'] })).toBe(true);
      expect(s.service.joints).toHaveLength(4);
      expect(s.service.joints.find((one) => one.id === 'B')).toBe(slider);
      expect([slider.isDangling, slider.rotates, slider.x, slider.y]).toEqual([
        true,
        type === 'pin-in-slot',
        0,
        0,
      ]);
      expect(slider.links.map((link) => link.id)).toEqual(['BD']);
      const pin = s.service.joints.find((one) => one.id === 'F') as RealJoint;
      expect(pin).toBeInstanceOf(RevJoint);
      expect(pin.links.map((link) => link.id)).toEqual(['EF']);
      expect(s.split.choiceFor(slider)).toMatchObject({
        refusal: 'needs-links',
        short: 'needs 2 links',
        long: 'Only one link is on this joint, so there is nothing to split.',
      });
      expect(s.saveCount()).toBe(1);
    }
  );
  it('opens a draft for three links and saves nothing until Separate', () => {
    const s = scene(splitPinFixture());
    const before = encodeUrlOf(s.service, s.settings);
    s.split.request(s.joint);
    expect(s.split.requestedFor(s.joint)).toBe(true);
    expect(encodeUrlOf(s.service, s.settings)).toBe(before);
    expect(s.saveCount()).toBe(0);
    s.split.cancel();
    expect(s.split.requestedFor(s.joint)).toBe(false);
    expect(s.saveCount()).toBe(0);
  });

  it('keeps the unchosen links and the original position while detaching one link', () => {
    const s = scene(splitPinFixture());
    expect(s.split.split(s.joint, { kind: 'detach', links: ['BD'] })).toBe(true);
    expect(s.joint.links.map((link) => link.id).sort()).toEqual(['AB', 'BC']);
    expect([s.joint.x, s.joint.y]).toEqual([0, 0]);
    const created = s.service.joints.find((one) => one.id === 'E') as RealJoint;
    expect(created).toBeInstanceOf(RevJoint);
    expect(created.links.map((link) => link.id)).toEqual(['DE']);
    expect(created.x).not.toBe(s.joint.x);
    expect(s.saveCount()).toBe(1);
  });

  it('keeps two selected links together on exactly one new pin', () => {
    const s = scene(splitPinFixture(4));
    expect(s.split.split(s.joint, { kind: 'detach', links: ['BD', 'BE'] })).toBe(true);
    expect(s.service.joints).toHaveLength(6);
    const created = s.service.joints.find((one) => one.id === 'F') as RealJoint;
    expect(created.links.map((link) => link.id).sort()).toEqual(['DF', 'EF']);
    expect(s.joint.links.map((link) => link.id).sort()).toEqual(['AB', 'BC']);
    expect(s.saveCount()).toBe(1);
  });

  it.each(['pin-in-slot', 'prismatic'] as const)(
    'preserves the retained %s, its carrier, drive and authored position',
    (type) => {
      const s = scene(splitSliderFixture(type));
      const slider = s.joint as PrisJoint;
      slider.input = true;
      slider.driveSpeed = 3.5;
      const carrier = slider.carrier;
      const guide = [slider.slotJointA, slider.slotJointB];
      expect(s.split.split(slider, { kind: 'detach', links: ['BE'] })).toBe(true);
      expect(s.service.joints.find((one) => one.id === 'B')).toBe(slider);
      expect(slider.isFloating).toBe(true);
      expect(slider.carrier).toBe(carrier);
      expect([slider.slotJointA, slider.slotJointB]).toEqual(guide);
      expect([slider.x, slider.y, slider.input, slider.driveSpeed, slider.rotates]).toEqual([
        0,
        0,
        true,
        3.5,
        type === 'pin-in-slot',
      ]);
      expect(slider.links.map((link) => link.id)).toEqual(['BD']);
      const pin = s.service.joints.find((one) => one.id === 'F') as RealJoint;
      expect(pin).toBeInstanceOf(RevJoint);
      expect([pin.input, pin.ground, pin.isWelded, pin.driveSpeed]).toEqual([
        false,
        false,
        false,
        0,
      ]);
      expect(pin.links.map((link) => link.id)).toEqual(['EF']);
      expect(s.saveCount()).toBe(1);
    }
  );

  it('retains a grounded prismatic guide rather than refusing it as a weld', () => {
    const s = scene(splitSliderFixture('prismatic', true));
    expect(s.split.choiceFor(s.joint).refusal).toBeUndefined();
    expect(s.split.split(s.joint, { kind: 'detach', links: ['BE'] })).toBe(true);
    expect(s.joint).toBeInstanceOf(PrisJoint);
    expect(s.joint.ground).toBe(true);
    expect((s.joint as PrisJoint).rotates).toBe(false);
    expect(s.joint.links.map((link) => link.id)).toEqual(['BD']);
  });

  it.each([
    { links: [] },
    { links: ['AB', 'BC', 'BD'] },
    { links: ['missing'] },
    { links: ['BD', 'BD'] },
  ])('refuses an empty, exhaustive or stale selection without saving: %j', ({ links }) => {
    const s = scene(splitPinFixture());
    const before = encodeUrlOf(s.service, s.settings);
    expect(s.split.split(s.joint, { kind: 'detach', links })).toBe(false);
    expect(encodeUrlOf(s.service, s.settings)).toBe(before);
    expect(s.saveCount()).toBe(0);
  });

  it('invalidates the open draft when the drawing is edited', () => {
    const s = scene(splitPinFixture());
    s.split.request(s.joint);
    s.service.finishStructuralEdit(false);
    expect(s.split.requestedFor(s.joint)).toBe(false);
  });

  it('only disconnects a slider carrier when explicitly requested', () => {
    const s = scene(splitSliderFixture('prismatic'));
    const riders = s.joint.links.map((link) => link.id);
    s.split.request(s.joint);
    expect((s.joint as PrisJoint).isFloating).toBe(true);
    expect(s.split.split(s.joint, { kind: 'guide' })).toBe(true);
    expect((s.joint as PrisJoint).isDangling).toBe(true);
    expect(s.joint.links.map((link) => link.id)).toEqual(riders);
    expect(s.service.joints).toHaveLength(5);
    expect(s.saveCount()).toBe(1);
  });

  it('round-trips retained sliders and detached groups through the existing URL codec', () => {
    const s = scene(splitSliderFixture('prismatic'));
    s.split.split(s.joint, { kind: 'detach', links: ['BE'] });
    const decoder = new StringTranscoder();
    decoder.decodeURL(encodeUrlOf(s.service, s.settings));
    const restored = {
      joints: [],
      links: [],
      forces: [],
      mechanismTimeStep: 0,
    } as unknown as MechanismService;
    new MechanismBuilder(restored, decoder, new SettingsService(), new ActiveObjService()).build(
      false
    );
    const slider = restored.joints.find((one) => one.id === 'B') as PrisJoint;
    expect(slider).toBeInstanceOf(PrisJoint);
    expect([slider.isFloating, slider.rotates, slider.carrier?.id]).toEqual([true, false, 'AC']);
    expect(slider.links.map((link) => link.id)).toEqual(['BD']);
    expect(restored.links.map((link) => link.id).sort()).toEqual(['AC', 'BD', 'EF']);
  });
});
