// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { TestBed } from '@angular/core/testing';
import { MechanismService } from '../../app/services/mechanism.service';
import { UrlProcessorService } from '../../app/services/url-processor.service';
import { GridUtilsService } from '../../app/services/grid-utils.service';
import { MultiEditService } from '../../app/services/multi-edit.service';
import { ActiveObjService } from '../../app/services/active-obj.service';
import { ContextMenuBuilderService } from '../../app/services/context-menu-builder.service';
import { fixturePayload } from '../../test-utils/verification/fixture-gallery';
import { cylinderBetween } from '../../test-utils/verification/slot-fixtures';
import { MechanismFixture } from '../../test-utils/verification/fixture';
import { RealJoint } from '../../app/model/joint';
import { RealLink } from '../../app/model/link';
import { MODEL_SCALE } from '../../app/model/render-scale';
import { refuseAttach, refuseJointOperation } from '../../app/model/joint-operation-permission';
import { MERGE_REFUSAL_REASONS, refuseJointMerge } from '../../app/model/drop-target';
import { jointTypeAt } from '../../app/model/joint-type';

/**
 * Where a cylinder's boundary is: what its end joints allow, and what its
 * inside refuses.
 *
 * The boundary has moved twice. It used to run around the whole part -- no
 * weld at an end joint, no merge that would carry one there -- and step 5 of
 * `docs/cylinder-mount-joints-plan.md` took that fence down: an end joint is
 * where a cylinder attaches to the drawing, and welding one into a bracket or
 * giving one a carriage is the ordinary thing to want. Then Stage 2 of
 * `docs/joint-type-and-cylinder-plan.md` split what was left in two
 * (decision S11). *Hidden* is N alone. *Inside a cylinder* is N and S: placed
 * by the layout, never welded, merged onto or cut a slot in. S is a joint a
 * reader can see, select and drive, and it is still inside.
 *
 * So this file pins the two halves against each other. The refusals below are
 * read off the model rather than spelled out here -- `refuseJointOperation`
 * and `refuseAttach` in `model/joint-operation-permission.ts`, the merge rules
 * in `model/drop-target.ts` -- so a rule that changed its wording at one door
 * shows up as a door disagreeing with the model instead of as an edit to this
 * file.
 *
 * The positive tests are written against what the drawing actually becomes,
 * not against a boolean: which body owns which leaf, where the joints a weld
 * carried ended up, and whether the cylinder is still a cylinder afterwards. A
 * rule that merely stops saying no is not the same as a feature that works.
 */

