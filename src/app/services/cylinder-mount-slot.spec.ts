import '../model/joint';
import { Coord } from '../model/coord';
import { PrisJoint, RealJoint } from '../model/joint';
import { Link, RealLink } from '../model/link';
import {
  Cylinder,
  cylinderAtSeal,
  cylinderHeadTravel,
  cylindersIn,
  cylinderLengthsOf,
} from '../model/cylinder';
import { resolveSlotDropTarget, slotWouldFoldACylinder } from '../model/drop-target';
import { createMechanismHarness, wireGraph } from '../../test-utils/mechanism-harness';
import { encodeUrlOf } from '../../test-utils/url-encoding';
import { ActiveObjService } from './active-obj.service';
import { SettingsService } from './settings.service';
import { MechanismService } from './mechanism.service';
import { MechanismBuilder } from './transcoding/mechanism-builder';
import { StringTranscoder } from './transcoding/string-transcoder';
import { MODEL_SCALE } from '../model/render-scale';

/**
 * A cylinder's end joint takes a slot drop like any pin (decision S22).
 *
 * The canvas gesture is `e2e/cylinder-mount-slot.mjs`. This is the half below
 * it: which bars are offered to an end joint at all, what the cut leaves
 * behind in each state the joint can be in, and what happens to the part when
 * something else moves the joint afterwards.
 */

// Object scale is process-wide static state and every cylinder size question
// reads it, so pin it for the file and put it back.
let previousObjectScale: number;
beforeEach(() => {
  previousObjectScale = SettingsService.objectScale;
  SettingsService._objectScale.next(1 * MODEL_SCALE);
});
afterEach(() => {
  SettingsService._objectScale.next(previousObjectScale);
});

const S = MODEL_SCALE;

/**
 * A ram along the x axis with a rail off to one side for its rod end to land
 * on, and optionally a bracket welded to that end.
 *
 * The rail slants across the ram's axis: square to it is a dead centre, which
 * is a fact about the geometry and nothing to do with the drop.
 */
function ramAndRail(options: { weld?: boolean; second?: boolean } = {}) {
  const harness = createMechanismHarness();
  const service = harness.service;
  service.createCylinderFrom(new Coord(-3.5 * S, 1.5 * S), new Coord(-0.5 * S, 1.5 * S));
  const sealed = cylindersIn(service.joints)[0];
  const end = sealed.mountB as RealJoint;

  const rail = service.addBar(new Coord(0.5 * S, -0.5 * S), new Coord(3 * S, 2 * S))!;
  let bracket: RealLink | undefined;
  if (options.weld) {
    bracket = service.addBarFrom(end, new Coord(end.x + 1 * S, end.y + 2 * S))!;
    harness.active.updateSelectedObj(end);
    service.weldJoint();
  }
  if (options.second) {
    // A second ram hung on the same end joint: one ram's rod end is the next
    // one's barrel end, which is how a boom and a stick are drawn. Mounted on
    // the joint rather than at its coordinates, which is the gesture's own
    // "start this one on that joint".
    service.createCylinderFrom(
      new Coord(end.x, end.y),
      new Coord(end.x, end.y + 3 * S),
      undefined,
      end
    );
  }
  wireGraph(service);
  return { ...harness, rail, bracket, endId: end.id };
}

const ramOf = (service: MechanismService): Cylinder => cylindersIn(service.joints)[0];
const jointOf = (service: MechanismService, id: string) =>
  service.joints.find((joint) => joint.id === id) as RealJoint;

/** Cut the slot the way the canvas does: aimed at the middle of the bar. */
function dropOn(service: MechanismService, id: string, carrier: Link): boolean {
  const [a, b] = carrier.joints;
  return service.cutSlotOn(jointOf(service, id), {
    carrier,
    a,
    b,
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  });
}

