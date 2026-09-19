import '../model/joint';
import { Coord } from '../model/coord';
import { PrisJoint, RealJoint, RevJoint } from '../model/joint';
import { RealLink } from '../model/link';
import { createMechanismHarness, wireGraph } from '../../test-utils/mechanism-harness';
import { sealedCylinders } from '../model/cylinder';
import { MODEL_SCALE } from '../model/render-scale';

// Option A (docs/joint-types-plan.md §2.3) keeps a slot's carrier and its two
// defining joints outside `links` and `connectedJoints`. Nothing that rebuilds
// those structures can see them, so every way of destroying one is its own
// regression — §4.2.

/**
 * Crank AB drives a slider riding in a slot along the lever CD. The whole point
 * of this shape is that the slider depends on CD without appearing anywhere in
 * CD's joint list.
 *
 * B *is* the slider: it was a pin with a coincident `PrisJoint` and a
 * zero-length block joining them until Stage 1 of
 * `docs/joint-type-and-cylinder-plan.md`, and it keeps the pin's letter.
 */
function slottedLever() {
  const harness = createMechanismHarness();
  const a = new RevJoint('A', 0, 0, true, true);
  const b = new PrisJoint('B', 0, 1);
  const c = new RevJoint('C', 3, 0, false, true);
  const d = new RevJoint('D', 1, 2);
  const ab = new RealLink('AB', [a, b], 1, 1, new Coord(0, 0.5));
  const cd = new RealLink('CD', [c, d], 1, 1, new Coord(2, 1));

  b.slideOn(cd, c, d);

  harness.service.joints.push(a, b, c, d);
  harness.service.links.push(ab, cd);
  wireGraph(harness.service);
  return { ...harness, a, b, c, d, slot: b, ab, cd };
}

