import { Injector } from '@angular/core';
import { Coord } from '../model/coord';
import { Joint, PrisJoint, RealJoint, RevJoint } from '../model/joint';
import { JointOperation, refuseJointOperation } from '../model/joint-operation-permission';
import { RealLink } from '../model/link';
import { resolveSlotDropTarget } from '../model/drop-target';
import { JointTypeService } from './joint-type.service';
import { createMechanismHarness, wireGraph } from '../../test-utils/mechanism-harness';

// Guards around three structural toggles: Weld on a joint with nothing to
// fuse, slot candidates on a welded compound, and Slider on a grounded joint.

type Harness = ReturnType<typeof createMechanismHarness>;

/** Whether a weld in this direction would be offered: the permission model's answer. */
function weldOffered(harness: Harness, joint: Joint, operation: JointOperation): boolean {
  return (
    refuseJointOperation(joint, operation, harness.service.gridUtils.operationContext()) ===
    undefined
  );
}

/** A `JointTypeService` over this harness's injector, the way its own spec builds one. */
function jointTypes(harness: Harness): JointTypeService {
  return Injector.create({
    providers: [{ provide: JointTypeService, deps: [] }],
    parent: harness.injector,
  }).get(JointTypeService);
}

/** A bare link A-B with a tracer T riding on it. T connects exactly one link. */
function linkWithTracer() {
  const harness = createMechanismHarness();
  const a = new RevJoint('A', 0, 0);
  const b = new RevJoint('B', 4, 0);
  const t = new RevJoint('T', 2, 0);
  const ab = new RealLink('ABT', [a, b, t], 1, 1, new Coord(2, 0));
  harness.service.joints.push(a, b, t);
  harness.service.links.push(ab);
  wireGraph(harness.service);
  return { ...harness, a, b, t, ab };
}

/** Two bars A-B and B-C, ready to be welded at B into a compound. */
function twoBars() {
  const harness = createMechanismHarness();
  const a = new RevJoint('A', 0, 0);
  const b = new RevJoint('B', 4, 0);
  const c = new RevJoint('C', 4, 3);
  const ab = new RealLink('AB', [a, b], 1, 1, new Coord(2, 0));
  const bc = new RealLink('BC', [b, c], 1, 1, new Coord(4, 1.5));
  harness.service.joints.push(a, b, c);
  harness.service.links.push(ab, bc);
  wireGraph(harness.service);
  return { ...harness, a, b, c, ab, bc };
}

/** The joint with this letter as the drawing holds it now. */
function live(service: { joints: { id: string }[] }, id: string) {
  return service.joints.find((joint) => joint.id === id) as RealJoint | undefined;
}

describe('weld on a joint that connects fewer than two links', () => {
  it('is not offered: the shared predicate declines a one-link joint', () => {
    const s = linkWithTracer();
    expect(weldOffered(s, s.t, 'weld')).toBe(false);
    expect(weldOffered(s, s.a, 'weld')).toBe(false);
  });

  it('is offered where there is something to fuse, and on any welded joint', () => {
    const s = twoBars();
    expect(weldOffered(s, s.b, 'weld')).toBe(true);
    s.service.weldJoint(s.b);
    expect(s.b.isWelded).toBe(true);
    // The same control is how the weld comes off again.
    expect(weldOffered(s, s.b, 'unweld')).toBe(true);
  });

  it('refuses the mutation outright, changing nothing and saving nothing', () => {
    const s = linkWithTracer();
    const linkIDsBefore = s.service.links.map((link) => link.id);

    s.service.weldJoint(s.t);

    expect(s.t.isWelded).toBe(false);
    expect(s.service.links.map((link) => link.id)).toEqual(linkIDsBefore);
    expect(s.saveCount()).toBe(0);
  });

  it('tolerates a retype with no resolvable selection', () => {
    const s = linkWithTracer();
    // A stale joint: the menu can fire after the joint is gone.
    const stale = new RevJoint('Z', 9, 9);
    s.active.updateSelectedObj(stale);
    expect(() => jointTypes(s).set(stale, 'welded')).not.toThrow();
  });

  it('still makes a Slide on a slider carrying a single rider', () => {
    // A slider counted its block: rider plus block was two links, so the
    // two-link guard happened to let a Slide through. A slider holds only its
    // riders now, and one is enough -- the slot is the other half of what is
    // held. The guard must not close that door by counting.
    const s = linkWithTracer();
    s.active.updateSelectedObj(s.t);
    s.service.toggleSlider();

    const slider = live(s.service, 'T')!;
    expect(slider instanceof PrisJoint, 'the tracer became the slider').toBe(true);
    expect(slider.links.length, 'one rider, where there used to be a block as well').toBe(1);
    expect(weldOffered(s, slider, 'weld')).toBe(true);

    s.service.weldJoint(slider);
    expect((slider as PrisJoint).rotates).toBe(false);
  });
});

