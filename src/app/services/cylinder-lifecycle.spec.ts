import '../model/joint';
import { Coord } from '../model/coord';
import { PrisJoint, RealJoint, RevJoint } from '../model/joint';
import { RealLink } from '../model/link';
import { cylinderAtSeal, cylindersIn, CYLINDER_MIN_SPAN_SCALE } from '../model/cylinder';
import { refuseJointMerge } from '../model/drop-target';
import { createMechanismHarness, wireGraph } from '../../test-utils/mechanism-harness';
import { SettingsService } from './settings.service';
import { MODEL_SCALE } from '../model/render-scale';

// The object scale is process-wide static state, and earlier spec files in
// the same worker can leave it wherever they liked. Everything here that
// sizes a cylinder (creation minimum span, collinearity tolerance) reads it,
// so pin it for the file and put it back.
let previousObjectScale: number;
beforeEach(() => {
  previousObjectScale = SettingsService.objectScale;
  SettingsService._objectScale.next(1 * MODEL_SCALE);
});
afterEach(() => {
  SettingsService._objectScale.next(previousObjectScale);
});

// The atomic cylinder's service-level contract: creation is one undo entry,
// the assembly is permanent (no slider-off, no drag-out, no unweld at the
// pin), interior joints take no merges, and deletion cascades to the whole
// part from any member.

function harnessWithCylinder() {
  const harness = createMechanismHarness();
  harness.service.createCylinderFrom(new Coord(0, 0), new Coord(3 * MODEL_SCALE, 0));
  const slider = harness.service.joints.find(
    (joint): joint is PrisJoint => joint instanceof PrisJoint
  )!;
  // Asked of the slider itself. This used to ask the coincident pin beside it
  // -- `connectedJoints[0]` -- which is the joint Stage 1 of
  // `docs/joint-type-and-cylinder-plan.md` folded into the slider.
  const sealed = cylinderAtSeal(slider)!;
  return { ...harness, sealed };
}

/** Resolve the assembly fresh, from its welded pin. */
function resolve(harness: ReturnType<typeof createMechanismHarness>) {
  return cylindersIn(harness.service.joints)[0];
}

describe('creating a cylinder from the two-point gesture', () => {
  it('builds a complete, sealed, collinear assembly along the drawn axis', () => {
    const harness = createMechanismHarness();
    // A tilted axis, so collinearity is a real claim rather than shared y.
    const start = new Coord(2 * MODEL_SCALE, 1 * MODEL_SCALE);
    const end = new Coord(5 * MODEL_SCALE, 3.5 * MODEL_SCALE);

    harness.service.createCylinderFrom(start, end);

    // Four joints and two links, where it was five and three: the seal and the
    // pin the rod hangs on are one joint, and the zero-length block that joined
    // them is gone (Stage 1 of `docs/joint-type-and-cylinder-plan.md`).
    expect(harness.service.joints).toHaveLength(4);
    expect(harness.service.links).toHaveLength(2);
    const sealed = resolve(harness);
    expect(sealed).toBeDefined();
    expect(sealed.seal.isSealed).toBe(true);
    // The seal says its rod cannot turn against the bore in `rotates`; it was
    // the weld on that coincident pin.
    expect(sealed.seal.rotates).toBe(false);
    // The start point is the barrel-side mount; the rod finishes at the cursor.
    expect(Math.hypot(sealed.mountA.x - start.x, sealed.mountA.y - start.y)).toBeLessThan(0.01);
    expect(Math.hypot(sealed.mountB.x - end.x, sealed.mountB.y - end.y)).toBeLessThan(0.01);
    // Collinear along the drawn axis (within the codec-grade rounding the
    // creation applies to each coordinate).
    const axis = Math.hypot(end.x - start.x, end.y - start.y);
    for (const joint of [sealed.inner, sealed.seal]) {
      const cross =
        (end.x - start.x) * (joint.y - start.y) - (end.y - start.y) * (joint.x - start.x);
      expect(Math.abs(cross / axis)).toBeLessThan(0.01);
    }
    // One gesture, one undo entry, committed on the second click.
    expect(harness.saveCount()).toBe(1);
    // The body is selected, so the panel opens on the cylinder.
    expect(harness.active.selectedLink?.id).toBe(sealed.barrel.id);
  });

  it('clamps a zero-length gesture to the minimum span instead of degenerating', () => {
    const harness = createMechanismHarness();

    harness.service.createCylinderFrom(new Coord(0, 0), new Coord(0, 0));

    const sealed = resolve(harness);
    expect(sealed).toBeDefined();
    // The floor a *drawing* gesture clamps at, which is not the floor a
    // cylinder can exist at: a new ram opens at mid-travel, so it needs half a
    // stroke of span on top of a fully-retracted one to reach the minimum
    // stroke. That is what CYLINDER_MIN_SPAN_SCALE now means. Along +x, since
    // a zero-length gesture names no direction.
    const span = Math.hypot(sealed.mountB.x - sealed.mountA.x, sealed.mountB.y - sealed.mountA.y);
    expect(span).toBeCloseTo(CYLINDER_MIN_SPAN_SCALE * MODEL_SCALE, 0);
    expect(sealed.seal.isSlotWellFormed).toBe(true);
  });
});

