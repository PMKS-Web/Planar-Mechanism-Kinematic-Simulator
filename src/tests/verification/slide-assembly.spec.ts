// joint.ts first: the model modules form an import cycle that only initializes
// cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { PrisJoint, RealJoint, RevJoint } from '../../app/model/joint';
import { RealLink } from '../../app/model/link';
import {
  assemblyBodyIds,
  hasFixedOrientation,
  slideAssemblies,
  slideAssemblyAt,
} from '../../app/model/slide-assembly';
import { buildMechanism } from '../../test-utils/verification/fixture';
import { scotchYokeFixture } from '../../test-utils/verification/slot-fixtures';

// The resolver is the single answer to "which bodies does this weld make
// rigid?" (docs/phase-3-slide-spec.md §3.0). Everything downstream reads it, so
// the states it must and must not recognize are asserted here rather than
// rediscovered by each consumer.
//
// The states themselves changed shape in Stage 1 of
// `docs/joint-type-and-cylinder-plan.md`: a Slide was a prismatic joint, a
// coincident pin carrying the weld, and a zero-length block joining them, and
// it is one joint carrying `rotates` now. So the assembly is named by the joint
// that slides, and the riders are the only bodies it holds.

function jointNamed(built: ReturnType<typeof buildMechanism>, id: string): RealJoint {
  return built.joints.find((joint) => joint.id === id) as RealJoint;
}

describe('resolving a slide assembly', () => {
  it('sees the Scotch yoke welded at C', () => {
    const built = buildMechanism(scotchYokeFixture());

    const assembly = slideAssemblyAt(jointNamed(built, 'C'));

    expect(assembly).toBeDefined();
    // C, the joint that slides. It keeps the pin's letter, which is the letter
    // the canvas always drew; the prismatic twin this used to name was F.
    expect(assembly!.slider.id).toBe('C');
    expect(assembly!.grounded).toBe(true);
    expect(assembly!.riders.map((rider) => rider.id)).toEqual(['CD']);
    // The riders, and only them: the block was the other body this used to
    // name, and a slider is a joint rather than a body now.
    expect(assemblyBodyIds(assembly!).sort()).toEqual(['CD']);
  });

  it('finds exactly one assembly in the mechanism', () => {
    const built = buildMechanism(scotchYokeFixture());

    // B slides too, but its riders may turn against the slot -- it is a Slot,
    // not a Slide. Named by the joint that slides, which is the joint that
    // records the Slide now that there is no pin to carry a weld.
    expect(slideAssemblies(built.joints).map((a) => a.slider.id)).toEqual(['C']);
  });

  it('declines a welded joint that does not slide', () => {
    // An ordinary compound weld. Sharing a resolver with the compound path is
    // exactly the confusion this must not create.
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 1, 0);
    const c = new RevJoint('C', 2, 0);
    const left = new RealLink('AB', [a, b], 1, 1);
    const right = new RealLink('BC', [b, c], 1, 1);
    b.links = [left, right];
    b.isWelded = true;

    expect(slideAssemblyAt(b)).toBeUndefined();
  });

  it('declines a slider whose riders may turn in its slot', () => {
    const built = buildMechanism(scotchYokeFixture());

    expect(slideAssemblyAt(jointNamed(built, 'B'))).toBeUndefined();
  });

  it('is decided by the joint, not by the shape of anything riding it', () => {
    // Four cases used to stand here and every one of them was about a *block*:
    // two blocks on one pin, a block carrying a third joint, a block holding a
    // different joint of the same id, a block with no sliding joint in it. None
    // of those shapes can be drawn now -- the slider is the joint, so there is
    // nothing to hold coincident with it and nothing to choose between. What is
    // left to pin is that the answer comes from the joint's own two facts, and
    // that the shape of a rider is not one of them: a ternary body rides a
    // Slide as readily as a bar does.
    const slider = new PrisJoint('A', 0, 0, false, true);
    const rider = new RealLink(
      'ABC',
      [slider, new RevJoint('B', 1, 0), new RevJoint('C', 0, 1)],
      1,
      1
    );
    slider.links = [rider];

    expect(slideAssemblyAt(slider)).toBeUndefined();

    slider.rotates = false;
    expect(slideAssemblyAt(slider)!.riders.map((one) => one.id)).toEqual(['ABC']);
  });

  it('resolves from the sliding joint, which is the only end there is', () => {
    // The reverse of what this asked before. The weld used to belong to the
    // coincident pin, so resolving from the slider would have reported the same
    // assembly twice and double-counted it in the mobility merge; the slider is
    // the whole joint now, and `rotates` on it is the record.
    const built = buildMechanism(scotchYokeFixture());
    const slider = built.joints.find((joint) => joint.id === 'C') as PrisJoint;

    expect(slideAssemblyAt(slider)).toBeDefined();
    expect(slideAssemblyAt(slider)!.slider).toBe(slider);
    expect(slideAssemblies(built.joints).map((a) => a.slider.id)).toEqual(['C']);
  });

  it('declines a Slide with nothing riding the slot', () => {
    // A Slide holds its riders still against the slot, so one with no rider
    // holds nothing and is not an assembly at all.
    const slider = new PrisJoint('P', 0, 0, false, true);
    slider.rotates = false;

    expect(slideAssemblyAt(slider)).toBeUndefined();
  });

  it('resolves a rider that is not yet compounded, so a reconcile can repair it', () => {
    // Mid-edit the flag can outrun the compound: mergeJoints takes a weld apart
    // and rebuilds it. Refusing here would make the reconcile read "not a
    // Slide" and destroy a weld the user made.
    const slider = new PrisJoint('A', 0, 0, false, true);
    const first = new RealLink('AB', [slider, new RevJoint('B', 1, 0)], 1, 1);
    const second = new RealLink('AC', [slider, new RevJoint('C', 0, 1)], 1, 1);
    slider.links = [first, second];
    slider.rotates = false;

    const assembly = slideAssemblyAt(slider);

    expect(assembly).toBeDefined();
    expect(assembly!.riders.map((rider) => rider.id)).toEqual(['AB', 'AC']);
  });
});

