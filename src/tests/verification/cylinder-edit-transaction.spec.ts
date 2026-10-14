// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { TestBed } from '@angular/core/testing';
import { MechanismService } from '../../app/services/mechanism.service';
import { UrlProcessorService } from '../../app/services/url-processor.service';
import { GridUtilsService } from '../../app/services/grid-utils.service';
import { fixturePayload } from '../../test-utils/verification/fixture-gallery';
import { cylinderBetween } from '../../test-utils/verification/slot-fixtures';
import { MechanismFixture } from '../../test-utils/verification/fixture';
import { PrisJoint, RealJoint, RevJoint } from '../../app/model/joint';
import { RealLink } from '../../app/model/link';
import { Coord } from '../../app/model/coord';
import { cylindersIn } from '../../app/model/cylinder';
import { NotificationService } from '../../app/services/notification.service';
import { SaveHistoryService } from '../../app/services/save-history.service';

/**
 * What the drawing actually looks like after an edit that touches a ram.
 *
 * The placement arithmetic has its own tests, and they cannot see this: a plan
 * can be right and the commit still leave a force at the wrong point of a
 * body, or write half a gesture before discovering the other half is refused.
 * These drive the service, and read the drawing afterwards.
 */

const MOUNT = { x: 0, y: 0 };
const EYE = { x: 10, y: 0 };

/** A plain ram from (0,0) to (10,0), mounted on nothing. */
function ramFixture(): MechanismFixture {
  const { barrelEnd, pin } = cylinderBetween(MOUNT, EYE, 0.5);
  return {
    joints: [
      { id: 'A', ...MOUNT },
      { id: 'B', ...barrelEnd },
      { id: 'C', ...pin },
      { id: 'D', ...EYE },
    ],
    links: [{ joints: 'AB' }, { joints: 'CD' }],
    sliders: [{ at: 'C', on: { carrier: 'AB', a: 'A', b: 'B' }, sealed: true }],
    welds: ['C'],
    inputAngVel: 1,
  };
}

/** The same ram with an arm pinned to its barrel mount, for a drag to start on. */
function ramAndArmFixture(): MechanismFixture {
  const base = ramFixture();
  return {
    ...base,
    joints: [...base.joints, { id: 'N', x: -4, y: 0 }],
    links: [...base.links, { joints: 'AN' }],
  };
}

function build(fixture: MechanismFixture) {
  TestBed.configureTestingModule({});
  const mechanism = TestBed.inject(MechanismService);
  const grid = TestBed.inject(GridUtilsService);
  TestBed.inject(UrlProcessorService).updateFromURL(fixturePayload(fixture), false, true);
  const at = (id: string) => mechanism.joints.find((joint) => joint.id === id)!;
  return { mechanism, grid, at };
}

/**
 * Weld a two-joint bracket onto a live mount, the way the app's own weld
 * does: the member bar and the bracket become one compound that replaces both
 * in the link list, and the rebuild re-points every joint and carrier at it.
 *
 * Done directly because the public weld still refuses a mount at this stage.
 */
function weldBracketOnto(
  mechanism: MechanismService,
  mountId: string,
  memberId: string,
  farAt: { x: number; y: number }
) {
  const mount = mechanism.joints.find((joint) => joint.id === mountId) as RealJoint;
  const member = mechanism.links.find((link) => link.id === memberId) as RealLink;
  const far = new RevJoint('W', farAt.x, farAt.y);
  const bracket = new RealLink('AW', [mount, far]);
  const compound = new RealLink(
    `${member.id}bracket`,
    [...member.joints, far],
    undefined,
    undefined,
    undefined,
    [member, bracket]
  );
  mount.isWelded = true;
  mechanism.joints.push(far);
  mechanism.links = mechanism.links.filter((link) => link.id !== member.id);
  mechanism.links.push(compound);

  // The rebuild the service does after a real weld, done here by hand: every
  // joint points at the top-level link it is on, and a floating slot follows
  // its carrier up to that level.
  mechanism.joints.forEach((joint) => {
    if (joint instanceof RealJoint) joint.links = [];
  });
  mechanism.links.forEach((link) =>
    link.joints.forEach((joint) => {
      if (joint instanceof RealJoint && !joint.links.includes(link)) joint.links.push(link);
    })
  );
  mechanism.joints.forEach((joint) => {
    if (!(joint instanceof PrisJoint) || !joint.isFloating) return;
    if (joint.carrier?.id === member.id) {
      joint.slideOn(compound, joint.slotJointA!, joint.slotJointB!);
    }
  });

  mechanism.updateMechanism(false);
  return { far, bracket, compound };
}