describe('permanence of a sealed cylinder', () => {
  it('lets a mount slide, and leaves the ram sealed', () => {
    // A mount is not the ram's inside. It used to be refused a slider on the
    // strength of *membership* -- turned away for the slider the cylinder
    // keeps in its bore, which is nothing to do with the mount -- and a
    // carriage on a mount is how an excavator's boom is drawn.
    const h = harnessWithCylinder();
    const mountId = h.sealed.mountB.id;
    h.active.updateSelectedObj(h.sealed.mountB);
    const before = h.service.links.length;

    h.service.toggleSlider();

    // No new link and no new letter: the mount *becomes* the slider, where it
    // used to gain a prismatic joint of its own and a block joining the two.
    expect(h.service.links.length, 'nothing was added to draw').toBe(before);
    const now = h.service.joints.find((joint) => joint.id === mountId);
    expect(now instanceof PrisJoint, 'the mount slides now').toBe(true);
    const still = resolve(h);
    expect(still, 'and the ram is still a ram').toBeDefined();
    expect(still.seal.isSealed).toBe(true);
    expect(still.seal.rotates).toBe(false);
  });

  it('refuses detaching the sealed block from its bore', () => {
    const h = harnessWithCylinder();

    h.service.detachSlider(h.sealed.seal);

    expect(h.sealed.seal.isFloating).toBe(true);
    expect(resolve(h)).toBeDefined();
  });

  it('refuses unwelding the seal', () => {
    const h = harnessWithCylinder();
    h.active.updateSelectedObj(h.sealed.seal);

    h.service.unweldSelectedJoint();

    // The Slide is what holds the rod rigid with the bore, and it never comes
    // off. It was a weld on the coincident pin; it is `rotates` on the slider.
    expect(h.sealed.seal.rotates).toBe(false);
    expect(resolve(h)).toBeDefined();
  });

  it('refuses merges into the interior joints', () => {
    const h = harnessWithCylinder();
    const stray = new RevJoint('Z', h.sealed.seal.x, h.sealed.seal.y);
    const bar = new RealLink('Z' + h.sealed.mountB.id, [stray, h.sealed.mountB]);
    h.service.joints.push(stray);
    h.service.links.push(bar);
    wireGraph(h.service);

    expect(h.service.mergeJoints(stray, h.sealed.seal)).toBe('sealed-cylinder');
    expect(resolve(h)).toBeDefined();
  });

  it('still grounds and drives through the sanctioned surfaces', () => {
    const h = harnessWithCylinder();
    h.active.updateSelectedObj(h.sealed.mountA);
    h.service.toggleGround();
    expect((h.sealed.mountA as RealJoint).ground).toBe(true);

    // Through the ordinary input door, on the seal. A cylinder had a toggle of
    // its own while the joint carrying the drive was unselectable; the seal is
    // the square a reader picks now (decision D9), so there is one door.
    h.active.updateSelectedObj(h.sealed.seal);
    h.service.adjustInput();
    expect(h.sealed.seal.input).toBe(true);
    h.service.adjustInput();
    expect(h.sealed.seal.input).toBe(false);
  });
});