describe('slot candidates on a welded compound', () => {
  /** The two-bar L welded at B, plus a free joint Z to drag. */
  function weldedL() {
    const s = twoBars();
    s.service.weldJoint(s.b);
    const compound = s.service.links.find(
      (link): link is RealLink => link instanceof RealLink && link.subset.length > 0
    )!;
    const z = new RevJoint('Z', 10, 10);
    return { ...s, compound, z };
  }

  it('never offers a segment joining joints of different sub-links', () => {
    const s = weldedL();
    // The midpoint of the A-C diagonal: 1.5 from bar AB, 2 from bar BC, and 0
    // from the cross-sub-link pair the compound's joint union used to offer.
    const hit = resolveSlotDropTarget(s.z, 2, 1.5, [s.compound], 1);
    expect(hit).toBeUndefined();
  });

  it('still offers each sub-link its own segments, carried by the compound', () => {
    const s = weldedL();
    const hit = resolveSlotDropTarget(s.z, 2, 0.2, [s.compound], 1);
    expect(hit).toBeDefined();
    expect(hit!.carrier.id).toBe(s.compound.id);
    expect([hit!.a.id, hit!.b.id].sort()).toEqual(['A', 'B']);
  });

  it('leaves a non-welded link exactly as it was: every pair is a candidate', () => {
    const harness = createMechanismHarness();
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 4, 0);
    const c = new RevJoint('C', 4, 3);
    const tern = new RealLink('ABC', [a, b, c], 1, 1, new Coord(3, 1));
    harness.service.joints.push(a, b, c);
    harness.service.links.push(tern);
    wireGraph(harness.service);
    const z = new RevJoint('Z', 10, 10);

    const hit = resolveSlotDropTarget(z, 2, 1.5, [tern], 1);
    expect(hit).toBeDefined();
    expect([hit!.a.id, hit!.b.id].sort()).toEqual(['A', 'C']);
  });
});

