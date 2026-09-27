import '../model/joint';
import { Coord } from '../model/coord';
import { PrisJoint, RealJoint, RevJoint } from '../model/joint';
import { RealLink } from '../model/link';
import { slideAssemblyAt } from '../model/slide-assembly';
import { createMechanismHarness, wireGraph } from '../../test-utils/mechanism-harness';

// A Slide is `rotates` on the sliding joint: what rides the slot cannot turn
// against it. Until Stage 1 of `docs/joint-type-and-cylinder-plan.md` it was a
// weld with no compound behind it -- `isWelded` on a coincident `RevJoint` that
// a zero-length block paired with the slider -- which is a shape the weld code
// had never had to represent. Every way of making, unmaking or disturbing one is
// still its own regression.

/**
 * Crank AB, and a rider CD whose end C is a slider on a grounded guide.
 * Welding C makes it a Slide.
 */
function sliderWithRider() {
  const harness = createMechanismHarness();
  const a = new RevJoint('A', 0, 0, true, true);
  const b = new RevJoint('B', 0, 1);
  const c = new PrisJoint('C', 2, 0, false, true);
  c.angle_rad = 0;
  const d = new RevJoint('D', 2, 2);
  const ab = new RealLink('AB', [a, b], 1, 1, new Coord(0, 0.5));
  const cd = new RealLink('CD', [c, d], 1, 1, new Coord(2, 1));

  harness.service.joints.push(a, b, c, d);
  harness.service.links.push(ab, cd);
  wireGraph(harness.service);
  return { ...harness, a, b, c, d, ab, cd };
}

/** The joint with this letter as the drawing holds it now. */
function live(harness: ReturnType<typeof sliderWithRider>, id: string): RealJoint | undefined {
  const found = harness.service.joints.find((joint) => joint.id === id);
  return found instanceof RealJoint ? found : undefined;
}

describe('welding a slider', () => {
  it('holds its rider against the slot without building a compound', () => {
    const s = sliderWithRider();
    s.active.updateSelectedObj(s.c);

    s.service.weldJoint();

    expect(s.c.rotates).toBe(false);
    // Only one RealLink meets at C, so there is nothing to fuse -- `rotates` is
    // the whole of the Slide, and no compound is built to record it.
    expect(s.service.links.map((link) => link.id).sort()).toEqual(['AB', 'CD']);
    expect(s.c.isWelded, 'no compound, so no compound flag').toBe(false);
    expect(slideAssemblyAt(s.c)).toBeDefined();
  });

  it('is offered on a slider carrying a single rider', () => {
    // The rule `weldNeedsLinks` states: a Slide holds what rides the slot still
    // against it, so one rider is enough and the slot is the other half. The
    // count of links at the joint is one -- it was two while the block was a
    // link of its own -- so a plain length test would refuse this.
    const s = sliderWithRider();

    expect(s.service.gridUtils.canToggleWeld(s.c)).toBe(true);
  });

  it('is refused on a slider with nothing riding it', () => {
    // `isSlideCandidate` is the structural test: a Slide holds its riders, and
    // there are none. Refused outright rather than flagged and then stripped by
    // the reconcile -- what separates the two is the undo entry.
    const s = sliderWithRider();
    const lone = new PrisJoint('Z', 8, 8, false, true);
    s.service.joints.push(lone);
    wireGraph(s.service);
    s.active.updateSelectedObj(lone);
    const before = s.saveCount();

    s.service.weldJoint();

    expect(lone.rotates, 'still a Pin-in-slot').toBe(true);
    expect(slideAssemblyAt(lone)).toBeUndefined();
    expect(s.saveCount(), 'no undo entry for a refused weld').toBe(before);
  });

  it('reads as Prismatic afterwards, and as Pin-in-slot before', () => {
    // The two used to be told apart by `canBeWelded` and `canBeUnwelded` on the
    // coincident pin. A slider's type is the one question now, and the same
    // control makes and unmakes it.
    const s = sliderWithRider();
    const types = s.service.gridUtils;
    expect(types.getWelded(s.c)).toBe(false);

    s.active.updateSelectedObj(s.c);
    s.service.weldJoint();

    expect(types.getWelded(s.c)).toBe(true);
    expect(types.canToggleWeld(s.c), 'the same control takes it off').toBe(true);
  });

  it('unwelds again without needing a compound to take apart', () => {
    // `unweldJointTopology` reports failure when it finds no compound, having
    // already cleared the flag -- so routed there, an unweld would drop the
    // Slide with no rebuild and no undo entry.
    const s = sliderWithRider();
    s.active.updateSelectedObj(s.c);
    s.service.weldJoint();

    s.service.unweldSelectedJoint();

    expect(s.c.rotates).toBe(true);
    expect(slideAssemblyAt(s.c)).toBeUndefined();
    expect(s.service.links.map((link) => link.id).sort()).toEqual(['AB', 'CD']);
  });

  it('is reached by Unweld All too', () => {
    // A one-rider Slide builds no compound and so sets no `isWelded`, which is
    // what that walk used to select on.
    const s = sliderWithRider();
    s.active.updateSelectedObj(s.c);
    s.service.weldJoint();

    s.service.unweldAll();

    expect(s.c.rotates).toBe(true);
  });

  it('earns exactly one undo entry when it takes', () => {
    const s = sliderWithRider();
    s.active.updateSelectedObj(s.c);
    const before = s.saveCount();

    s.service.weldJoint();

    expect(s.c.rotates).toBe(false);
    expect(s.saveCount() - before).toBe(1);
  });
});