describe('a slot losing what defines it', () => {
  it('starts out floating on its carrier', () => {
    const s = slottedLever();
    s.service.updateMechanism();

    expect(s.slot.isFloating).toBe(true);
    expect(s.slot.carrier).toBe(s.cd);
    expect(s.slot.slotAngle).toBeCloseTo(Math.atan2(2, -2), 9);
  });

  it('dangles when the carrier is deleted, rather than grounding itself', () => {
    // Phase 2 re-grounded it here, to keep the slider the user drew. That kept
    // the object and quietly invented the one thing nobody had chosen: where it
    // points. Phase 4 keeps the slider, drops the direction, and draws it red --
    // the fix is to drag it onto a link (§4.1).
    const s = slottedLever();
    const wasPointing = s.slot.slotAngle;
    s.active.updateSelectedObj(s.cd);

    s.service.deleteLink();

    expect(s.slot.isFloating).toBe(false);
    expect(s.slot.carrier).toBeUndefined();
    expect(s.slot.ground).toBe(false);
    expect(s.slot.isDangling).toBe(true);
    // The direction is stashed rather than applied, so grounding it later lands
    // on the guide it had instead of rebuilding one at zero.
    expect(s.slot.slotAngle).toBeCloseTo(wasPointing, 9);
  });

  it('follows a defining joint that is merged away, rather than stranding the slot', () => {
    // This used to strand it. The reasoning was that merging a joint the slot
    // is measured from is a strange thing to do, so let the slot dangle and let
    // the user see it -- which was defensible while nothing depended on it.
    //
    // Something does now: dragging a cylinder's mount onto another joint is how
    // a ram is attached to the rest of a linkage, and the mount is one of the
    // two joints its barrel's slot is measured from. Stranding the slot there
    // deleted the cylinder, silently, in the gesture that exists to connect it.
    const s = slottedLever();
    const spare = new RevJoint('Z', 5, 5);
    const bar = new RealLink('AZ', [s.a, spare], 1, 1, new Coord(2.5, 2.5));
    s.service.joints.push(spare);
    s.service.links.push(bar);
    wireGraph(s.service);

    expect(s.service.mergeJoints(s.d, spare)).toBeUndefined();

    expect(s.slot.isFloating).toBe(true);
    expect(s.slot.isDangling).toBe(false);
    expect(s.slot.isSlotWellFormed).toBe(true);
    // The carrier kept both its ends; one of them is now the joint that survived.
    expect([s.slot.slotJointA!.id, s.slot.slotJointB!.id]).toContain('Z');
  });

  it('cannot be asked to collapse a slot onto a single point', () => {
    // The repair above only ever moves an endpoint to another joint; it cannot
    // put both ends on the same one, because merging one end of a carrier into
    // the other end of that same carrier is refused before any of this runs.
    const s = slottedLever();
    const spare = new RevJoint('Z', 5, 5);
    const bar = new RealLink('AZ', [s.a, spare], 1, 1, new Coord(2.5, 2.5));
    s.service.joints.push(spare);
    s.service.links.push(bar);
    wireGraph(s.service);

    expect(s.service.mergeJoints(s.d, spare)).toBeUndefined();
    const other = s.slot.slotJointA!.id === 'Z' ? s.slot.slotJointB! : s.slot.slotJointA!;

    expect(s.service.mergeJoints(other as RevJoint, spare)).toBeDefined();
    expect(s.slot.isSlotWellFormed, 'left exactly as it was').toBe(true);
  });

  it('refuses to merge a defining joint into the slider riding its own slot', () => {
    // The assembly would then slide on a link it is part of: the slot's
    // direction is measured from two joints, one of which has become the
    // slider. Found by dragging a slider 25 px, which snapped it onto the
    // nearer end of its own carrier and left it non-dangling and unflagged.
    //
    // Asked of the slider itself now. The merge used to happen to the pin
    // paired with it, which `isSlotWellFormed` never saw.
    const s = slottedLever();

    expect(s.service.mergeJoints(s.d, s.slot)).toBe('own-carrier');
    expect(s.slot.isFloating, 'the slot is left alone').toBe(true);
    expect(s.service.joints.map((joint) => joint.id)).toContain('D');
  });

  it('dangles when a defining joint is deleted outright', () => {
    // Deleting a joint is the one route to a stranded slot that goes through
    // neither mergeJoints nor deleteLink -- it used to end at updateMechanism,
    // which reconciles nothing.
    const s = slottedLever();
    s.active.updateSelectedObj(s.d);

    s.service.deleteJoint();

    expect(s.service.joints.map((joint) => joint.id)).not.toContain('D');
    expect(s.slot.isFloating).toBe(false);
    expect(s.slot.isDangling).toBe(true);
    expect(s.slot.carrier).toBeUndefined();
  });

  it('does not leave a slider pointing at a link that is gone', () => {
    // The failure this exists to prevent: the pointer stays valid, so nothing
    // throws -- the slider just reads geometry from an object no longer in the
    // mechanism, and solves against a link that is not there.
    const s = slottedLever();
    s.active.updateSelectedObj(s.cd);

    s.service.deleteLink();

    expect(s.service.links.map((link) => link.id)).not.toContain('CD');
    expect(s.slot.carrier).toBeUndefined();
  });
});

describe('a slot whose carrier is welded into a compound', () => {
  /** CD and DE welded at D: the carrier becomes a member of a compound. */
  function weldableCarrier() {
    const s = slottedLever();
    const e = new RevJoint('E', 0, 3);
    const de = new RealLink('DE', [s.d, e], 1, 1, new Coord(0.5, 2.5));
    s.service.joints.push(e);
    s.service.links.push(de);
    wireGraph(s.service);
    s.service.updateMechanism();
    return { ...s, e, de };
  }

  it('actually welds, so the tests below are about a compound', () => {
    // Guard on the fixture itself: an unwired joint declines every weld, and
    // the assertions further down would then hold because nothing happened.
    const s = weldableCarrier();
    s.active.updateSelectedObj(s.d);

    s.service.weldJoint();

    expect(s.d.isWelded).toBe(true);
    expect(s.service.links.map((link) => link.id)).not.toContain('CD');
  });

  it('remaps the carrier to the compound rather than regrounding', () => {
    const s = weldableCarrier();
    s.active.updateSelectedObj(s.d);

    s.service.weldJoint();

    // The slot survives: the compound is a real body and still holds both
    // defining joints, so there is nothing to give up.
    expect(s.slot.isFloating).toBe(true);
    expect(s.service.links).toContain(s.slot.carrier);
    expect(s.slot.carrier!.joints.map((joint) => joint.id)).toEqual(
      expect.arrayContaining(['C', 'D'])
    );
  });

  it('keeps the slot pointing the same way through the weld', () => {
    const s = weldableCarrier();
    const wasPointing = s.slot.slotAngle;
    s.active.updateSelectedObj(s.d);

    s.service.weldJoint();

    expect(s.slot.slotAngle).toBeCloseTo(wasPointing, 9);
  });
});