describe('deleting a cylinder cascades to the whole assembly', () => {
  /** The ram, plus a bar hanging off its rod mount. */
  function cylinderWithNeighbor() {
    const h = harnessWithCylinder();
    const e = new RevJoint('Z', h.sealed.mountB.x + 100, h.sealed.mountB.y);
    const neighbor = new RealLink(h.sealed.mountB.id + 'Z', [h.sealed.mountB, e]);
    h.service.joints.push(e);
    h.service.links.push(neighbor);
    wireGraph(h.service);
    return { ...h, neighbor };
  }

  // Two different asks, two different answers, and the labels say which is
  // which: a mount's own menu offers "Delete Cylinder", while the panel's
  // Delete acts on whatever is selected — here, the joint.
  it('from a mount via Delete Cylinder, keeping the mount while a neighbor holds it', () => {
    const h = cylinderWithNeighbor();
    const savesBefore = h.saveCount();

    h.active.updateSelectedObj(h.sealed.mountB);
    h.service.deleteCylinder();

    expect(cylindersIn(h.service.joints)).toHaveLength(0);
    expect(h.service.links.map((link) => link.id)).toEqual([h.neighbor.id]);
    // The rod mount survives on the neighbor; every other member is gone.
    const ids = h.service.joints.map((joint) => joint.id).sort();
    expect(ids).toEqual([h.sealed.mountB.id, 'Z'].sort());
    expect(h.saveCount()).toBe(savesBefore + 1);
  });

  it('from a mount via Delete Joint, taking the joint and what cannot stand without it', () => {
    // Asked to delete the *joint*, the app used to delete only the ram and
    // leave the joint sitting on its neighbor — so the thing that was selected
    // was the one thing still there afterwards.
    const h = cylinderWithNeighbor();

    h.active.updateSelectedObj(h.sealed.mountB);
    h.service.deleteJoint();

    expect(cylindersIn(h.service.joints)).toHaveLength(0);
    // The joint itself goes, and so does the bar that lost an end to it.
    expect(h.service.joints.map((joint) => joint.id)).not.toContain(h.sealed.mountB.id);
    expect(h.service.links).toHaveLength(0);
    // Z is left behind holding nothing. That is what deleting a joint does
    // everywhere in this app — only `deleteLink` sweeps up orphans — so it is
    // recorded here rather than asserted away.
    expect(h.service.joints.map((joint) => joint.id)).toEqual(['Z']);
  });

  it('from the body, removing everything including orphaned mounts', () => {
    const h = harnessWithCylinder();

    h.active.updateSelectedObj(h.sealed.barrel as RealLink);
    h.service.deleteLink();

    expect(h.service.joints).toHaveLength(0);
    expect(h.service.links).toHaveLength(0);
  });

  it('from a member link via deleteLink on the rod', () => {
    const h = harnessWithCylinder();

    h.active.updateSelectedObj(h.sealed.rod);
    h.service.deleteLink();

    expect(h.service.joints).toHaveLength(0);
    expect(h.service.links).toHaveLength(0);
  });
});