/** Three statements that together say "still one straight, connected part". */
function assembled(cylinder: Cylinder): {
  bend: number;
  lengths: { barrel: number; rod: number };
  sealAlong: number;
  travel: { min: number; max: number };
} {
  const { mountA, mountB, seal } = cylinder;
  const dx = mountB.x - mountA.x;
  const dy = mountB.y - mountA.y;
  const span = Math.hypot(dx, dy);
  const lengths = cylinderLengthsOf(cylinder);
  return {
    // How far off the A→B axis the buried end stands.
    bend:
      Math.abs((cylinder.inner.x - mountA.x) * dy - (cylinder.inner.y - mountA.y) * dx) /
      Math.max(1e-9, span),
    lengths,
    sealAlong: ((seal.x - mountA.x) * dx + (seal.y - mountA.y) * dy) / Math.max(1e-9, span),
    travel: cylinderHeadTravel(lengths.barrel, 0.15 * SettingsService.objectScale),
  };
}

describe('which bars a cylinder end joint is offered', () => {
  it('offers an unrelated bar, and lands the joint on its line', () => {
    const h = ramAndRail();
    const sealed = ramOf(h.service);
    const end = sealed.mountB;
    const mid = {
      x: (h.rail.joints[0].x + h.rail.joints[1].x) / 2,
      y: (h.rail.joints[0].y + h.rail.joints[1].y) / 2,
    };
    const candidate = resolveSlotDropTarget(
      end,
      mid.x,
      mid.y,
      h.service.links,
      0.5 * S,
      cylindersIn(h.service.joints)
    );

    expect(candidate?.carrier.id).toBe(h.rail.id);
    // On the segment, not merely near it: the preview is the result.
    const [a, b] = h.rail.joints;
    const across =
      Math.abs((candidate!.x - a.x) * (b.y - a.y) - (candidate!.y - a.y) * (b.x - a.x)) /
      Math.hypot(b.x - a.x, b.y - a.y);
    expect(across).toBeLessThan(1e-9);
  });

  it('never offers its own cylinder: the rod holds it, and the barrel holds its far end', () => {
    const h = ramAndRail();
    const sealed = ramOf(h.service);
    const end = sealed.mountB;
    // Aimed at the middle of the barrel, which is the one place a reader
    // sweeping a ram's own end joint back along the part passes over.
    const onBarrel = {
      x: (sealed.mountA.x + sealed.inner.x) / 2,
      y: (sealed.mountA.y + sealed.inner.y) / 2,
    };
    const candidate = resolveSlotDropTarget(
      end,
      onBarrel.x,
      onBarrel.y,
      h.service.links,
      0.5 * S,
      cylindersIn(h.service.joints)
    );

    expect(candidate).toBeUndefined();
    // Each for its own reason, which is why neither needs a rule of its own
    // in the canvas: the rod is a body the joint belongs to, and the barrel is
    // a body already holding the ram's other end.
    expect(sealed.rod.joints.some((joint) => joint.id === end.id)).toBe(true);
    expect(slotWouldFoldACylinder(end, sealed.barrel, cylindersIn(h.service.joints))).toBe(true);
  });

  it('never offers a bracket welded to the joint being dragged', () => {
    const h = ramAndRail({ weld: true });
    const sealed = ramOf(h.service);
    const end = sealed.mountB;
    const tip = h.bracket!.joints.find((joint) => joint.id !== end.id)!;
    const candidate = resolveSlotDropTarget(
      end,
      (end.x + tip.x) / 2,
      (end.y + tip.y) / 2,
      h.service.links,
      0.5 * S,
      cylindersIn(h.service.joints)
    );

    expect(candidate).toBeUndefined();
  });

  it('never offers the body already holding the cylinder’s other end', () => {
    const h = ramAndRail();
    const sealed = ramOf(h.service);
    // A bar hung on the barrel mount, reaching across to where the rod end is.
    const far = h.service.addBarFrom(
      sealed.mountA as RealJoint,
      new Coord(sealed.mountB.x, sealed.mountB.y - 1 * S)
    )!;
    wireGraph(h.service);
    const [a, b] = far.joints;
    const candidate = resolveSlotDropTarget(
      ramOf(h.service).mountB,
      (a.x + b.x) / 2,
      (a.y + b.y) / 2,
      h.service.links,
      0.5 * S,
      cylindersIn(h.service.joints)
    );

    expect(candidate).toBeUndefined();
  });
});