describe('a Slide made where two links ride the slot', () => {
  /** A second rider CE on the same slider, so the weld has links to fuse. */
  function twoRiders() {
    const s = sliderWithRider();
    const e = new RevJoint('E', 4, 0);
    const ce = new RealLink('CE', [s.c, e], 1, 1, new Coord(3, 0));
    s.service.joints.push(e);
    s.service.links.push(ce);
    wireGraph(s.service);
    return { ...s, e, ce };
  }

  it('fuses the riders into a compound and holds that against the slot', () => {
    // Every body at the joint becomes rigid, which is what the type means.
    const s = twoRiders();
    s.active.updateSelectedObj(s.c);

    s.service.weldJoint();

    expect(s.c.rotates).toBe(false);
    expect(s.c.isWelded, 'and a compound records the fusing').toBe(true);
    const assembly = slideAssemblyAt(s.c);
    expect(assembly).toBeDefined();
    expect(assembly!.riders.length).toBe(1);
    expect(assembly!.riders[0].subset.map((link) => link.id).sort()).toEqual(['CD', 'CE']);
  });
});

describe('a Slide whose compound has not been built yet', () => {
  it('is repaired rather than stripped', () => {
    // Reachable from ordinary edits -- `mergeJoints` takes a weld apart and
    // rebuilds it -- and from a decoded URL, which arrives with `rotates` set
    // and nothing built at all. Stripping here would destroy a Slide the reader
    // made; leaving it would let a malformed mechanism look settled.
    const s = sliderWithRider();
    const e = new RevJoint('E', 4, 0);
    const ce = new RealLink('CE', [s.c, e], 1, 1, new Coord(3, 0));
    s.service.joints.push(e);
    s.service.links.push(ce);
    wireGraph(s.service);
    s.c.rotates = false;
    expect(slideAssemblyAt(s.c)!.riders.length).toBe(2);

    // Every structural edit passes through here.
    s.service.finishStructuralEdit(true);

    expect(s.c.rotates, 'still a Slide').toBe(false);
    expect(slideAssemblyAt(s.c)!.riders.length).toBe(1);
  });

  it('leaves a legitimate Slide alone', () => {
    // The rule above must not fire on a working assembly. A reconcile that
    // quietly unwelded every Slide would pass most of this file.
    const s = sliderWithRider();
    s.active.updateSelectedObj(s.c);
    s.service.weldJoint();

    s.service.finishStructuralEdit(true);

    expect(s.c.rotates).toBe(false);
    expect(slideAssemblyAt(s.c)).toBeDefined();
  });
});