describe('the invariant: no write can leave a sealed cylinder bent', () => {
  const offAxis = (
    a: { x: number; y: number },
    b: { x: number; y: number },
    p: { x: number; y: number }
  ) => {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    return Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / length;
  };

  it('straightens a garbage pin position on the next mechanism update', () => {
    const h = harnessWithCylinder();
    // A write that bypassed every gesture: the seal flung far off the axis.
    // One joint to fling, where it used to take two kept coincident by hand.
    h.sealed.seal.x += 137;
    h.sealed.seal.y -= 89;

    h.service.updateMechanism();

    // Geometric resolution — the strict test — succeeds again.
    const restored = resolve(h);
    expect(restored).toBeDefined();
    expect(offAxis(restored.mountA, restored.mountB, restored.seal)).toBeLessThan(1e-3);
    expect(offAxis(restored.mountA, restored.mountB, restored.inner)).toBeLessThan(1e-3);
  });

  it('straightens a garbage buried barrel end without moving the mounts', () => {
    const h = harnessWithCylinder();
    const mountA = { x: h.sealed.mountA.x, y: h.sealed.mountA.y };
    const mountC = { x: h.sealed.mountB.x, y: h.sealed.mountB.y };
    // A write that bypassed every gesture: the buried end swung 45 degrees off
    // the axis about its own mount. It keeps the barrel's *length*, because
    // that length is what the derivation lays back along the axis; a write
    // that changed it is asking for a different cylinder rather than a bent
    // one, which is the case below.
    const offset = { x: h.sealed.inner.x - mountA.x, y: h.sealed.inner.y - mountA.y };
    const swing = Math.PI / 4;
    const barrelLength = Math.hypot(offset.x, offset.y);
    h.sealed.inner.x = mountA.x + offset.x * Math.cos(swing) - offset.y * Math.sin(swing);
    h.sealed.inner.y = mountA.y + offset.x * Math.sin(swing) + offset.y * Math.cos(swing);

    h.service.updateMechanism();

    const restored = resolve(h);
    expect(restored).toBeDefined();
    expect(offAxis(restored.mountA, restored.mountB, restored.inner)).toBeLessThan(1e-3);
    expect(Math.hypot(restored.inner.x - mountA.x, restored.inner.y - mountA.y)).toBeCloseTo(
      barrelLength,
      3
    );
    // The mounts are the user's handles; normalization never moves them.
    expect(restored.mountA.x).toBeCloseTo(mountA.x, 6);
    expect(restored.mountA.y).toBeCloseTo(mountA.y, 6);
    expect(restored.mountB.x).toBeCloseTo(mountC.x, 6);
    expect(restored.mountB.y).toBeCloseTo(mountC.y, 6);
  });

  it('keeps a part whose barrel a stray write lengthened, and holds the length', () => {
    // The derivation is a straightener, not a resizer: it holds the mounts and
    // the barrel it finds. A write that changed the barrel's length is asking
    // for a different cylinder, and it gets one.
    //
    // This used to assert that the part stopped being *recognized* — the
    // geometric test refused a barrel and a rod of different lengths, so an
    // unequal assembly lost its skin while staying a cylinder structurally, and
    // the two answers had to be kept apart everywhere. Sealed is the whole test
    // now (Stage 2, decision S1): it is a cylinder, its barrel is as long as
    // the stray write made it, and a part with no usable travel is the
    // readiness rules' business rather than the resolver's.
    const h = harnessWithCylinder();
    const mountA = { x: h.sealed.mountA.x, y: h.sealed.mountA.y };
    const was = Math.hypot(h.sealed.inner.x - mountA.x, h.sealed.inner.y - mountA.y);
    h.sealed.inner.x = mountA.x + 2 * (h.sealed.inner.x - mountA.x);
    h.sealed.inner.y = mountA.y + 2 * (h.sealed.inner.y - mountA.y);

    h.service.updateMechanism();

    const restored = resolve(h);
    expect(restored).toBeDefined();
    expect(h.service.cylinderAt(h.sealed.mountB)).toBeDefined();
    expect(offAxis(restored.mountA, restored.mountB, restored.inner)).toBeLessThan(1e-3);
    expect(Math.hypot(restored.inner.x - mountA.x, restored.inner.y - mountA.y)).toBeCloseTo(
      2 * was,
      3
    );
    expect(restored.mountA.x).toBeCloseTo(mountA.x, 6);
    expect(restored.mountA.y).toBeCloseTo(mountA.y, 6);
  });

  it('is the identity for an assembly that is already valid', () => {
    const h = harnessWithCylinder();
    const before = h.service.joints.map((joint) => ({ id: joint.id, x: joint.x, y: joint.y }));

    h.service.updateMechanism();

    h.service.joints.forEach((joint, index) => {
      expect(joint.x).toBeCloseTo(before[index].x, 6);
      expect(joint.y).toBeCloseTo(before[index].y, 6);
    });
  });

  it('keeps recognizing the assembly structurally while it is bent', () => {
    // The guards and drag routing must not fail open mid-repair — that lapse
    // is exactly how a fast drag used to tear a cylinder for good.
    const h = harnessWithCylinder();
    h.sealed.seal.y += 300;

    expect(h.service.cylinderAt(h.sealed.mountB)).toBeDefined();
    expect(h.service.cylinderAt(h.sealed.barrel)).toBeDefined();
  });
});

