import { Injector } from '@angular/core';
import { TEMPLATE_IDS, TEMPLATE_LINKAGES } from '../component/MODALS/templates/template-linkages';
import { PrisJoint, RealJoint } from '../model/joint';
import { MODEL_SCALE } from '../model/render-scale';
import { createMechanismHarness } from '../../test-utils/mechanism-harness';
import { encodeUrlOf } from '../../test-utils/url-encoding';
import { SplitJointService } from './split-joint.service';
import { MechanismBuilder } from './transcoding/mechanism-builder';
import { StringTranscoder } from './transcoding/string-transcoder';

function load(payload: string) {
  const harness = createMechanismHarness();
  const decoder = new StringTranscoder();
  decoder.decodeURL(payload);
  new MechanismBuilder(harness.service, decoder, harness.settings, harness.active).build(true);
  harness.service.updateMechanism();
  const split = Injector.create({
    parent: harness.injector,
    providers: [{ provide: SplitJointService, deps: [] }],
  }).get(SplitJointService);
  return { ...harness, split };
}

function offSlot(block: PrisJoint): number {
  const a = block.slotJointA!;
  const b = block.slotJointB!;
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length < 1e-9) return 0;
  return Math.abs((b.x - a.x) * (a.y - block.y) - (a.x - block.x) * (b.y - a.y)) / length;
}

const visibleJointIds = (payload: string): string[] =>
  load(payload)
    .service.joints.filter((joint): joint is RealJoint => joint instanceof RealJoint)
    .map((joint) => joint.id);

/**
 * Every joint of every library mechanism, split one at a time from a fresh
 * load. The library is where the shapes a reader actually builds live --
 * slots ending at shared pins, cylinders, welds, blocks with several riders --
 * so this is the sweep that finds the combination nobody wrote a fixture for.
 */
describe('Split Joint across the library', () => {
  const cases = TEMPLATE_IDS.flatMap((template) =>
    visibleJointIds(TEMPLATE_LINKAGES[template]).map((joint) => ({ template, joint }))
  );

  it.each(cases)('$template, joint $joint', ({ template, joint: id }) => {
    const s = load(TEMPLATE_LINKAGES[template]);
    const joint = s.service.joints.find((one) => one.id === id) as RealJoint;
    const before = encodeUrlOf(s.service, s.settings);
    const sliders = s.service.joints.filter(
      (one): one is PrisJoint => one instanceof PrisJoint && one.isFloating
    );
    const slack = new Map(sliders.map((one) => [one.id, offSlot(one)]));
    const choice = s.split.choiceFor(joint);

    if (choice.refusal) {
      expect(s.split.split(joint)).toBe(false);
      expect(encodeUrlOf(s.service, s.settings)).toBe(before);
      expect(s.saveCount()).toBe(0);
      return;
    }

    const count = s.service.joints.length;
    const wasBlock = joint instanceof PrisJoint;
    const at = { x: joint.x, y: joint.y };
    expect(s.split.split(joint)).toBe(true);
    expect(s.saveCount()).toBe(1);

    // One new joint per body that had to leave: every rider of a block, every
    // link but the first at a pin.
    expect(s.service.joints.length - count).toBe(wasBlock ? choice.count : choice.count - 1);
    const kept = s.service.joints.find((one) => one.id === id) as RealJoint;
    if (wasBlock) {
      expect(kept).toBe(joint);
      expect([kept.x, kept.y]).toEqual([at.x, at.y]);
      expect(s.service.isJointOrphan(kept)).toBe(true);
    }

    // Nothing that rides a slot was left off it.
    s.service.joints
      .filter((one): one is PrisJoint => one instanceof PrisJoint && one.isFloating)
      .forEach((one) =>
        expect(offSlot(one)).toBeLessThanOrEqual((slack.get(one.id) ?? 0) + 1e-4 * MODEL_SCALE)
      );

    // Every pin that came out of the split can be grabbed on its own.
    const pins = s.service.joints
      .slice(count)
      .concat(wasBlock ? [] : [kept])
      .filter((one): one is RealJoint => one instanceof RealJoint && !one.locked);
    pins.forEach((one, index) =>
      pins
        .slice(index + 1)
        .forEach((other) => expect(Math.hypot(one.x - other.x, one.y - other.y)).toBeGreaterThan(0))
    );

    // And the result survives the trip through a URL.
    const restored = load(encodeUrlOf(s.service, s.settings));
    expect(restored.service.joints).toHaveLength(s.service.joints.length);
  });
});