describe('grounding a floating slot', () => {
  it('converts it in place instead of dismantling the slider', () => {
    const s = slottedLever();
    s.service.updateMechanism();
    const wasPointing = s.slot.slotAngle;
    s.active.updateSelectedObj(s.slot);

    s.service.toggleGround();

    // The joint stays exactly the joint it was: there is no block to take
    // apart, and no coincident pin to leave behind.
    expect(s.service.joints.map((joint) => joint.id)).toContain('B');
    expect(s.service.joints.find((joint) => joint.id === 'B')).toBe(s.slot);
    expect(s.slot.ground).toBe(true);
    expect(s.slot.isFloating).toBe(false);
    expect(s.slot.slotAngle).toBeCloseTo(wasPointing, 9);
  });
});

describe('a slot dropped onto a sealed cylinder', () => {
  /** A ram, plus a bar somewhere else to try to cut a slot along. */
  function ramAndABar() {
    const harness = createMechanismHarness();
    harness.service.createCylinderFrom(new Coord(0, 0), new Coord(3 * MODEL_SCALE, 0));
    const sealed = sealedCylinders(harness.service.joints)[0];
    const near = new RevJoint('W', 0, 4 * MODEL_SCALE);
    const far = new RevJoint('X', 4 * MODEL_SCALE, 4 * MODEL_SCALE);
    const rail = new RealLink('WX', [near, far]);
    harness.service.joints.push(near, far);
    harness.service.links.push(rail);
    wireGraph(harness.service);
    return { ...harness, sealed, rail, near, far };
  }

  it('refuses the ram’s own inside, before it writes anything', () => {
    // `cutSlotOn` is the commit half of a slot drop, and it only asked whether
    // the joint it was handed was prismatic -- which the ram's own seal is, so
    // that test happened to cover this. It no longer can: a slider arriving
    // here is the ordinary case, a dangling one being repaired. The refusal
    // that matters is the sealed one, and half of the commit had run by the
    // time anything downstream could object.
    const h = ramAndABar();
    const seal = h.sealed.slider;
    const where = { x: seal.x, y: seal.y + 4 * MODEL_SCALE };

    const took = h.service.cutSlotOn(seal, {
      carrier: h.rail,
      a: h.near,
      b: h.far,
      x: where.x,
      y: where.y,
    });

    expect(took, 'refused').toBe(false);
    const still = sealedCylinders(h.service.joints);
    expect(still, 'the ram is still a ram').toHaveLength(1);
    expect(still[0].slider.carrier!.id, 'its bore is still its barrel').toBe(h.sealed.barrel.id);
    expect(seal.y, 'and nothing moved').not.toBe(where.y);
  });

  it('still lets a mount take one, which is how a carriage is dropped on a rail', () => {
    // The rule is about the inside, not about the part: giving a mount a slot
    // is an ordinary slot drop and must stay one.
    const h = ramAndABar();
    const mount = h.sealed.barrelFar as RealJoint;

    const took = h.service.cutSlotOn(mount, {
      carrier: h.rail,
      a: h.near,
      b: h.far,
      x: mount.x,
      y: h.near.y,
    });

    expect(took, 'allowed').toBe(true);
    // The mount kept its letter through the change of kind, and now slides.
    const now = h.service.joints.find((joint) => joint.id === mount.id);
    expect(now instanceof PrisJoint).toBe(true);
    const still = sealedCylinders(h.service.joints);
    expect(still, 'and the ram survives it').toHaveLength(1);
    expect(still[0].slider.isSealed).toBe(true);
  });
});