describe('a mount welded into a neighboring link', () => {
  function weldedMount() {
    const h = harnessWithCylinder();
    const e = new RevJoint('Z', h.sealed.mountB.x + 100, h.sealed.mountB.y);
    const neighbor = new RealLink(h.sealed.mountB.id + 'Z', [h.sealed.mountB, e]);
    h.service.joints.push(e);
    h.service.links.push(neighbor);
    wireGraph(h.service);
    h.active.updateSelectedObj(h.sealed.mountB);
    h.service.weldJoint();
    return { ...h, e };
  }

  it('keeps the weld functional and the skin resolvable through the compound', () => {
    const h = weldedMount();

    expect((h.sealed.mountB as RealJoint).isWelded).toBe(true);
    // The rod is now a subset leaf of a compound; the resolver follows it.
    const still = resolve(h);
    expect(still).toBeDefined();
    expect(still.rod.id).toBe(h.sealed.rod.id);
    expect(still.mountB.id).toBe(h.sealed.mountB.id);
  });

  it('is deleted while locked, by either door', () => {
    // A lock holds the part where it is; it does not keep it in the drawing.
    // Both doors used to refuse on the strength of one -- the second on the
    // barrel's mark rather than the mount's own, so an unlocked mount refused
    // for a reason nothing on it showed.
    const h = weldedMount();
    const sealed = resolve(h)!;
    h.service.toggleLock(sealed.barrel as never);
    expect(h.service.isLockedTarget(sealed.barrel as never)).toBe(true);

    // Straight at the part: the menu calls this with the cylinder it found.
    h.service.deleteCylinder(resolve(h));
    expect(cylindersIn(h.service.joints)).toHaveLength(0);
  });

  it('takes the whole part when a mount of a locked cylinder goes', () => {
    const h = weldedMount();
    h.service.toggleLock(resolve(h)!.barrel as never);
    const mount = h.service.joints.find((joint) => joint.id === h.sealed.mountA.id)!;
    expect(h.service.isLockedTarget(mount as never)).toBe(false);
    h.active.updateSelectedObj(mount);
    h.service.deleteJoint();
    expect(cylindersIn(h.service.joints)).toHaveLength(0);
  });

  it('still cascades a delete, unwelding the mount so the neighbor survives', () => {
    const h = weldedMount();

    h.service.deleteCylinder(resolve(h));

    expect(cylindersIn(h.service.joints)).toHaveLength(0);
    // The neighbor bar came back out of the compound intact.
    expect(h.service.links.map((link) => link.id)).toEqual([h.sealed.mountB.id + 'Z']);
    expect(h.service.joints.map((joint) => joint.id).sort()).toEqual(
      [h.sealed.mountB.id, 'Z'].sort()
    );
  });
});

describe('mount merge rules', () => {
  // Mounts merge like any joint — that is how a cylinder attaches — and the
  // one thing that is still not a merge is a part folding onto itself.
  it('allows a welded joint to meet a mount, both directions', () => {
    // This used to be refused outright, on the grounds that a weld arriving at
    // a mount manufactured a state the model had no answer for. It has one:
    // the mount joins the compound. What `mergeJoints` still checks, before
    // taking anything apart, is whether the joint the merge would leave behind
    // can carry the weld at all.
    const h = harnessWithCylinder();
    const stray = new RevJoint('Z', 999, 999);
    stray.isWelded = true;
    h.service.joints.push(stray);
    const cylinders = cylindersIn(h.service.joints);

    expect(refuseJointMerge(stray, h.sealed.mountB, cylinders)).toBeUndefined();
    expect(refuseJointMerge(h.sealed.mountB, stray, cylinders)).toBeUndefined();
  });

  it('refuses folding a cylinder onto itself', () => {
    const h = harnessWithCylinder();

    expect(refuseJointMerge(h.sealed.mountA, h.sealed.mountB, cylindersIn(h.service.joints))).toBe(
      'own-cylinder'
    );
  });

  it('allows a mount onto a plain joint', () => {
    const h = harnessWithCylinder();
    const plain = new RevJoint('Z', 999, 999);
    h.service.joints.push(plain);

    expect(refuseJointMerge(h.sealed.mountB, plain, cylindersIn(h.service.joints))).toBeUndefined();
  });
});