describe('slider on a grounded joint', () => {
  function loneBar() {
    const harness = createMechanismHarness();
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 4, 0);
    const ab = new RealLink('AB', [a, b], 1, 1, new Coord(2, 0));
    harness.service.joints.push(a, b);
    harness.service.links.push(ab);
    wireGraph(harness.service);
    return { ...harness, a, b, ab };
  }

  const sliderOf = (s: ReturnType<typeof loneBar>) =>
    s.service.joints.find((j): j is PrisJoint => j instanceof PrisJoint);

  it('ground first, then Slider: always a grounded slider', () => {
    const s = loneBar();
    s.active.updateSelectedObj(s.a);
    s.service.toggleGround();
    expect(s.a.ground).toBe(true);

    s.service.toggleSlider();

    const slider = sliderOf(s)!;
    expect(slider.ground).toBe(true);
    expect(slider.isDangling).toBe(false);
    // The joint that was the pin *is* the slider, and it kept its letter -- so
    // there is no second joint left holding a ground of its own.
    expect(slider.id).toBe('A');
    expect(s.service.joints.filter((joint) => joint.id === 'A')).toHaveLength(1);
  });

  it('Slider first, then Ground: the same grounded slider', () => {
    const s = loneBar();
    s.active.updateSelectedObj(s.a);
    s.service.toggleSlider();
    s.service.toggleGround();

    const slider = sliderOf(s)!;
    expect(slider.ground).toBe(true);
    expect(slider.isDangling).toBe(false);
    expect(slider.id).toBe('A');
  });

  it('a grounded slider survives Slider off and on again', () => {
    const s = loneBar();
    s.active.updateSelectedObj(s.a);
    s.service.toggleGround();
    s.service.toggleSlider();
    const angle = sliderOf(s)!.slotAngle;

    s.service.toggleSlider();
    expect(sliderOf(s)).toBeUndefined();
    // The letter is still there; it is a pin again.
    expect(live(s.service, 'A')).toBeDefined();
    s.active.updateSelectedObj(live(s.service, 'A')!);
    s.service.toggleSlider();

    const slider = sliderOf(s)!;
    expect(slider.ground).toBe(true);
    expect(slider.slotAngle).toBeCloseTo(angle, 9);
  });

  it('an ungrounded joint still grows a dangling slider, not a grounded one', () => {
    const s = loneBar();
    s.active.updateSelectedObj(s.a);
    s.service.toggleSlider();

    const slider = sliderOf(s)!;
    expect(slider.ground).toBe(false);
    expect(slider.isDangling).toBe(true);
  });

  it('spends no new letter on the slider', () => {
    // A slider used to be three objects, and the prismatic one took a letter of
    // its own that nothing ever drew. The surviving joint keeps the pin's --
    // which is what every link id, force and lock already names.
    const s = loneBar();
    s.active.updateSelectedObj(s.a);

    s.service.toggleSlider();

    expect(s.service.joints.map((joint) => joint.id).sort()).toEqual(['A', 'B']);
    expect(s.service.links.map((link) => link.id)).toEqual(['AB']);
  });
});

describe('weld on a grounded joint', () => {
  it('is offered, and takes effect', () => {
    // It used to be offered and then quietly refused a layer down: the control
    // is enabled whenever there are two links to fuse, and `canBeWelded`
    // separately excluded any grounded joint. Pressed, nothing happened and
    // nothing was said.
    const s = twoBars();
    s.b.ground = true;

    expect(weldOffered(s, s.b, 'weld')).toBe(true);
    s.service.weldJoint(s.b);

    expect(s.b.isWelded).toBe(true);
    const compound = s.service.links.find((link) => (link as RealLink).subset.length > 0);
    expect(compound, 'the two bars fused into one body').toBeDefined();
  });

  it('reaches the same place as welding first and grounding after', () => {
    // The argument for allowing it at all. The forbidden state was reachable by
    // doing the two edits in the other order, with no refusal anywhere, so the
    // rule was an accident of ordering rather than a claim about the model.
    const groundedFirst = twoBars();
    groundedFirst.b.ground = true;
    groundedFirst.service.weldJoint(groundedFirst.b);

    const weldedFirst = twoBars();
    weldedFirst.service.weldJoint(weldedFirst.b);
    weldedFirst.b.ground = true;

    const shape = (harness: ReturnType<typeof twoBars>) =>
      harness.service.links
        .map((link) => `${link.id}:${(link as RealLink).subset.map((leaf) => leaf.id).join('+')}`)
        .sort()
        .join('|');
    expect(shape(groundedFirst)).toBe(shape(weldedFirst));
    expect(groundedFirst.b.isWelded).toBe(weldedFirst.b.isWelded);
  });

  it('still refuses a driven joint, which is a real contradiction', () => {
    // Unlike ground: a weld says the bodies here do not move relative to each
    // other and an input says they do. That one is grayed, not silent.
    const s = twoBars();
    s.b.input = true;
    expect(weldOffered(s, s.b, 'weld')).toBe(false);
    expect(s.b.canBeWelded()).toBe(false);
  });
});