/**
 * A cylinder with a neighbor bar on each end joint, an elbow to merge, and
 * nothing else.
 *
 * Each end joint needs a real neighbor: a weld fuses the links that meet at a
 * joint, and an end joint with only the cylinder on it has nothing to fuse --
 * which is a refusal about arithmetic, not about cylinders, and would make a
 * "the ban is lifted" test pass for the wrong reason.
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
    sliders: [{ at: 'C', on: { carrier: 'AB', a: 'A', b: 'B' }, sealed: true }],
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
    expect(sealed.seal.isSealed, 'still sealed').toBe(true);
    // The seal and the pin the rod hangs on are one joint now, so what used to
    // be the pin's weld is the slider saying its rod cannot turn against the
    // slot.
    expect(sealed.seal.rotates, 'the rod is still rigid with the slot').toBe(false);
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

  it('offers Cylinder on a welded joint, because the mutation does', () => {
    // The menu kept a veto of its own long after `createCylinderFrom` stopped
    // enforcing one: it grayed the row and told the reader to unweld first, to
    // do something they could already do. A row grayed for a rule nothing
    // enforces is worse than a missing one, because it is a rule the reader
    // cannot discover has gone.
    active.updateSelectedObj(jointNamed('D'));
    mechanism.weldJoint();
    expect(jointNamed('D').isWelded).toBe(true);

    const menu = TestBed.inject(ContextMenuBuilderService).build(jointNamed('D'), {} as never);
    const row = menu.groups.flatMap((group) => group.rows).find((one) => one.label === 'Cylinder');
    expect(row, 'the Cylinder row is there').toBeDefined();
    expect(row!.disabled, 'and offered').toBe(false);
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
  const jointNamed = (id: string) => mechanism.joints.find((joint) => joint.id === id) as RealJoint;

  /**
   * The two joints a cylinder places for itself (decision S11).
   *
   * Whether the reader can *see* them is the other half of what "interior"
   * used to mean, and it is a different question: N is hidden and S is not.
   * This one is about what may be built on them, and the answer is the same
   * for both -- every door below is shut to each.
   */
  const inside = () => {
    const sealed = ram();
    return [
      // `weldWay` is the direction the one Weld control would actually go on
      // this joint: the slide records its weld in `rotates`, so the control
      // there is an unweld and the model is asked for that rule.
      {
        name: 'the buried barrel end',
        joint: sealed.inner as RealJoint,
        weldWay: 'weld' as const,
      },
      { name: 'the slide', joint: sealed.seal as RealJoint, weldWay: 'unweld' as const },
    ];
  };

  /** The two joints a cylinder attaches to the drawing by, which allow everything. */
  const ends = () => {
    const sealed = ram();
    return [
      { name: 'the barrel’s end joint', joint: sealed.mountA as RealJoint },
      { name: 'the rod’s end joint', joint: sealed.mountB as RealJoint },
    ];
  };

  /**
   * The phrase the model uses for "this joint is inside a cylinder", read off
   * the model rather than typed out here.
   *
   * One door answers, and every other door is compared against that answer. A
   * rule reworded at one door and not the rest then shows up as a door
   * disagreeing with the model, which is the failure worth catching; a rule
   * reworded everywhere at once is a deliberate edit and stays green.
   */
  const insideACylinder = () => refuseAttach(ram().seal, grid.operationContext())!.short;

  it('refuses a weld at N and at the slide, in the model’s own words', () => {
    for (const { name, joint, weldWay } of inside()) {
      // Both for the same reason. The slide used to be refused for being the
      // slider -- a weld had to land on its coincident pin -- and with that
      // pin gone it is refused for what it is: a joint inside a cylinder.
      expect(grid.weldRefusal(joint), `a weld at ${name}`).toEqual(
        refuseJointOperation(joint, weldWay, grid.operationContext())
      );
      expect(grid.weldRefusal(joint)?.short, name).toBe(insideACylinder());
    }
  });

  it('refuses a block at N and at the slide', () => {
    // Asked the way the menu asks it: for the state the joint is *not* in.
    // Requesting the state a joint is already in is a no-op, and a no-op is
    // allowed rather than refused, here as everywhere -- so a test that asked
    // for one would be asserting the wrong rule and passing at the slide,
    // which already slides.
    for (const { name, joint } of inside()) {
      const wanted = !grid.isAttachedToSlider(joint);
      const asked = wanted ? ('add-slider' as const) : ('remove-slider' as const);
      expect(grid.sliderRefusal(joint, wanted), `${asked} at ${name}`).toEqual(
        refuseJointOperation(joint, asked, grid.operationContext())
      );
      expect(grid.sliderRefusal(joint, wanted)?.short, name).toBe(insideACylinder());
    }
  });

  it('refuses them through the group edit too', () => {
    // The same rules from the other door. A selection is refused if any joint
    // in it is, and the sentence comes from the same model -- so a rule that
    // came off the one-joint path and stayed on the group's, or the other way
    // about, would show here.
    // Asked as the group's Joint Type choice asks it: a weld is the Welded
    // value, and a block is whichever value flips the one the joint has.
    for (const { name, joint } of inside()) {
      const refs = [{ kind: 'joint' as const, id: joint.id }];
      expect(multi.jointTypeRefusal(refs, 'welded')?.short, `welding ${name}`).toBe(
        insideACylinder()
      );
      expect(
        multi.jointTypeRefusal(refs, grid.isAttachedToSlider(joint) ? 'revolute' : 'pin-in-slot')
          ?.short,
        `a block on ${name}`
      ).toBe(insideACylinder());
    }
  });

  it('refuses a merge onto N and onto the slide, and the drag says so first', () => {
    const elbow = jointNamed('W');
    for (const { name, joint } of inside()) {
      // The commit and the ring quote one rule: the ring is what the reader
      // sees while the drag is in flight, and it went green over the square
      // until the rule was asked before the release as well.
      const refusal = refuseJointMerge(elbow, joint, mechanism.sealedStructures());
      expect(refusal, `the ring over ${name}`).toBe('sealed-cylinder');
      expect(MERGE_REFUSAL_REASONS[refusal!], name).toBe(insideACylinder());
      expect(mechanism.mergeJoints(elbow, joint), `merging onto ${name}`).toBe(refusal);
      expect(mechanism.mergeJoints(joint, elbow), `merging ${name} away`).toBeDefined();
    }
    // And nothing was taken apart on the way through.
    expect(mechanism.sealedStructures()).toHaveLength(1);
    expect(ram().seal.rotates).toBe(false);
    expect(ram().seal.isSealed).toBe(true);
  });

  it('refuses to cut a slot through N or the slide', () => {
    // The other drop gesture: a joint dragged onto a bar cuts a slot there.
    // Pointed at a cylinder's inside it would hand the part's own sliding
    // joint to a bar somewhere else in the drawing, so the commit says no --
    // and nothing is written on the way to saying it.
    const bar = mechanism.links.find((link) => link.id === 'WX')!;
    const [w, x] = ['W', 'X'].map(jointNamed);
    for (const { name, joint } of inside()) {
      const was = { x: joint.x, y: joint.y };
      expect(
        mechanism.cutSlotOn(joint, { carrier: bar, a: w, b: x, x: w.x, y: w.y }),
        `a slot at ${name}`
      ).toBe(false);
      expect([joint.x, joint.y], `${name} did not move`).toEqual([was.x, was.y]);
    }
    expect(mechanism.sealedStructures()).toHaveLength(1);
  });

  it('refuses to unweld the slide, which is what makes the part one thing', () => {
    const seal = ram().seal;
    expect(grid.weldRefusal(seal)).toEqual(
      refuseJointOperation(seal, 'unweld', grid.operationContext())
    );

    mechanism.unWeldJoint(seal);

    expect(seal.rotates, 'the rod is still rigid with the slot').toBe(false);
    expect(mechanism.sealedStructures()).toHaveLength(1);
  });

  it('refuses nothing on an end joint that it refuses inside', () => {
    // The boundary, stated from the other side and in one place: every door
    // shut above is open at both end joints. `refuseAttach` is asked as well,
    // because that is the rule the Link, Cylinder and Force rows quote and it
    // is the one that distinguishes the two questions most sharply.
    for (const { name, joint } of ends()) {
      expect(refuseAttach(joint, grid.operationContext()), `attaching at ${name}`).toBeUndefined();
      expect(grid.weldRefusal(joint), `welding ${name}`).toBeUndefined();
      expect(grid.sliderRefusal(joint, true), `a block at ${name}`).toBeUndefined();
      expect(grid.groundRefusal(joint), `grounding ${name}`).toBeUndefined();
      expect(
        refuseJointMerge(jointNamed('W'), joint, mechanism.sealedStructures())
      ).toBeUndefined();
    }
  });

  it('lets the slide be selected and driven, though it is sealed', () => {
    // Sealed is about what may be *built* on a joint, not about whether a
    // reader can reach it. The square is joint S (decision D9): its type is
    // Prismatic and the drive is its own, through the ordinary input door.
    const seal = ram().seal;
    expect(jointTypeAt(seal, grid.operationContext())).toBe('prismatic');
    expect(refuseAttach(seal, grid.operationContext()), 'but nothing attaches there').toBeDefined();

    active.updateSelectedObj(seal);
    mechanism.adjustInput();
    expect(ram().seal.input).toBe(true);
  });
});