describe('a compound weld left describing nothing', () => {
  it('is stripped when the slot that made it goes', () => {
    // Taking the slot away turns the slider back into a pin, and the Slide's
    // `rotates` arrives on it as `isWelded` -- a pin with one link and no
    // compound, which is exactly the orphan the reconcile exists to strip.
    const s = sliderWithRider();
    s.active.updateSelectedObj(s.c);
    s.service.weldJoint();

    s.service.toggleSlider();

    const pin = live(s, 'C')!;
    expect(pin, 'the letter survives the change of kind').toBeDefined();
    expect(pin instanceof PrisJoint, 'and it is a pin again').toBe(false);
    expect(pin.isWelded).toBe(false);
  });

  it('survives the ground toggle, which no longer takes the slot', () => {
    // `toggleGround` used to have its own slider-removal branch, so un-grounding
    // a Slide destroyed the block and stranded the weld flag. Ground and the
    // joint's type are independent now (§4.1): un-grounding takes the slot's
    // direction away and nothing else, so the assembly is still an assembly --
    // a dangling one -- and the Slide still describes something real.
    const s = sliderWithRider();
    s.active.updateSelectedObj(s.c);
    s.service.weldJoint();
    s.active.updateSelectedObj(s.c);

    s.service.toggleGround();

    expect(live(s, 'C')).toBeDefined();
    expect(s.c.isDangling).toBe(true);
    expect(s.c.rotates, 'the Slide still has riders behind it').toBe(false);
    expect(slideAssemblyAt(s.c)).toBeDefined();
  });
});

describe('a Slide under a joint-onto-joint merge', () => {
  it('survives a link being dragged onto it', () => {
    // A slider is a legal merge *target* -- dropping a pin onto one is how a
    // link comes to ride a slot -- and the survivor is the slider, so the Slide
    // rides through on the joint that carries it.
    const s = sliderWithRider();
    s.active.updateSelectedObj(s.c);
    s.service.weldJoint();

    const e = new RevJoint('E', 4, 0);
    const f = new RevJoint('F', 4, 2);
    const ef = new RealLink('EF', [e, f], 1, 1, new Coord(4, 1));
    s.service.joints.push(e, f);
    s.service.links.push(ef);
    wireGraph(s.service);

    expect(s.service.mergeJoints(e, s.c)).toBeUndefined();

    expect(s.c.rotates).toBe(false);
    const assembly = slideAssemblyAt(s.c);
    expect(assembly).toBeDefined();
    expect(assembly!.slider.id).toBe('C');
    // One rider, because the reconcile built the compound the merge implied.
    expect(assembly!.riders.length).toBe(1);
  });

  it('refuses to merge the slider itself away', () => {
    // The other direction: the survivor of a merge is the target, so dragging a
    // slider onto a pin would leave its slot naming a joint that is gone.
    const s = sliderWithRider();
    const e = new RevJoint('E', 4, 0);
    const f = new RevJoint('F', 4, 2);
    s.service.joints.push(e, f);
    s.service.links.push(new RealLink('EF', [e, f], 1, 1, new Coord(4, 1)));
    wireGraph(s.service);

    expect(s.service.mergeJoints(s.c, e)).toBe('prismatic');
    expect(live(s, 'C'), 'left exactly as it was').toBeDefined();
  });
});

describe('the assembly invariants after every edit', () => {
  const assertInvariants = (joint: RealJoint) => {
    const assembly = slideAssemblyAt(joint)!;
    expect(assembly, 'resolves').toBeDefined();
    // The sliding joint *is* the assembly's joint: there is no coincident pin
    // to keep in step with it any more, which is what half of these invariants
    // used to be about.
    expect(assembly.slider).toBe(joint);
    // The post-reconcile shape: one rider, and the slider is one of its joints.
    expect(assembly.riders.length).toBe(1);
    expect(assembly.riders[0].joints.map((member) => member.id)).toContain(joint.id);
    // A slot never rides the link it belongs to.
    expect(assembly.riders.some((rider) => rider.id === assembly.slider.carrier?.id)).toBe(false);
  };

  it('hold after welding', () => {
    const s = sliderWithRider();
    s.active.updateSelectedObj(s.c);
    s.service.weldJoint();

    assertInvariants(s.c);
  });

  it('hold after a merge onto the slider', () => {
    const s = sliderWithRider();
    s.active.updateSelectedObj(s.c);
    s.service.weldJoint();
    const e = new RevJoint('E', 4, 0);
    const f = new RevJoint('F', 4, 2);
    s.service.joints.push(e, f);
    s.service.links.push(new RealLink('EF', [e, f], 1, 1, new Coord(4, 1)));
    wireGraph(s.service);

    s.service.mergeJoints(e, s.c);

    assertInvariants(s.c);
  });
});