/**
 * Put a Lock on one joint.
 *
 * The rebuild matters: the frozen set is cached against the cylinder revision,
 * so a flag written straight onto a joint is invisible until something bumps
 * it. In the app the lock toggle rebuilds; here it has to be said out loud.
 */
function lock(mechanism: MechanismService, id: string): void {
  const joint = mechanism.joints.find((one) => one.id === id) as RevJoint;
  joint.locked = true;
  mechanism.updateMechanism(false);
}

describe('a lock on a cylinder mount', () => {
  /** Turn `point` about `pivot`, which is what the gesture asks for. */
  const turned = (
    point: { x: number; y: number },
    pivot: { x: number; y: number },
    theta: number
  ) => ({
    x: pivot.x + (point.x - pivot.x) * Math.cos(theta) - (point.y - pivot.y) * Math.sin(theta),
    y: pivot.y + (point.x - pivot.x) * Math.sin(theta) + (point.y - pivot.y) * Math.cos(theta),
  });

  it('still allows the ram to turn about that mount', () => {
    // The mount is the pivot, so it does not move. Refusing on the strength of
    // its being named in the pose froze the ram solid: every pose names both
    // mounts, and turning about a locked one is the motion a lock there is
    // meant to leave available.
    const { mechanism, grid, at } = build(ramFixture());
    lock(mechanism, 'A');
    const [sealed] = cylindersIn(mechanism.joints);
    const pivot = { x: at('A').x, y: at('A').y };
    const wanted = turned({ x: at('D').x, y: at('D').y }, pivot, Math.PI / 2);

    grid.rotateCylinder(sealed, new Coord(pivot.x, pivot.y), Math.PI / 2);

    expect(at('A').x).toBeCloseTo(pivot.x, 3);
    expect(at('A').y).toBeCloseTo(pivot.y, 3);
    expect(at('D').x).toBeCloseTo(wanted.x, 2);
    expect(at('D').y).toBeCloseTo(wanted.y, 2);
  });

  it('and about the other mount, which is the same rule from the far end', () => {
    const { mechanism, grid, at } = build(ramFixture());
    lock(mechanism, 'D');
    const [sealed] = cylindersIn(mechanism.joints);
    const pivot = { x: at('D').x, y: at('D').y };
    const wanted = turned({ x: at('A').x, y: at('A').y }, pivot, Math.PI / 2);

    grid.rotateCylinder(sealed, new Coord(pivot.x, pivot.y), Math.PI / 2);

    expect(at('D').x).toBeCloseTo(pivot.x, 3);
    expect(at('D').y).toBeCloseTo(pivot.y, 3);
    expect(at('A').x).toBeCloseTo(wanted.x, 2);
    expect(at('A').y).toBeCloseTo(wanted.y, 2);
  });
});