describe('which links a weld holds at a fixed orientation', () => {
  it('names the rider, which is the whole of what the slot holds', () => {
    const built = buildMechanism(scotchYokeFixture());
    const assemblies = slideAssemblies(built.joints);
    const linkNamed = (id: string) => built.links.find((link) => link.id === id)!;

    expect(hasFixedOrientation(linkNamed('CD'), assemblies)).toBe(true);
    // The block CF used to be named here too -- held at a fixed orientation and
    // part of the same rigid body for mobility, but answered `false` because the
    // solver never gives a block an angular unknown. There is no block to
    // answer for now, so the assembly's bodies are the rider alone.
    expect(assemblyBodyIds(assemblies[0]).sort()).toEqual(['CD']);
    expect(built.links.map((link) => link.id).sort()).toEqual(['AB', 'CD']);
    // The crank turns, and the Slot's rider is free to turn in its slot.
    expect(hasFixedOrientation(linkNamed('AB'), assemblies)).toBe(false);
  });

  it('does not hold a floating assembly fixed', () => {
    // A Slide on a moving carrier tracks that carrier rather than standing
    // still, and Phase 3 does not solve it (§4). Claiming zero here would be a
    // wrong number rather than an honest refusal.
    const built = buildMechanism(scotchYokeFixture());
    const slider = built.joints.find((joint) => joint.id === 'C') as PrisJoint;
    const carrier = built.links.find((link) => link.id === 'AB')!;
    slider.slideOn(carrier, built.joints[0], built.joints[1]);

    const assemblies = slideAssemblies(built.joints);
    expect(assemblies[0].grounded).toBe(false);
    expect(
      hasFixedOrientation(
        built.links.find((l) => l.id === 'CD')!,
        assemblies
      )
    ).toBe(false);
  });
});