describe('cutting the slot at a cylinder’s end joint', () => {
  it('leaves a plain end joint riding the bar, as Pin-in-slot, part intact', () => {
    const h = ramAndRail();
    const before = ramOf(h.service);
    const roles = {
      mountA: before.mountA.id,
      mountB: before.mountB.id,
      seal: before.seal.id,
      inner: before.inner.id,
    };

    expect(dropOn(h.service, h.endId, h.rail)).toBe(true);

    const after = ramOf(h.service);
    expect(after, 'the cylinder still resolves').toBeDefined();
    expect({
      mountA: after.mountA.id,
      mountB: after.mountB.id,
      seal: after.seal.id,
      inner: after.inner.id,
    }).toEqual(roles);
    const end = jointOf(h.service, h.endId);
    expect(end).toBeInstanceOf(PrisJoint);
    expect((end as PrisJoint).isFloating).toBe(true);
    expect((end as PrisJoint).carrier!.id).toBe(h.rail.id);
    // Unwelded in, Pin-in-slot out: the rod may still turn against the rail.
    expect((end as PrisJoint).rotates).toBe(true);
    // The object in the drawing is the new one, and nothing is holding the old.
    expect(h.service.joints.filter((joint) => joint.id === h.endId)).toHaveLength(1);
    expect(after.mountB).toBe(end);
  });

  it('makes a welded end Prismatic, and leaves the bracket welded', () => {
    const h = ramAndRail({ weld: true });
    expect(jointOf(h.service, h.endId).isWelded).toBe(true);

    expect(dropOn(h.service, h.endId, h.rail)).toBe(true);

    const end = jointOf(h.service, h.endId) as PrisJoint;
    expect(end).toBeInstanceOf(PrisJoint);
    // A Slide: the weld crosses to `rotates`, so the bracket cannot turn in
    // the rail. The same exchange `cylinder-mount-topology.spec.ts` checks for
    // a slider and a weld at one mount, arrived at by the drop instead.
    expect(end.rotates).toBe(false);
    expect(end.isWelded).toBe(true);
    expect(end.carrier!.id).toBe(h.rail.id);
    expect(cylindersIn(h.service.joints)).toHaveLength(1);
    const compounds = h.service.links.filter(
      (link): link is RealLink => link instanceof RealLink && link.subset.length > 0
    );
    expect(compounds.length, 'the compound at the mount survives').toBeGreaterThan(0);
  });

  it('keeps both cylinders when the end joint is shared by two', () => {
    const h = ramAndRail({ second: true });
    expect(cylindersIn(h.service.joints)).toHaveLength(2);

    expect(dropOn(h.service, h.endId, h.rail)).toBe(true);

    const rams = cylindersIn(h.service.joints);
    expect(rams).toHaveLength(2);
    // The shared joint is still an end of both, and it is the one object.
    const end = jointOf(h.service, h.endId);
    expect(rams.every((ram) => ram.mountA.id === end.id || ram.mountB.id === end.id)).toBe(true);
    expect(rams.every((ram) => ram.mountA === end || ram.mountB === end)).toBe(true);
  });

  it('carries a drive on the end joint across the exchange', () => {
    const h = ramAndRail();
    const end = jointOf(h.service, h.endId);
    end.input = true;

    expect(dropOn(h.service, h.endId, h.rail)).toBe(true);

    expect(jointOf(h.service, h.endId).input).toBe(true);
  });

  it('drops a grounded end joint’s ground, exactly as an ordinary pin’s is dropped', () => {
    // "What does an ordinary grounded pin do when dropped on a bar?" — it stops
    // being grounded, because a floating slot's direction is the carrier's.
    // Both halves are asked here so the two can never drift apart.
    const h = ramAndRail();
    const end = jointOf(h.service, h.endId);
    h.active.updateSelectedObj(end);
    h.service.toggleGround();
    expect(jointOf(h.service, h.endId).ground).toBe(true);

    expect(dropOn(h.service, h.endId, h.rail)).toBe(true);
    const mount = jointOf(h.service, h.endId) as PrisJoint;
    expect(mount.ground).toBe(false);
    expect(mount.isFloating).toBe(true);

    const plain = createMechanismHarness();
    const bar = plain.service.addBar(new Coord(-2 * S, 0), new Coord(0, 0))!;
    const rail = plain.service.addBar(new Coord(1 * S, -1 * S), new Coord(3 * S, 1 * S))!;
    wireGraph(plain.service);
    const pin = bar.joints[1] as RealJoint;
    plain.active.updateSelectedObj(pin);
    plain.service.toggleGround();
    expect(dropOn(plain.service, pin.id, rail)).toBe(true);
    const ordinary = plain.service.joints.find((joint) => joint.id === pin.id) as PrisJoint;
    expect(ordinary.ground).toBe(false);
    expect(ordinary.isFloating).toBe(true);
  });
});