describe('an edit refused partway through', () => {
  it('leaves the bar that started it exactly where it was', () => {
    // The drag used to be written first and the cylinder's refusal discovered
    // afterwards, so the arm stayed moved with no way back to where it began.
    //
    // The lock is on the cylinder's own end joint `A`, which the arm is pinned
    // to. It was on `W`, out on the bracket welded to the barrel, until S21
    // stopped a re-pose carrying that bracket — with nothing left to displace,
    // that lock has nothing to refuse and the drag goes through (the test below
    // is where it does).
    const { mechanism, grid, at } = build(ramAndArmFixture());
    weldBracketOnto(mechanism, 'A', 'AB', { x: -3, y: 4 });
    lock(mechanism, 'A');

    const armBefore = { x: at('N').x, y: at('N').y };
    const rodBefore = { x: at('D').x, y: at('D').y };

    const arm = mechanism.links.find((link) => link.id === 'AN')!;
    grid.dragLink(arm, 0, 2);

    expect(at('N').x).toBeCloseTo(armBefore.x, 6);
    expect(at('N').y).toBeCloseTo(armBefore.y, 6);
    expect(at('D').x).toBeCloseTo(rodBefore.x, 6);
    expect(at('D').y).toBeCloseTo(rodBefore.y, 6);
  });

  it('is not refused by a Lock the edit no longer reaches', () => {
    // The other half of S21, from the reader's side: a mark out on a bracket
    // welded to a barrel's end joint used to freeze every bar pinned to that
    // cylinder. Now the bracket is not carried, so the mark holds only the
    // joint it is on and the neighbor drags.
    const { mechanism, grid, at } = build(ramAndArmFixture());
    weldBracketOnto(mechanism, 'A', 'AB', { x: -3, y: 4 });
    lock(mechanism, 'W');

    const witness = { x: at('W').x, y: at('W').y };
    const armBefore = { x: at('N').x, y: at('N').y };

    const arm = mechanism.links.find((link) => link.id === 'AN')!;
    grid.dragLink(arm, 0, 2);

    expect(at('N').y).toBeCloseTo(armBefore.y + 2, 4);
    // And the locked joint is exactly where the Lock says it is.
    expect(at('W').x).toBeCloseTo(witness.x, 6);
    expect(at('W').y).toBeCloseTo(witness.y, 6);
  });
});

