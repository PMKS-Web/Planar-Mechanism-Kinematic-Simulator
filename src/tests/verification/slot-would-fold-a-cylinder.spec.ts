// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Coord } from '../../app/model/coord';
import { PrisJoint, RealJoint, RevJoint } from '../../app/model/joint';
import { RealLink } from '../../app/model/link';
import { sealedCylinders } from '../../app/model/cylinder';
import { resolveSlotDropTarget, slotWouldFoldACylinder } from '../../app/model/drop-target';
import { createMechanismHarness } from '../../test-utils/mechanism-harness';
import { SettingsService } from '../../app/services/settings.service';
import { MODEL_SCALE } from '../../app/model/render-scale';

const S = MODEL_SCALE;

let previousObjectScale: number;
beforeEach(() => {
  previousObjectScale = SettingsService.objectScale;
  SettingsService._objectScale.next(1 * S);
});
afterEach(() => {
  SettingsService._objectScale.next(previousObjectScale);
});

// A slot is a hole through a bar, and the joint dropped on it is pulled onto
// that bar's line. When the bar already passes through the other end of the
// dragged joint's own ram, there is nowhere for the part to go but shorter --
// and far enough is inside out: the mount crosses back past its own barrel's
// near end, the roles are then derived the other way round, and the drawing
// puts a letter on an interior joint while hiding the mount being dragged.
//
// The merge path has refused folding a ram onto itself all along
// (`own-cylinder`). This is the same statement about the same two joints with
// a slot between them instead of a weld, so it is refused in the same two
// places: the preview never offers it, and the commit asks again before it
// writes a coordinate.

/** A ram from `from` to `to`, plus a bar hung on its rod mount. */
function ramWithABar(options: { weld: boolean }) {
  const harness = createMechanismHarness();
  const service = harness.service;

  service.createCylinderFrom(new Coord(-4 * S, 0), new Coord(2 * S, 0));
  const ram = sealedCylinders(service.joints)[0];
  const mount = ram.rodFar as RealJoint;

  const tip = new RevJoint('W', mount.x + 2 * S, mount.y + 3 * S);
  service.joints.push(tip);
  service.links.push(new RealLink(mount.id + tip.id, [mount, tip]));
  service.finishStructuralEdit(true);
  if (options.weld) {
    harness.active.updateSelectedObj(mount);
    service.weldJoint();
  }

  const bar = service.links.find(
    (link): link is RealLink => link instanceof RealLink && link.joints.some((j) => j.id === tip.id)
  )!;
  return { ...harness, ram: sealedCylinders(service.joints)[0], tip, bar };
}

