// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { TestBed } from '@angular/core/testing';
import { MechanismService } from '../../app/services/mechanism.service';
import { UrlProcessorService } from '../../app/services/url-processor.service';
import { GridUtilsService } from '../../app/services/grid-utils.service';
import { MultiEditService } from '../../app/services/multi-edit.service';
import { ActiveObjService } from '../../app/services/active-obj.service';
import { fixturePayload } from '../../test-utils/verification/fixture-gallery';
import { cylinderBetween } from '../../test-utils/verification/slot-fixtures';
import { MechanismFixture } from '../../test-utils/verification/fixture';
import { RealJoint } from '../../app/model/joint';
import { RealLink } from '../../app/model/link';
import { MODEL_SCALE } from '../../app/model/render-scale';

/**
 * What a cylinder still refuses, now that its mounts refuse nothing.
 *
 * This file used to pin two bans: no weld at a mount, and no merge that would
 * carry one there. **Both are deliberately gone**, and this is where that says
 * so. They were never rules about cylinders -- they were a fence around an
 * unfinished path, and step 5 of `docs/cylinder-mount-joints-plan.md` is the
 * completion of it. A mount is where a ram attaches to the drawing; welding
 * one into a bracket, or giving one a carriage, is the ordinary thing to want,
 * and the solver, the editor and the codec now all have an answer for it.
 *
 * What remains sealed is the ram's *inside*: the buried barrel end, the pin
 * and the slider. Those three are the part, not attachments to it, and none of
 * them is drawn or selectable -- so the negative tests below reach them the
 * only ways anything can, and check that every door is shut.
 *
 * The positive tests are written against what the drawing actually becomes,
 * not against a boolean: which body owns which leaf, where the joints a weld
 * carried ended up, and whether the ram is still a ram afterwards. A rule that
 * merely stops saying no is not the same as a feature that works.
 */

/**
 * A ram with a neighbor bar on each mount, an elbow to merge, and nothing else.
 *
 * Each mount needs a real neighbor: a weld fuses the links that meet at a
 * joint, and a mount with only the ram on it has nothing to fuse -- which is a
 * refusal about arithmetic, not about cylinders, and would make a "the ban is
 * lifted" test pass for the wrong reason.
 */
function ramWithNeighbors(): MechanismFixture {
  const mount = { x: -8, y: 0 };
  const eye = { x: 2, y: 0 };
  const { barrelEnd, pin } = cylinderBetween(mount, eye, 0.5);
  return {
    joints: [
      { id: 'A', ...mount, ground: true },
      { id: 'B', ...barrelEnd },
      { id: 'C', ...pin },
      { id: 'D', ...eye },
      // The barrel mount's neighbor, and the rod mount's — the second a
      // three-joint bar, so a weld there has an extra joint to carry.
      { id: 'G', x: -8, y: 5 },
      { id: 'H', x: 6, y: 2 },
      { id: 'K', x: 6, y: 7 },
      // A free-standing elbow, weldable at W, to merge onto a mount.
      { id: 'W', x: 12, y: 3 },
      { id: 'X', x: 16, y: 3 },
      { id: 'Y', x: 12, y: 8 },
    ],
    links: [
      { joints: 'AB' },
      { joints: 'CD' },
      { joints: 'AG' },
      { joints: 'DHK' },
      { joints: 'WX' },
      { joints: 'WY' },
    ],
    sliders: [{ at: 'C', prisId: 'P', on: { carrier: 'AB', a: 'A', b: 'B' }, sealed: true }],
    welds: ['C'],
    inputAngVel: 1,
  };
}