describe('turning Slider off and on again', () => {
  it('brings the slot back with the weight the reader typed on it', () => {
    // The stash is what makes Slider off/on a round trip rather than a rebuild:
    // it remembers the ground, the angle, the carrier and the two joints the
    // slot is measured from. Mass was not among them, because before Stage 1 of
    // `docs/joint-type-and-cylinder-plan.md` it lived on a block link that was
    // deleted outright -- and D6 of that plan made it something the reader
    // types into the panel, so coming back at zero is losing their number.
    const s = slottedLever();
    s.slot.mass = 3.5;
    s.service.updateMechanism(false);

    s.active.updateSelectedObj(s.slot);
    s.service.toggleSlider();
    const pin = s.service.joints.find((joint) => joint.id === 'B') as RealJoint;
    expect(pin instanceof PrisJoint, 'a plain pin now').toBe(false);

    s.active.updateSelectedObj(pin);
    s.service.toggleSlider();
    const again = s.service.joints.find((joint) => joint.id === 'B') as PrisJoint;

    expect(again instanceof PrisJoint).toBe(true);
    expect(again.carrier, 'the slot it had').toBe(s.cd);
    expect(again.mass, 'and the weight it had').toBeCloseTo(3.5, 9);
  });
});

/**
 * A slot is a legal *target* for a merge now that only the source is refused
 * (Stage 1 of `docs/joint-type-and-cylinder-plan.md`). `mergeJoints` was
 * written when it could not be one, and two of the things it does to a
 * survivor turn out to be things a slot cannot take: writing `ground` straight
 * onto it, and carrying a weld across as though a weld at a slot meant only one
 * thing. Both are reachable by dragging a pin onto a slider.
 */
describe('dropping a pin onto a slider', () => {
  /** The slotted lever, plus a loose bar X-Y whose X can be dragged anywhere. */
  function withALooseBar() {
    const s = slottedLever();
    const x = new RevJoint('X', 6, 6);
    const y = new RevJoint('Y', 7, 7);
    const xy = new RealLink('XY', [x, y], 1, 1, new Coord(6.5, 6.5));
    s.service.joints.push(x, y);
    s.service.links.push(xy);
    wireGraph(s.service);
    return { ...s, x, y, xy };
  }

  it('keeps the carrier rather than grounding a slot that has one', () => {
    // `ground` written straight leaves the slot both carried and grounded, and
    // then `slideAssemblyAt` reports it grounded: a rider's world orientation
    // frozen on a moving bar, ground rails drawn on a slot cut into a link, and
    // a reload that quietly undoes it because `resolveSlots` calls `slideOn`.
    const s = withALooseBar();
    s.x.ground = true;

    expect(s.service.mergeJoints(s.x, s.slot)).toBeUndefined();

    expect(s.slot.isFloating, 'still riding its carrier').toBe(true);
    expect(s.slot.carrier).toBe(s.cd);
    expect(s.slot.ground, 'and not also pinned to the world').toBe(false);
  });

  it('grounds a slot that has nothing to ride, through its own setter', () => {
    const s = withALooseBar();
    s.slot.detach();
    s.x.ground = true;

    expect(s.service.mergeJoints(s.x, s.slot)).toBeUndefined();

    expect(s.slot.ground).toBe(true);
    expect(s.slot.isFloating).toBe(false);
    expect(s.slot.isDangling, 'and no longer drawn red').toBe(false);
  });

  it('does not turn a Pin-in-slot slider into a Slide', () => {
    // `weldTopology`'s prismatic branch ends `rotates = false`, so carrying a
    // welded pin's compound across changed the joint's *type* -- from a gesture
    // that reads as "attach these two". The bodies still fuse; the slot keeps
    // what it was.
    const s = withALooseBar();
    const z = new RevJoint('Z', 8, 8);
    const yz = new RealLink('YZ', [s.y, z], 1, 1, new Coord(7.5, 7.5));
    s.service.joints.push(z);
    s.service.links.push(yz);
    wireGraph(s.service);
    s.service.weldJoint(s.y);
    expect(s.y.isWelded).toBe(true);
    expect(s.slot.rotates, 'a pin-in-slot to start with').toBe(true);

    expect(s.service.mergeJoints(s.y, s.slot)).toBeUndefined();

    expect(s.slot.rotates, 'still free to turn in its slot').toBe(true);
  });
});
