// joint.ts first: the model modules form an import cycle that only initializes
// cleanly when entered here.
import '../model/joint';
import { Injector } from '@angular/core';
import { PrisJoint, RealJoint, RevJoint } from '../model/joint';
import { RealLink } from '../model/link';
import { JointType } from '../model/joint-type';
import { createMechanismHarness, wireGraph } from '../../test-utils/mechanism-harness';
import { JointTypeService } from './joint-type.service';

/**
 * A change of joint type is one press, so it is one edit: whichever of the slot
 * and the weld it has to change, the history gets one entry, and a change the
 * model refuses gets none and changes nothing.
 *
 * Every joint here is fetched by its **letter** rather than held as an object.
 * Gaining or losing a slot exchanges the joint for one of the other class --
 * a `PrisJoint` for a `RevJoint` -- keeping its letter (Stage 1 of
 * `docs/joint-type-and-cylinder-plan.md`), so a held reference is a dead object
 * the moment the type changes. Held anyway, `typeOf` reads the corpse, decides
 * the drawing already has the type being asked for, and reports success having
 * done nothing.
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
  /** The joint with this letter, as the drawing holds it now. */
  const live = (id: string): RealJoint =>
    harness.service.joints.find((joint) => joint.id === id) as RealJoint;
  return { harness, types, live, a, b, c };
}

describe('JointTypeService', () => {
  it('walks a pin through every type and back, one history entry per change', () => {
    const { harness, types, live } = bentBar();
    const walk: JointType[] = ['prismatic', 'welded', 'pin-in-slot', 'revolute', 'welded'];
    for (const type of walk) {
      const before = harness.saveCount();
      expect(types.set(live('B'), type), `to ${type}`).toBe(true);
      expect(types.typeOf(live('B')), `to ${type}`).toBe(type);
      expect(harness.saveCount() - before, `to ${type}`).toBe(1);
    }
  });

  it('makes a pin on one bar Prismatic, the slot and the weld in one entry', () => {
    const { harness, types, live } = bentBar();
    const before = harness.saveCount();

    expect(types.set(live('A'), 'prismatic')).toBe(true);

    expect(types.typeOf(live('A'))).toBe('prismatic');
    expect(harness.saveCount() - before).toBe(1);
  });

  it('spends no new letter on the joint it retypes', () => {
    // A slider used to be three objects, and the prismatic one took a letter of
    // its own that nothing ever drew. The surviving joint keeps the pin's,
    // which is what every link id, force and lock already names.
    const { harness, types, live } = bentBar();

    types.set(live('B'), 'pin-in-slot');

    expect(harness.service.joints.map((joint) => joint.id).sort()).toEqual(['A', 'B', 'C']);
    expect(harness.service.links.map((link) => link.id).sort()).toEqual(['AB', 'BC']);
    expect(live('B') instanceof PrisJoint).toBe(true);
  });

  it('refuses what the model refuses, and then changes and saves nothing', () => {
    const { harness, types, live } = bentBar();
    const before = harness.saveCount();

    // A has one link, so there is nothing at it for a weld to fuse.
    expect(types.refusal(live('A'), 'welded')?.short).toBe('needs 2 links');
    expect(types.set(live('A'), 'welded')).toBe(false);

    expect(types.typeOf(live('A'))).toBe('revolute');
    expect(harness.saveCount()).toBe(before);
  });

  it('puts the selection back where it was once the change is made', () => {
    const { harness, types, live, c } = bentBar();

    types.set(live('B'), 'pin-in-slot');

    expect(harness.active.selectedJoint).toBe(c);
  });

  it('puts it back on the joint that replaced the one retyped, not on the one dropped', () => {
    // The test above retypes a joint the reader has *not* selected, which is
    // the one arrangement where this cannot go wrong. The panel is the other
    // one: it changes the type of whatever is selected, so the joint put back
    // is the joint just exchanged. Gaining a slot swaps it for one of the other
    // class keeping its letter, so restoring the object restores the one the
    // drawing has dropped.
    const { harness, types, live } = bentBar();
    harness.active.updateSelectedObj(live('B'));

    types.set(live('B'), 'pin-in-slot');

    expect(harness.active.selectedJoint).toBe(live('B'));
    expect(harness.active.selectedJoint).toBeInstanceOf(PrisJoint);
  });

  it('takes a second press, read off the selection the way the panel reads it', () => {
    // `EditPanelComponent.setJointType` reads `selectedJoint` on every press.
    // Handed back a joint the drawing no longer holds, the second press reads
    // the old flags off it, decides the drawing is already the type being asked
    // for, and returns having written nothing -- no slot, and no history entry.
    const { harness, types, live } = bentBar();
    harness.active.updateSelectedObj(live('B'));

    expect(types.set(harness.active.selectedJoint, 'pin-in-slot')).toBe(true);
    expect(types.typeOf(harness.active.selectedJoint)).toBe('pin-in-slot');

    const before = harness.saveCount();
    expect(types.set(harness.active.selectedJoint, 'revolute')).toBe(true);

    expect(types.typeOf(live('B'))).toBe('revolute');
    expect(live('B') instanceof PrisJoint).toBe(false);
    expect(harness.saveCount() - before).toBe(1);
  });

  it('puts the slot on the joint it was asked about, not on the joint selected', () => {
    // Every edit ends by putting the selection back on what the reader
    // selected, and the slider edit reads the selection. Welded to Pin-in-slot
    // is an unweld and then a slot, and the slot once landed on C.
    const { types, live } = bentBar();
    types.set(live('B'), 'welded');

    expect(types.set(live('B'), 'pin-in-slot')).toBe(true);

    expect(types.typeOf(live('C'))).toBe('revolute');
  });

  it('hands back the same choice until an edit moves the drawing on', () => {
    const { harness, types, live } = bentBar();
    const b = live('B');
    const first = types.choiceFor(b);
    expect(types.choiceFor(b)).toBe(first);

    harness.service.updateMechanism(false);

    const next = types.choiceFor(b);
    expect(next).not.toBe(first);
    expect(next).toEqual(first);
  });

  it('keeps a grounded joint grounded through a change of type, in one entry', () => {
    // The choice draws every type on the frame while Grounded is on, so the
    // Revolute it offers a grounded slider is a ground pin. Taking the slot off
    // used to drop the ground it carried.
    const { harness, types, live } = bentBar();
    live('A').ground = true;
    harness.service.updateMechanism(false);
    types.set(live('A'), 'pin-in-slot');
    const before = harness.saveCount();

    expect(types.set(live('A'), 'revolute')).toBe(true);

    expect(live('A').ground).toBe(true);
    expect(harness.saveCount() - before).toBe(1);
  });

  it('reads a grounded slider as grounded, on the joint itself', () => {
    // The ground belongs to the guide, and the guide used to be a prismatic
    // joint beside the pin the panel had selected -- so this asked one object
    // and drew the other. One joint is both now: it carries the ground, and the
    // choice reads it straight off.
    const { harness, types, live } = bentBar();
    live('A').ground = true;
    harness.service.updateMechanism(false);

    types.set(live('A'), 'pin-in-slot');

    const slider = live('A');
    expect(slider instanceof PrisJoint).toBe(true);
    expect(slider.ground, 'the slot is what is grounded').toBe(true);
    expect(types.isGrounded(slider)).toBe(true);
    expect(types.choiceFor(slider).icons[0]).toBe('joint_revolute_grounded');
  });
});