describe('a cylinder mount is an ordinary joint now', () => {
  let mechanism: MechanismService;
  let grid: GridUtilsService;
  let multi: MultiEditService;
  let active: ActiveObjService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    mechanism = TestBed.inject(MechanismService);
    grid = TestBed.inject(GridUtilsService);
    multi = TestBed.inject(MultiEditService);
    active = TestBed.inject(ActiveObjService);
    TestBed.inject(UrlProcessorService).updateFromURL(
      fixturePayload(ramWithNeighbors()),
      false,
      true,
      true,
      false
    );
  });

  const jointNamed = (id: string) => mechanism.joints.find((joint) => joint.id === id) as RealJoint;
  const ram = () => mechanism.sealedStructures()[0];
  const compoundHolding = (id: string) =>
    mechanism.links.find(
      (link): link is RealLink =>
        link instanceof RealLink &&
        link.subset.length > 0 &&
        link.joints.some((joint) => joint.id === id)
    );

  /** The ram is intact: recognized, sealed, and welded where it must be. */
  function stillARam() {
    const sealed = ram();
    expect(sealed, 'the ram still resolves').toBeDefined();
    expect(sealed.slider.isSealed, 'still sealed').toBe(true);
    expect(sealed.pin.isWelded, 'the pin is still welded').toBe(true);
    return sealed;
  }

  it('offers Weld on a mount that has a neighbor, and refuses one that has none', () => {
    // Two different answers at two joints of the same part, and neither of
    // them is about cylinders: one has two links meeting on it and the other
    // has one.
    expect(grid.canToggleWeld(jointNamed('W')), 'an ordinary elbow').toBe(true);
    expect(grid.canToggleWeld(jointNamed('A')), 'a mount with a neighbor bar').toBe(true);
    expect(grid.canToggleWeld(jointNamed('D')), 'the other mount').toBe(true);

    // And the same mount with its neighbor taken away has nothing to fuse.
    active.updateSelectedObj(jointNamed('G'));
    mechanism.deleteJoint();
    expect(grid.canToggleWeld(jointNamed('A')), 'a mount on its own').toBe(false);
    expect(grid.weldRefusal(jointNamed('A'))?.short).toBe('needs 2 links');
  });

  it('welds both mounts into their neighbors, and the ram survives it', () => {
    for (const id of ['A', 'D']) {
      active.updateSelectedObj(jointNamed(id));
      mechanism.weldJoint();
    }

    const sealed = stillARam();
    // Ownership, not a flag: each of the ram's own bars is a leaf of the
    // compound at its mount, and the resolver reaches it through that body.
    const atBarrel = compoundHolding('A')!;
    const atRod = compoundHolding('D')!;
    expect(atBarrel, 'a body at the barrel mount').toBeDefined();
    expect(atRod, 'a body at the rod mount').toBeDefined();
    expect(atBarrel.subset.map((leaf) => leaf.id).sort()).toEqual(['AB', 'AG']);
    expect(atRod.subset.map((leaf) => leaf.id).sort()).toEqual(['CD', 'DHK']);
    expect(sealed.barrelRoot.id, 'the barrel is owned by the compound').toBe(atBarrel.id);
    expect(sealed.rodRoot.id).toBe(atRod.id);

    // The joints a weld carried are on the body, where they were drawn. A weld
    // fuses; it does not move anything.
    expect(atRod.joints.map((joint) => joint.id).sort()).toEqual(['C', 'D', 'H', 'K']);
    // A fixture is written in user units and decodes into model ones.
    expect([jointNamed('K').x, jointNamed('K').y]).toEqual([6 * MODEL_SCALE, 7 * MODEL_SCALE]);
    expect([jointNamed('H').x, jointNamed('H').y]).toEqual([6 * MODEL_SCALE, 2 * MODEL_SCALE]);
  });

  it('merges a welded elbow onto a mount, in both directions', () => {
    // The route that used to be closed: weld somewhere else, then drag that
    // joint onto the mount. The weld rides along, and the mount joins it.
    active.updateSelectedObj(jointNamed('W'));
    mechanism.weldJoint();
    expect(jointNamed('W').isWelded).toBe(true);

    expect(mechanism.mergeJoints(jointNamed('W'), jointNamed('D'))).toBeUndefined();

    const survivor = jointNamed('D');
    expect(survivor.isWelded, 'the weld came with it').toBe(true);
    const body = compoundHolding('D')!;
    expect(body.subset.map((leaf) => leaf.id).sort()).toEqual(['CD', 'DHK', 'DX', 'DY']);
    stillARam();
  });

  it('and the other way about, dragging the mount onto the weld', () => {
    active.updateSelectedObj(jointNamed('W'));
    mechanism.weldJoint();

    expect(mechanism.mergeJoints(jointNamed('D'), jointNamed('W'))).toBeUndefined();

    const survivor = jointNamed('W');
    expect(survivor.isWelded).toBe(true);
    expect(
      compoundHolding('W')!
        .subset.map((leaf) => leaf.id)
        .sort()
      // A link is named by its joints in sorted order, so the bar that was
      // DHK is HKW once D has become W.
    ).toEqual(['CW', 'HKW', 'WX', 'WY']);
    stillARam();
  });

  it('gives a mount a carriage, and welds it into a Slide', () => {
    active.updateSelectedObj(jointNamed('A'));
    expect(grid.sliderRefusal(jointNamed('A'), true), 'a block at a mount').toBeUndefined();
    mechanism.toggleSlider();

    expect(grid.isAttachedToSlider(jointNamed('A')), 'the mount has a block').toBe(true);
    stillARam();

    // And welding the rider to that block is a Slide, which is the other
    // shape a mount can be attached by.
    active.updateSelectedObj(jointNamed('A'));
    mechanism.weldJoint();
    expect(jointNamed('A').isWelded).toBe(true);
    stillARam();
  });

  it('takes a mount weld off again, leaving the ram alone', () => {
    active.updateSelectedObj(jointNamed('D'));
    mechanism.weldJoint();
    expect(compoundHolding('D')).toBeDefined();

    expect(grid.weldRefusal(jointNamed('D')), 'unwelding a mount is allowed').toBeUndefined();
    mechanism.unWeldJoint(jointNamed('D'));

    expect(jointNamed('D').isWelded).toBe(false);
    expect(compoundHolding('D'), 'the body came apart').toBeUndefined();
    expect(mechanism.links.map((link) => link.id)).toContain('CD');
    expect(mechanism.links.map((link) => link.id)).toContain('DHK');
    stillARam();
  });

  it('takes a mount’s carriage off again', () => {
    active.updateSelectedObj(jointNamed('A'));
    mechanism.toggleSlider();
    expect(grid.isAttachedToSlider(jointNamed('A'))).toBe(true);

    active.updateSelectedObj(jointNamed('A'));
    expect(grid.sliderRefusal(jointNamed('A'), false)).toBeUndefined();
    mechanism.toggleSlider();

    expect(grid.isAttachedToSlider(jointNamed('A'))).toBe(false);
    stillARam();
  });
});