describe('when the carrier moves under a cylinder’s end joint', () => {
  /** Move a joint of the rail, then let the reseat and the rebuild answer. */
  function moveRail(h: ReturnType<typeof ramAndRail>, dx: number, dy: number) {
    h.rail.joints.forEach((joint) => {
      joint.x += dx;
      joint.y += dy;
    });
    h.service.reseatFloatingSliders();
    h.service.updateMechanism(false);
    return assembled(ramOf(h.service));
  }

  it('re-lays the part so it stays straight and the head stays in its own barrel', () => {
    const h = ramAndRail();
    dropOn(h.service, h.endId, h.rail);
    h.service.updateMechanism(false);
    const before = assembled(ramOf(h.service));
    expect(before.bend).toBeLessThan(1e-6);

    // Far enough that the span genuinely changes: written straight, the mount
    // would go to the channel and the members would keep the lengths they had,
    // which is a head as far outside the barrel as the stretch.
    for (const step of [0.5, 1, 1.5, 2]) {
      const now = moveRail(h, step * S, -0.4 * step * S);
      expect(now.bend, `bend after ${step}`).toBeLessThan(1e-3);
      expect(now.sealAlong, `head after ${step}`).toBeGreaterThanOrEqual(now.travel.min - 1e-6);
      expect(now.sealAlong, `head after ${step}`).toBeLessThanOrEqual(now.travel.max + 1e-6);
    }
  });

  it('keeps the end joint on the channel it rides', () => {
    const h = ramAndRail();
    dropOn(h.service, h.endId, h.rail);
    h.service.updateMechanism(false);

    moveRail(h, 1.5 * S, -0.6 * S);

    const end = jointOf(h.service, h.endId) as PrisJoint;
    const [a, b] = [end.slotJointA!, end.slotJointB!];
    const off =
      Math.abs((end.x - a.x) * (b.y - a.y) - (end.y - a.y) * (b.x - a.x)) /
      Math.hypot(b.x - a.x, b.y - a.y);
    expect(off).toBeLessThan(1e-6);
    expect(end.carrier!.id).toBe(h.rail.id);
  });

  it('resizes the members rather than tearing them, and only as far as it must', () => {
    const h = ramAndRail();
    dropOn(h.service, h.endId, h.rail);
    h.service.updateMechanism(false);
    const before = assembled(ramOf(h.service));

    // Pulled away, so the part has to reach further than its own travel.
    const after = moveRail(h, 4 * S, 0);

    const sealed = ramOf(h.service);
    const span = Math.hypot(sealed.mountB.x - sealed.mountA.x, sealed.mountB.y - sealed.mountA.y);
    // The arithmetic a pose promises: |AN| and |SB| are the two lengths, and
    // the rod reaches from the head to the far end.
    expect(Math.abs(span - (after.sealAlong + after.lengths.rod))).toBeLessThan(1e-3);
    expect(after.lengths.barrel).toBeGreaterThan(before.lengths.barrel);
  });

  it('stops the block where the part bottoms out, and never tears the part', () => {
    // The carrier walked right up onto the cylinder's other end, which is where
    // a stretch of the channel stops being somewhere the part can reach. At
    // every step the block is either on its channel or exactly where it was —
    // never written to the channel with the members left the lengths they had,
    // which is the tear this branch exists to avoid.
    const h = ramAndRail();
    dropOn(h.service, h.endId, h.rail);
    h.service.updateMechanism(false);
    const sealed = ramOf(h.service);
    const toMountA = {
      x: sealed.mountA.x - (h.rail.joints[0].x + h.rail.joints[1].x) / 2,
      y: sealed.mountA.y - (h.rail.joints[0].y + h.rail.joints[1].y) / 2,
    };

    let held = false;
    let previous = { x: sealed.mountB.x, y: sealed.mountB.y };
    for (let step = 1; step <= 8; step++) {
      const after = moveRail(h, toMountA.x / 8, toMountA.y / 8);
      const end = jointOf(h.service, h.endId) as PrisJoint;
      const [a, b] = [end.slotJointA!, end.slotJointB!];
      const off =
        Math.abs((end.x - a.x) * (b.y - a.y) - (end.y - a.y) * (b.x - a.x)) /
        Math.hypot(b.x - a.x, b.y - a.y);
      const stayed = Math.hypot(end.x - previous.x, end.y - previous.y) < 1e-9;
      expect(off < 1e-6 || stayed, `on its channel, or left alone (step ${step})`).toBe(true);
      expect(after.bend, `still one straight part (step ${step})`).toBeLessThan(1e-3);
      expect(after.sealAlong).toBeGreaterThanOrEqual(after.travel.min - 1e-6);
      expect(after.sealAlong).toBeLessThanOrEqual(after.travel.max + 1e-6);
      // The rail keeps going; at some point the block cannot follow it the
      // whole way, which is the clamp doing its job rather than the projection.
      held ||= stayed;
      previous = { x: end.x, y: end.y };
    }
    expect(held, 'the block stopped following at some point').toBe(true);
  });

  it('leaves a locked end joint exactly where it is', () => {
    // A Lock says the joint does not move. A reseat is nobody's gesture, so it
    // is the one thing that must not argue with one.
    const h = ramAndRail();
    dropOn(h.service, h.endId, h.rail);
    h.service.updateMechanism(false);
    const end = jointOf(h.service, h.endId);
    end.locked = true;
    const was = { x: end.x, y: end.y };

    moveRail(h, 1.5 * S, -0.6 * S);

    const after = jointOf(h.service, h.endId);
    expect(Math.hypot(after.x - was.x, after.y - was.y)).toBeLessThan(1e-9);
  });
});

