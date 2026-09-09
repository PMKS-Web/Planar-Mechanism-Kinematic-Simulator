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
import { cylinderSizeOf, sealedCylinderStructures } from '../../app/model/cylinder';

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
    sliders: [{ at: 'C', prisId: 'P', on: { carrier: 'AB', a: 'A', b: 'B' }, sealed: true }],
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
    const [sealed] = sealedCylinderStructures(mechanism.joints);
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
    const [sealed] = sealedCylinderStructures(mechanism.joints);
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
    // The drag used to be written first and the ram's refusal discovered
    // afterwards, so the arm stayed moved with no way back to where it began.
    const { mechanism, grid, at } = build(ramAndArmFixture());
    weldBracketOnto(mechanism, 'A', 'AB', { x: -3, y: 4 });
    lock(mechanism, 'W');

    const armBefore = { x: at('N').x, y: at('N').y };
    const rodBefore = { x: at('D').x, y: at('D').y };

    const arm = mechanism.links.find((link) => link.id === 'AN')!;
    grid.dragLink(arm, 0, 2);

    expect(at('N').x).toBeCloseTo(armBefore.x, 6);
    expect(at('N').y).toBeCloseTo(armBefore.y, 6);
    expect(at('D').x).toBeCloseTo(rodBefore.x, 6);
    expect(at('D').y).toBeCloseTo(rodBefore.y, 6);
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

    const [sealed] = sealedCylinderStructures(mechanism.joints);
    expect(sealed.barrelRoot.id).toBe(compound.id);

    const leaf = compound.subset.find((sub) => sub.id === bracket.id) as RealLink;
    leaf.comIsCustom = true;
    // Midway along the bracket, in whatever units the payload decoded at.
    leaf.CoM = new Coord((at('A').x + at('W').x) / 2, (at('A').y + at('W').y) / 2);
    const comBefore = { x: leaf.CoM.x, y: leaf.CoM.y };
    const witnessBefore = { x: at('W').x, y: at('W').y };
    const spanBefore = Math.hypot(at('D').x - at('A').x, at('D').y - at('A').y);

    // Double the ram's stroke, which is the edit that resizes its two bars.
    // The bracket welded to the barrel mount does not move at all.
    const strokeBefore = cylinderSizeOf(sealed).stroke;
    grid.resizeCylinder(sealed, strokeBefore * 2, 0.5);
    const spanAfter = Math.hypot(at('D').x - at('A').x, at('D').y - at('A').y);
    expect(spanAfter).toBeGreaterThan(spanBefore * 1.2);

    expect(at('W').x).toBeCloseTo(witnessBefore.x, 4);
    expect(at('W').y).toBeCloseTo(witnessBefore.y, 4);
    expect(leaf.CoM.x).toBeCloseTo(comBefore.x, 4);
    expect(leaf.CoM.y).toBeCloseTo(comBefore.y, 4);
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