describe('resizing a ram welded to a bracket', () => {
  it('leaves the bracket’s own force and center of mass where they were', () => {
    // The bracket is rigid and does not move at all here, so nothing fixed to
    // it may move either. Reading one change of frame off the compound's first
    // two joints put the ram's stretch onto the bracket, dragging a force
    // anchor and a custom center of mass along a bar they are not on.
    const { mechanism, grid, at } = build(ramFixture());
    const { compound, bracket } = weldBracketOnto(mechanism, 'A', 'AB', { x: -3, y: 4 });

    const [sealed] = cylindersIn(mechanism.joints);
    expect(sealed.barrelRoot.id).toBe(compound.id);

    const leaf = compound.subset.find((sub) => sub.id === bracket.id) as RealLink;
    leaf.comIsCustom = true;
    // Midway along the bracket, in whatever units the payload decoded at.
    leaf.CoM = new Coord((at('A').x + at('W').x) / 2, (at('A').y + at('W').y) / 2);
    const comBefore = { x: leaf.CoM.x, y: leaf.CoM.y };
    const witnessBefore = { x: at('W').x, y: at('W').y };
    const spanBefore = Math.hypot(at('D').x - at('A').x, at('D').y - at('A').y);

    // Double the rod, which is the panel edit that moves the joint at the far
    // end of the ram. The bracket welded to the barrel mount does not move.
    const rodBefore = Math.hypot(at('D').x - at('C').x, at('D').y - at('C').y);
    expect(grid.setRodLength(sealed, rodBefore * 2)).toBe(true);
    const spanAfter = Math.hypot(at('D').x - at('A').x, at('D').y - at('A').y);
    expect(spanAfter).toBeGreaterThan(spanBefore * 1.2);

    expect(at('W').x).toBeCloseTo(witnessBefore.x, 4);
    expect(at('W').y).toBeCloseTo(witnessBefore.y, 4);
    expect(leaf.CoM.x).toBeCloseTo(comBefore.x, 4);
    expect(leaf.CoM.y).toBeCloseTo(comBefore.y, 4);
  });

  it('leaves them alone when it is the barrel, whose own joint is in that body', () => {
    // The other member, and the one that is harder. A body welded to the barrel
    // holds N, so giving the barrel a length moves one of the body's own joints
    // -- and the body's id sorts as `A, A1, W`, so reading its frame off its
    // first two joints reads it off the *barrel*, and carries a point out on the
    // bracket along the barrel's stretch. The frame is the first two joints no
    // cylinder derives for itself (`frameJointsOf`), which here is A and W.
    const { mechanism, grid, at } = build(ramFixture());
    const { compound, bracket } = weldBracketOnto(mechanism, 'A', 'AB', { x: -3, y: 4 });
    const [sealed] = cylindersIn(mechanism.joints);

    const leaf = compound.subset.find((sub) => sub.id === bracket.id) as RealLink;
    leaf.comIsCustom = true;
    leaf.CoM = new Coord((at('A').x + at('W').x) / 2, (at('A').y + at('W').y) / 2);
    const comBefore = { x: leaf.CoM.x, y: leaf.CoM.y };
    const anchorBefore = { x: at('A').x, y: at('A').y };
    const witnessBefore = { x: at('W').x, y: at('W').y };
    const barrelBefore = Math.hypot(at('B').x - at('A').x, at('B').y - at('A').y);

    expect(grid.setBarrelLength(sealed, barrelBefore * 1.4)).toBe(true);

    // The barrel really did change, and the bracket's own two joints did not.
    expect(Math.hypot(at('B').x - at('A').x, at('B').y - at('A').y)).toBeCloseTo(
      barrelBefore * 1.4,
      3
    );
    expect(at('A').x).toBeCloseTo(anchorBefore.x, 4);
    expect(at('W').x).toBeCloseTo(witnessBefore.x, 4);
    expect(at('W').y).toBeCloseTo(witnessBefore.y, 4);
    expect(leaf.CoM.x).toBeCloseTo(comBefore.x, 4);
    expect(leaf.CoM.y).toBeCloseTo(comBefore.y, 4);
  });

  it('carries the barrel’s own center of mass exactly once', () => {
    // The member moves rigidly even when the body around it is changing shape
    // (S21), so a point fixed to the barrel goes through that one motion. It is
    // in `plan.carried`, and the reframe of the body it is a leaf of has to
    // leave it alone -- doing both moves the point twice.
    const { mechanism, grid, at } = build(ramFixture());
    const { compound } = weldBracketOnto(mechanism, 'A', 'AB', { x: -3, y: 4 });
    const [sealed] = cylindersIn(mechanism.joints);

    const barrel = compound.subset.find((sub) => sub.id === 'AB') as RealLink;
    barrel.comIsCustom = true;
    // Off the axis, so a turn about A is visible in both coordinates.
    const anchor = { x: at('A').x, y: at('A').y };
    const offset = { x: (at('B').x - anchor.x) / 2, y: Math.abs(at('B').x - anchor.x) / 4 };
    barrel.CoM = new Coord(anchor.x + offset.x, anchor.y + offset.y);

    const bearing = Math.atan2(at('D').y - anchor.y, at('D').x - anchor.x);
    const turn = 0.3;
    expect(grid.setCylinderAngle(sealed, bearing + turn)).toBe(true);

    // Whatever the ladder turned the part about, the barrel is rigid: its
    // center is the same point *of the barrel* it was, which is the distance
    // from A and the angle off the barrel's own axis.
    const nowA = { x: at('A').x, y: at('A').y };
    const axis = Math.atan2(at('B').y - nowA.y, at('B').x - nowA.x);
    const arm = Math.hypot(barrel.CoM.x - nowA.x, barrel.CoM.y - nowA.y);
    const off = Math.atan2(barrel.CoM.y - nowA.y, barrel.CoM.x - nowA.x) - axis;
    expect(arm).toBeCloseTo(Math.hypot(offset.x, offset.y), 3);
    expect(Math.atan2(Math.sin(off), Math.cos(off))).toBeCloseTo(Math.atan2(offset.y, offset.x), 3);
  });
});

