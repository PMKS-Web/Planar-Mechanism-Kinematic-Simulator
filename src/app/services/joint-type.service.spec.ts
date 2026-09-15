// joint.ts first: the model modules form an import cycle that only initializes
// cleanly when entered here.
import '../model/joint';
import { Injector } from '@angular/core';
import { RealJoint, RevJoint } from '../model/joint';
import { RealLink } from '../model/link';
import { JointType } from '../model/joint-type';
import { createMechanismHarness, wireGraph } from '../../test-utils/mechanism-harness';
import { JointTypeService } from './joint-type.service';

/**
 * A change of joint type is one press, so it is one edit: whichever of the
 * block and the weld it has to change, the history gets one entry, and a
 * change the model refuses gets none and changes nothing.
 */
function bentBar() {
  const harness = createMechanismHarness();
  const a = new RevJoint('A', 0, 0);
  const b = new RevJoint('B', 2, 0);
  const c = new RevJoint('C', 3, 2);
  harness.service.joints = [a, b, c];
  harness.service.links = [new RealLink('AB', [a, b]), new RealLink('BC', [b, c])];
  wireGraph(harness.service);
  harness.active.updateSelectedObj(c);
  const types = Injector.create({
    providers: [{ provide: JointTypeService, deps: [] }],
    parent: harness.injector,
  }).get(JointTypeService);
  return { harness, types, a, b, c };
}

describe('JointTypeService', () => {
  it('walks a pin through every type and back, one history entry per change', () => {
    const { harness, types, b } = bentBar();
    const walk: JointType[] = ['prismatic', 'welded', 'pin-in-slot', 'revolute', 'welded'];
    for (const type of walk) {
      const before = harness.saveCount();
      expect(types.set(b, type), `to ${type}`).toBe(true);
      expect(types.typeOf(b), `to ${type}`).toBe(type);
      expect(harness.saveCount() - before, `to ${type}`).toBe(1);
    }
  });

  it('makes a pin on one bar Prismatic, the block and the weld in one entry', () => {
    const { harness, types, a } = bentBar();
    const before = harness.saveCount();

    expect(types.set(a, 'prismatic')).toBe(true);

    expect(types.typeOf(a)).toBe('prismatic');
    expect(harness.saveCount() - before).toBe(1);
  });

  it('refuses what the model refuses, and then changes and saves nothing', () => {
    const { harness, types, a } = bentBar();
    const before = harness.saveCount();

    // A has one link, so there is nothing at it for a weld to fuse.
    expect(types.refusal(a, 'welded')?.short).toBe('needs 2 links');
    expect(types.set(a, 'welded')).toBe(false);

    expect(types.typeOf(a)).toBe('revolute');
    expect(harness.saveCount()).toBe(before);
  });

  it('puts the selection back where it was once the change is made', () => {
    const { harness, types, b, c } = bentBar();

    types.set(b, 'pin-in-slot');

    expect(harness.active.selectedJoint).toBe(c);
  });

  it('puts the block on the joint it was asked about, not on the joint selected', () => {
    // Every edit ends by putting the selection back on what the reader
    // selected, and the slider edit reads the selection. Welded to Pin-in-slot
    // is an unweld and then a block, and the block once landed on C.
    const { harness, types, b } = bentBar();
    types.set(b, 'welded');

    expect(types.set(b, 'pin-in-slot')).toBe(true);

    const c = harness.service.joints.find((joint) => joint.id === 'C') as RealJoint;
    expect(types.typeOf(c)).toBe('revolute');
  });

  it('hands back the same choice until an edit moves the drawing on', () => {
    const { harness, types, b } = bentBar();
    const first = types.choiceFor(b);
    expect(types.choiceFor(b)).toBe(first);

    harness.service.updateMechanism(false);

    const next = types.choiceFor(b);
    expect(next).not.toBe(first);
    expect(next).toEqual(first);
  });

  it('keeps a grounded joint grounded through a change of type, in one entry', () => {
    // The choice draws every type on the frame while Grounded is on, so the
    // Revolute it offers a grounded slider is a ground pin. Taking the block
    // off used to drop the ground its slot carried.
    const { harness, types, a } = bentBar();
    a.ground = true;
    harness.service.updateMechanism(false);
    types.set(a, 'pin-in-slot');
    const before = harness.saveCount();

    expect(types.set(a, 'revolute')).toBe(true);

    const pin = harness.service.joints.find((joint) => joint.id === 'A') as RealJoint;
    expect(pin.ground).toBe(true);
    expect(harness.saveCount() - before).toBe(1);
  });

  it('reads a slider as grounded by its guide, not by its pin', () => {
    const { harness, types, a } = bentBar();
    a.ground = true;
    harness.service.updateMechanism(false);

    types.set(a, 'pin-in-slot');

    const pin = harness.service.joints.find((joint) => joint.id === 'A') as RealJoint;
    expect(pin.ground).toBe(false);
    expect(types.isGrounded(pin)).toBe(true);
    expect(types.choiceFor(pin).icons[0]).toBe('joint_revolute_grounded');
  });
});