describe('a cylinder end joint on a slot, through the URL', () => {
  it('reloads as one cylinder whose end still rides the same bar', () => {
    const h = ramAndRail();
    dropOn(h.service, h.endId, h.rail);
    h.service.updateMechanism(false);
    const source = ramOf(h.service);
    const was = {
      roles: [source.mountA.id, source.inner.id, source.seal.id, source.mountB.id],
      lengths: cylinderLengthsOf(source),
      carrier: (jointOf(h.service, h.endId) as PrisJoint).carrier!.id,
    };

    const encoded = encodeUrlOf(h.service, h.settings);
    const decoder = new StringTranscoder();
    decoder.decodeURL(encoded);
    const target = {
      joints: [],
      links: [],
      forces: [],
      mechanismTimeStep: 0,
    } as unknown as MechanismService;
    new MechanismBuilder(target, decoder, new SettingsService(), new ActiveObjService()).build(
      false
    );

    const rebuilt = cylindersIn(target.joints);
    expect(rebuilt).toHaveLength(1);
    expect([
      rebuilt[0].mountA.id,
      rebuilt[0].inner.id,
      rebuilt[0].seal.id,
      rebuilt[0].mountB.id,
    ]).toEqual(was.roles);
    const end = target.joints.find((joint) => joint.id === was.roles[3]) as PrisJoint;
    expect(end).toBeInstanceOf(PrisJoint);
    expect(end.isFloating).toBe(true);
    expect(end.isSlotWellFormed).toBe(true);
    expect(end.carrier!.id).toBe(was.carrier);
    // Identity, not just id: a slot bound to objects from another copy of the
    // mechanism reads positions that never move.
    expect(end.carrier).toBe(target.links.find((link) => link.id === was.carrier));
    const lengths = cylinderLengthsOf(rebuilt[0]);
    expect(Math.abs(lengths.barrel - was.lengths.barrel)).toBeLessThan(0.02 * S);
    expect(Math.abs(lengths.rod - was.lengths.rod)).toBeLessThan(0.02 * S);
    // And it is still a cylinder to the one function that decides that.
    expect(cylinderAtSeal(rebuilt[0].seal)).toBeDefined();
  });
});