describe('and the inside of a cylinder is still sealed', () => {
  let mechanism: MechanismService;
  let grid: GridUtilsService;
  let multi: MultiEditService;
  let active: ActiveObjService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    mechanism = TestBed.inject(MechanismService);
    grid = TestBed.inject(GridUtilsService);
    multi = TestBed.inject(MultiEditService);
    active = TestBed.inject(ActiveObjService);
    TestBed.inject(UrlProcessorService).updateFromURL(
      fixturePayload(ramWithNeighbors()),
      false,
      true,
      true,
      false
    );
  });

  const ram = () => mechanism.sealedStructures()[0];
  /** The three joints a reader cannot reach, and must not be able to. */
  const interiors = () => {
    const sealed = ram();
    return [
      { name: 'the buried barrel end', joint: sealed.barrelNear as RealJoint },
      { name: 'the pin', joint: sealed.pin as RealJoint },
      { name: 'the slider', joint: sealed.slider as RealJoint },
    ];
  };

  it('refuses a weld at every one of them, and says which kind of joint it is', () => {
    for (const { name, joint } of interiors()) {
      const refusal = grid.weldRefusal(joint);
      expect(refusal, `a weld at ${name}`).toBeDefined();
      expect(refusal!.short, name).toBe(
        joint === ram().slider ? 'it is the slider' : 'part is sealed'
      );
    }
  });

  it('refuses a block at every one of them', () => {
    // Asked the way the menu asks it: for the state the joint is *not* in.
    // Requesting the state a joint is already in is a no-op, and a no-op is
    // allowed rather than refused, here as everywhere -- so a test that asked
    // for one would be asserting the wrong rule and passing on the pin, which
    // already has the ram's own block.
    for (const { name, joint } of interiors()) {
      const wanted = !grid.isAttachedToSlider(joint);
      expect(
        grid.sliderRefusal(joint, wanted),
        `${wanted ? 'adding' : 'removing'} at ${name}`
      ).toBeDefined();
    }
  });

  it('refuses them through the group edit too', () => {
    // The same rules from the other door. A selection is refused if any joint
    // in it is, and the sentence comes from the same model -- so a rule that
    // came off the one-joint path and stayed on the group's, or the other way
    // about, would show here.
    for (const { name, joint } of interiors()) {
      const refs = [{ kind: 'joint' as const, id: joint.id }];
      expect(multi.weldRefusal(refs, !joint.isWelded), `welding ${name} in a group`).toBeDefined();
      expect(
        multi.sliderRefusal(refs, !grid.isAttachedToSlider(joint)),
        `a block on ${name} in a group`
      ).toBeDefined();
    }
  });

  it('refuses a merge onto every one of them', () => {
    for (const { name, joint } of interiors()) {
      const elbow = mechanism.joints.find((one) => one.id === 'W') as RealJoint;
      expect(mechanism.mergeJoints(elbow, joint), `merging onto ${name}`).toBe('sealed-cylinder');
      expect(mechanism.mergeJoints(joint, elbow), `merging ${name} away`).toBeDefined();
    }
    // And nothing was taken apart on the way through.
    expect(mechanism.sealedStructures()).toHaveLength(1);
    expect(ram().pin.isWelded).toBe(true);
    expect(ram().slider.isSealed).toBe(true);
  });

  it('refuses to unweld the pin, which is what makes the part one thing', () => {
    const pin = ram().pin as RealJoint;
    expect(grid.weldRefusal(pin)?.short).toBe('part is sealed');

    mechanism.unWeldJoint(pin);

    expect(pin.isWelded, 'still welded').toBe(true);
    expect(mechanism.sealedStructures()).toHaveLength(1);
  });
});