/** The slot this drop would cut, described the way the canvas describes it. */
function slotAcross(bar: RealLink) {
  const leaf = bar.subset.length > 0 ? bar.subset[bar.subset.length - 1] : bar;
  const [a, b] = leaf.joints;
  return { carrier: bar, a, b, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

describe('a slot that would fold a ram', () => {
  it('is not offered on a bar hung off the ram’s other mount', () => {
    const { ram, bar } = ramWithABar({ weld: false });
    const barrelFar = ram.barrelFar as RealJoint;
    const across = slotAcross(bar);

    expect(slotWouldFoldACylinder(barrelFar, bar, [ram])).toBe(true);
    expect(
      resolveSlotDropTarget(barrelFar, across.x, across.y, [bar], 10 * S, [ram])
    ).toBeUndefined();
  });

  it('is not offered on the compound that mount is welded into either', () => {
    const { service, ram, bar } = ramWithABar({ weld: true });
    const barrelFar = ram.barrelFar as RealJoint;
    const compound = service.links.find(
      (link): link is RealLink => link instanceof RealLink && link.subset.length > 0
    )!;
    const across = slotAcross(compound);

    expect(compound.subset.length).toBeGreaterThan(1);
    expect(slotWouldFoldACylinder(barrelFar, compound, [ram])).toBe(true);
    expect(
      resolveSlotDropTarget(barrelFar, across.x, across.y, [compound], 10 * S, [ram])
    ).toBeUndefined();
    // And the bar is still offered to a joint that is not part of that ram.
    const stranger = new RevJoint('Q', across.x, across.y);
    expect(
      resolveSlotDropTarget(stranger, across.x, across.y, [compound], 10 * S, [ram])
    ).toBeDefined();
  });

  it('is refused at the commit, without moving the mount first', () => {
    const { service, ram, bar } = ramWithABar({ weld: true });
    const barrelFar = ram.barrelFar as RealJoint;
    const compound = service.links.find(
      (link): link is RealLink => link instanceof RealLink && link.subset.length > 0
    )!;
    const before = { x: barrelFar.x, y: barrelFar.y };
    const span = Math.hypot(
      (ram.rodFar as RealJoint).x - barrelFar.x,
      (ram.rodFar as RealJoint).y - barrelFar.y
    );

    expect(service.cutSlotOn(barrelFar, slotAcross(compound))).toBe(false);

    // A refusal that has already written half of itself is not a refusal: the
    // mount is where it was, no block was made, and the part is the length it
    // was drawn at.
    const after = sealedCylinders(service.joints);
    expect(after.length).toBe(1);
    expect({ x: barrelFar.x, y: barrelFar.y }).toEqual(before);
    expect(service.joints.filter((j) => j instanceof PrisJoint && !j.isSealed).length).toBe(0);
    expect(
      Math.hypot(
        (after[0].rodFar as RealJoint).x - (after[0].barrelFar as RealJoint).x,
        (after[0].rodFar as RealJoint).y - (after[0].barrelFar as RealJoint).y
      )
    ).toBeCloseTo(span, 6);
    // And the ram is still the way round it was drawn.
    expect(after[0].barrelFar.id).toBe(ram.barrelFar.id);
    expect(after[0].barrelNear.id).toBe(ram.barrelNear.id);
  });

  it('says nothing about a bar the ram does not reach', () => {
    const { service, ram } = ramWithABar({ weld: false });
    const barrelFar = ram.barrelFar as RealJoint;

    // A bar somewhere else entirely: a mount may ride that, and this is the
    // whole point of letting a mount take a slot at all.
    const one = new RevJoint('Y', -6 * S, -3 * S);
    const two = new RevJoint('Z', -1 * S, -3 * S);
    const elsewhere = new RealLink('YZ', [one, two]);
    one.links.push(elsewhere);
    two.links.push(elsewhere);
    service.joints.push(one, two);
    service.links.push(elsewhere);
    service.finishStructuralEdit(true);

    expect(slotWouldFoldACylinder(barrelFar, elsewhere, [ram])).toBe(false);
    const across = slotAcross(elsewhere);
    expect(
      resolveSlotDropTarget(barrelFar, across.x, across.y, [elsewhere], 10 * S, [ram])
    ).toBeDefined();
    expect(service.cutSlotOn(barrelFar, across)).toBe(true);
    expect(sealedCylinders(service.joints).length).toBe(1);
  });

  it('asks every ram a shared mount belongs to, not the first', () => {
    // A boom and a stick: one ram's rod mount is the next one's barrel mount.
    // Dropping the stick's far end onto a bar hung off the *boom's* barrel
    // mount folds nothing -- but dropping it onto a bar hung off the stick's
    // own barrel mount, which is that shared joint, does.
    const harness = createMechanismHarness();
    const service = harness.service;
    service.createCylinderFrom(new Coord(-5 * S, 0), new Coord(0, 0));
    const boom = sealedCylinders(service.joints)[0];
    service.createCylinderFrom(
      new Coord(0, 0),
      new Coord(4 * S, 3 * S),
      undefined,
      boom.rodFar as RealJoint
    );
    service.finishStructuralEdit(true);
    const rams = sealedCylinders(service.joints);
    const shared = rams[0].rodFar as RealJoint;
    const stickTip = rams.find((one) => one.barrelFar.id === shared.id)!.rodFar as RealJoint;

    const tip = new RevJoint('W', shared.x - 1 * S, shared.y + 3 * S);
    service.joints.push(tip);
    service.links.push(new RealLink(shared.id + tip.id, [shared, tip]));
    service.finishStructuralEdit(true);
    const bar = service.links.find(
      (link): link is RealLink =>
        link instanceof RealLink && link.joints.some((j) => j.id === tip.id)
    )!;

    // The bar holds the shared joint, which is the stick's barrel mount, so
    // the stick's rod mount may not ride it.
    expect(slotWouldFoldACylinder(stickTip, bar, rams)).toBe(true);
    expect(service.cutSlotOn(stickTip, slotAcross(bar))).toBe(false);
    expect(sealedCylinders(service.joints).length).toBe(2);
  });
});