describe('an ordinary compound with no cylinder in it', () => {
  /** A four-bar with one compound coupler and a bar pinned to its corner. */
  function compoundNeighborFixture(): MechanismFixture {
    return {
      joints: [
        { id: 'A', x: 0, y: 0, ground: true },
        { id: 'B', x: 0, y: 3 },
        { id: 'C', x: 4, y: 3 },
        { id: 'D', x: 5, y: 0 },
      ],
      links: [{ joints: 'AB' }, { joints: 'BCD', subset: [{ joints: 'BC' }, { joints: 'CD' }] }],
      inputAngVel: 1,
    };
  }

  it('is reframed exactly as it always was', () => {
    // The frame skips a joint a cylinder derives, and there is no cylinder here
    // — so it is the body's first two joints, as it has always been, and every
    // number a load and a hand-placed center land on is the one they landed on
    // before S21. Computed here rather than recorded, so it says the rule.
    const { mechanism, grid, at } = build(compoundNeighborFixture());
    const body = mechanism.links.find((link) => link.id === 'BCD') as RealLink;
    const leaf = body.subset.find((sub) => sub.id === 'CD') as RealLink;
    const from = body.joints.slice(0, 2).map((joint) => ({ x: joint.x, y: joint.y }));
    leaf.comIsCustom = true;
    leaf.CoM = new Coord((at('C').x + at('D').x) / 2, (at('C').y + at('D').y) / 2);
    const was = { x: leaf.CoM.x, y: leaf.CoM.y };

    // Through a link drag, which is the path that reframes a deformed
    // neighbor. A plain joint drag leaves a hand-placed center alone by its own
    // older rule, and would say nothing about this one.
    grid.dragLink(
      mechanism.links.find((link) => link.id === 'AB')!,
      0.4,
      0.6
    );

    // The body's own first two joints, before and after: the point keeps its
    // place in that frame, along the axis and across it.
    const to = body.joints.slice(0, 2).map((joint) => ({ x: joint.x, y: joint.y }));
    const spanX = from[1].x - from[0].x;
    const spanY = from[1].y - from[0].y;
    const square = spanX * spanX + spanY * spanY;
    const along = ((was.x - from[0].x) * spanX + (was.y - from[0].y) * spanY) / square;
    const across = ((was.y - from[0].y) * spanX - (was.x - from[0].x) * spanY) / square;
    const toX = to[1].x - to[0].x;
    const toY = to[1].y - to[0].y;
    expect(leaf.CoM.x).toBeCloseTo(to[0].x + along * toX - across * toY, 6);
    expect(leaf.CoM.y).toBeCloseTo(to[0].y + along * toY + across * toX, 6);
  });
});

describe('the repair pass that runs on every rebuild', () => {
  it('does not walk past a lock to straighten a bent ram', () => {
    // Normalization holds the mounts and re-derives the interior, which is
    // right -- and it used to do that one ram at a time from its own fresh
    // snapshot, with no idea a lock was out. Straightening a bent barrel then
    // turned the bracket welded to it, moving a locked point.
    const { mechanism, at } = build(ramFixture());
    weldBracketOnto(mechanism, 'A', 'AB', { x: -3, y: 4 });
    lock(mechanism, 'W');

    // Bend the ram: put the pin somewhere off the axis and rebuild.
    const pin = at('C');
    pin.x = 5;
    pin.y = 1.5;
    const witnessBefore = { x: at('W').x, y: at('W').y };

    mechanism.updateMechanism(false);

    expect(at('W').x).toBeCloseTo(witnessBefore.x, 6);
    expect(at('W').y).toBeCloseTo(witnessBefore.y, 6);
  });
});

describe('dragging a bracket that is welded to a ram', () => {
  it('either does what was asked, or does nothing at all', () => {
    // The geometry and the properties have to come from one transform. The
    // planner used to treat the drag's own joints as opening guesses that a
    // cylinder consequence could overwrite, while the service went on
    // transporting the bracket's force and center of mass by the drag's
    // original translation -- so the body ended up turned and its properties
    // translated, a little further apart with every gesture.
    const { mechanism, grid, at } = build(ramFixture());
    const { compound, bracket } = weldBracketOnto(mechanism, 'A', 'AB', { x: -3, y: 4 });
    const leaf = compound.subset.find((sub) => sub.id === bracket.id) as RealLink;

    const midpoint = () => ({
      x: (at('A').x + at('W').x) / 2,
      y: (at('A').y + at('W').y) / 2,
    });
    leaf.comIsCustom = true;
    leaf.CoM = new Coord(midpoint().x, midpoint().y);

    const before = {
      a: { x: at('A').x, y: at('A').y },
      w: { x: at('W').x, y: at('W').y },
      com: { x: leaf.CoM.x, y: leaf.CoM.y },
    };
    const lift = Math.hypot(at('D').x - at('A').x, at('D').y - at('A').y) * 0.1;

    grid.dragLink(compound, 0, lift);

    const moved = Math.hypot(at('A').x - before.a.x, at('A').y - before.a.y) > 1e-6;
    if (!moved) {
      // Refused: nothing moved, and nothing was carried anywhere either.
      expect(at('W').x).toBeCloseTo(before.w.x, 6);
      expect(at('W').y).toBeCloseTo(before.w.y, 6);
      expect(leaf.CoM.x).toBeCloseTo(before.com.x, 6);
      expect(leaf.CoM.y).toBeCloseTo(before.com.y, 6);
      return;
    }
    // Went through: the bracket is where the drag asked for it, and the point
    // fixed to it is still the point of the bracket it was fixed to.
    expect(at('A').y).toBeCloseTo(before.a.y + lift, 4);
    expect(at('W').x).toBeCloseTo(before.w.x, 4);
    expect(at('W').y).toBeCloseTo(before.w.y + lift, 4);
    expect(leaf.CoM.x).toBeCloseTo(midpoint().x, 4);
    expect(leaf.CoM.y).toBeCloseTo(midpoint().y, 4);
  });
});

/**
 * A cylinder carried by something else is re-laid from *both* of its mounts,
 * and both of them belong to whatever moved them. So when the fit cannot reach
 * the span it was handed -- a member is holding its length, or the part is
 * already as short as one goes -- there is no end left to give, and the whole
 * gesture is refused. The pose used to go out with the requested mount written
 * back over the fitted one, which lengthened a rod that was holding its length
 * and left the drawing contradicting its own fields.
 */
describe('a cylinder carried past what it can reach', () => {
  /** The ram, plus an ordinary bar pinned to the joint at its rod end. */
  function ramAndNeighborFixture(): MechanismFixture {
    const base = ramFixture();
    return {
      ...base,
      joints: [...base.joints, { id: 'E', x: 14, y: 0 }],
      links: [...base.links, { joints: 'DE' }],
    };
  }

  function fixLengths(mechanism: MechanismService, sealed: ReturnType<typeof cylindersIn>[0]) {
    (sealed.barrel as RealLink).hold = 'length';
    sealed.rod.hold = 'length';
    mechanism.updateMechanism(false);
  }

  function refusals() {
    return vi.spyOn(NotificationService.prototype, 'refusal').mockImplementation(() => {});
  }

  it('refuses the drag rather than lengthening a rod that is holding its length', () => {
    const { mechanism, grid, at } = build(ramAndNeighborFixture());
    const [sealed] = cylindersIn(mechanism.joints);
    fixLengths(mechanism, sealed);
    const notify = refusals();
    const saved = vi.spyOn(SaveHistoryService.prototype, 'save').mockImplementation(() => {});

    const rodBefore = Math.hypot(at('D').x - at('C').x, at('D').y - at('C').y);
    const before = { d: at('D').x, e: at('E').x, c: at('C').x };
    const bar = mechanism.links.find((link) => link.id === 'DE')!;

    grid.dragLink(bar, 4000, 0);

    expect(Math.hypot(at('D').x - at('C').x, at('D').y - at('C').y)).toBeCloseTo(rodBefore, 6);
    expect(sealed.rod.hold).toBe('length');
    // Nothing moved: not the bar that started it, and not the part it reaches.
    expect(at('D').x).toBeCloseTo(before.d, 6);
    expect(at('E').x).toBeCloseTo(before.e, 6);
    expect(at('C').x).toBeCloseTo(before.c, 6);
    expect(saved).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalled();
    const [code, text] = notify.mock.calls[0];
    expect(code).toBe('cylinder.carried-too-far');
    // The refusal names which fixed value is in the way, by the member's own
    // two joints, because that is what the reader has a padlock on.
    expect(text).toContain('Held by fixed length');
    expect(text).toContain(sealed.rod.id);
    // And what to do about it, which is the half the sentence used to leave out.
    expect(text).toContain('Release what is holding it');
  });

  it('refuses just the same when the part is pushed under its shortest span', () => {
    // Nothing held at all: the floor is the wall. The overwrite used to be
    // "repaired" afterwards by a normalizer that no longer exists, so this is
    // the same class of bug arriving through the other end of the travel.
    const { mechanism, grid, at } = build(ramAndNeighborFixture());
    const notify = refusals();
    const before = { d: at('D').x, c: at('C').x, b: at('B').x };
    const bar = mechanism.links.find((link) => link.id === 'DE')!;

    grid.dragLink(bar, -(before.d - 10), 0);

    expect(at('D').x).toBeCloseTo(before.d, 6);
    expect(at('C').x).toBeCloseTo(before.c, 6);
    expect(at('B').x).toBeCloseTo(before.b, 6);
    expect(notify).toHaveBeenCalled();
    expect(notify.mock.calls[0][0]).toBe('cylinder.carried-too-far');
    // Nothing is holding a length here, so the sentence says the other thing
    // that can be true -- the part is shut and being pushed shut further --
    // rather than the one about a hold the reader has not pressed.
    //
    // The *last* call: `vi.spyOn` over a method that is already spied hands
    // back the mock that is there, calls and all, so `calls[0]` here is the
    // first refusal of the whole describe block rather than this test's.
    const [, text] = notify.mock.calls.at(-1)!;
    expect(text).toContain('already closed as far as it goes');
    expect(text).not.toContain('Held by');
  });

  it('refuses through a shared mount, where the far part is the one that cannot give', () => {
    // Two rams end to end: the first's rod mount is the second's barrel mount,
    // so dragging the first's free end moves a joint the second was never
    // asked about. The second is the one holding both of its lengths.
    const first = cylinderBetween({ x: 0, y: 0 }, { x: 10, y: 0 }, 0.5);
    const second = cylinderBetween({ x: 10, y: 0 }, { x: 20, y: 0 }, 0.5);
    const { mechanism, grid, at } = build({
      joints: [
        { id: 'A', x: 0, y: 0 },
        { id: 'B', ...first.barrelEnd },
        { id: 'C', ...first.pin },
        { id: 'D', x: 10, y: 0 },
        { id: 'E', ...second.barrelEnd },
        { id: 'F', ...second.pin },
        { id: 'G', x: 20, y: 0 },
      ],
      links: [{ joints: 'AB' }, { joints: 'CD' }, { joints: 'DE' }, { joints: 'FG' }],
      sliders: [
        { at: 'C', on: { carrier: 'AB', a: 'A', b: 'B' }, sealed: true },
        { at: 'F', on: { carrier: 'DE', a: 'D', b: 'E' }, sealed: true },
      ],
      welds: ['C', 'F'],
      inputAngVel: 1,
    });
    const far = cylindersIn(mechanism.joints).find((one) => one.seal.id === 'F')!;
    fixLengths(mechanism, far);
    const notify = refusals();

    const rodBefore = Math.hypot(at('G').x - at('F').x, at('G').y - at('F').y);
    const barrelBefore = Math.hypot(at('E').x - at('D').x, at('E').y - at('D').y);
    const near = cylindersIn(mechanism.joints).find((one) => one.seal.id === 'C')!;

    grid.dragCylinderMount(near, at('D') as RealJoint, new Coord(-4000, 0));

    expect(Math.hypot(at('G').x - at('F').x, at('G').y - at('F').y)).toBeCloseTo(rodBefore, 6);
    expect(Math.hypot(at('E').x - at('D').x, at('E').y - at('D').y)).toBeCloseTo(barrelBefore, 6);
    expect(at('D').x).toBeCloseTo(2000, 6);
    expect(notify).toHaveBeenCalled();
    expect(notify.mock.calls[0][0]).toBe('cylinder.carried-too-far');
  });
});
