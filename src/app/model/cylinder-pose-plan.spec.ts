import { PrisJoint, RevJoint } from './joint';
import { RealLink } from './link';
import { ram, rewire, weldBracketOnto } from '../../test-utils/cylinder-graph';
import { Cylinder, CylinderPose, cylindersIn } from './cylinder';
import { EditContext, EditRequest, Point, planEdit, snapshotOf } from './cylinder-pose-plan';
import { Joint } from './joint';

/**
 * What moves when an edit touches a cylinder, once its end joints can be
 * welded to things.
 *
 * **Only a body drag carries** (decision S21). A pose marked `motion: 'body'`
 * is the reader holding the whole assembly, and that takes every bar welded to
 * either member with it. Every other pose — the ones a dragged end joint, a
 * dragged slide, a typed angle, *Starts at* or a member length produce — writes
 * the cylinder's own four joints and leaves a welded bracket to change shape
 * around them, which is what the rest of the app does to a compound whose joint
 * is dragged.
 *
 * So nearly every test here comes in a pair: the same weld, once under a body
 * motion and once under a re-pose, with opposite answers. Anything that asserts
 * a carry without saying `motion: 'body'` is asserting the rule this file
 * stopped following on September 21, 2026.
 *
 * Four coordinates, where there were five: a block bolted to an end joint used
 * to be a separate link holding a joint coincident with it, and Stage 1 of
 * `docs/joint-type-and-cylinder-plan.md` made a slider one joint.
 *
 * The claims worth making are about the settled result rather than about the
 * order the walk visited things in: each side carried by its own end joint's
 * motion, the closure reaching a chain of cylinders, and a lock refusing actual
 * displacement rather than mere mention.
 */

/** Lay a carried ram out along its new axis, keeping the length it was drawn at. */
function keepingLength(cylinder: Cylinder, mountA: Point, mountB: Point): CylinderPose {
  const span = Math.hypot(mountB.x - mountA.x, mountB.y - mountA.y);
  const barrel = Math.hypot(
    cylinder.inner.x - cylinder.mountA.x,
    cylinder.inner.y - cylinder.mountA.y
  );
  const along = (distance: number) => ({
    x: mountA.x + ((mountB.x - mountA.x) * distance) / span,
    y: mountA.y + ((mountB.y - mountA.y) * distance) / span,
  });
  return { mountA, inner: along(barrel), seal: along(span - barrel), mountB };
}

function contextFor(
  cylinders: Cylinder[],
  joints: Joint[],
  frozen?: (id: string) => boolean
): EditContext {
  return {
    cylinders,
    snapshot: snapshotOf(joints),
    tolerance: 1e-6,
    layoutFor: keepingLength,
    frozen,
    // The service says the reader's names (`MechanismService.bodyLabel`); these
    // are the ids, which is all a graph built by hand has and is enough to
    // check that every sentence went through the namer.
    names: {
      body: (body) => `Link ${body.id}`,
      cylinder: (one) => `Cylinder ${one.mountA.id}${one.mountB.id}`,
      joint: (id) => id,
    },
  };
}

/** Turn the whole ram by `theta` about `pivot`, as `rotateCylinder` does. */
function turnedPose(cylinder: Cylinder, pivot: Point, theta: number): CylinderPose {
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const turn = (point: Point) => ({
    x: pivot.x + (point.x - pivot.x) * cos - (point.y - pivot.y) * sin,
    y: pivot.y + (point.x - pivot.x) * sin + (point.y - pivot.y) * cos,
  });
  return {
    mountA: turn(cylinder.mountA),
    inner: turn(cylinder.inner),
    seal: turn(cylinder.seal),
    mountB: turn(cylinder.mountB),
  };
}

/** Slide the whole ram along x without turning or resizing it. */
function slidPose(cylinder: Cylinder, by: number): CylinderPose {
  const moved = (point: Point) => ({ x: point.x + by, y: point.y });
  return {
    mountA: moved(cylinder.mountA),
    inner: moved(cylinder.inner),
    seal: moved(cylinder.seal),
    mountB: moved(cylinder.mountB),
  };
}

/**
 * The gesture `dragCylinder` and `rotateCylinder` make: the reader has the
 * whole assembly in hand, so everything welded to it comes along (S21).
 */
function bodyDrag(cylinder: Cylinder, pose: CylinderPose): EditRequest {
  return { poses: [{ cylinder, pose, motion: 'body' }] };
}

/** Every other gesture: the part is placed, and its neighbors are not carried. */
function rePose(cylinder: Cylinder, pose: CylinderPose): EditRequest {
  return { poses: [{ cylinder, pose }] };
}

describe('planning where a cylinder’s pose puts everything', () => {
  it('moves only the four joints the ram is made of, when nothing is attached', () => {
    const parts = ram();
    const [cylinder] = cylindersIn(parts.joints);
    const result = planEdit(
      bodyDrag(cylinder, slidPose(cylinder, 3)),
      contextFor([cylinder], parts.joints)
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect([...result.plan.movedIds].sort()).toEqual(['A', 'B', 'C', 'D']);
    expect(result.plan.placements.get('A')).toEqual({ x: 3, y: 0 });
    expect(result.plan.placements.get('D')).toEqual({ x: 13, y: 0 });
    // The pin is the slider. There used to be a fifth joint here, coincident
    // with C, and a rule that the plan had to place the two of them together;
    // one joint cannot be moved away from itself.
    expect(result.plan.placements.get('C')).toEqual({ x: cylinder.seal.x + 3, y: cylinder.seal.y });
  });

  it('carries a welded bracket with the side it is welded to, under a body drag', () => {
    const parts = ram();
    weldBracketOnto(parts, parts.mountA, parts.barrel, 'AX', { x: -3, y: 4 });
    const [cylinder] = cylindersIn(parts.joints);

    const result = planEdit(
      bodyDrag(cylinder, slidPose(cylinder, 3)),
      contextFor([cylinder], parts.joints)
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The joint the old five-coordinate write left standing still.
    expect(result.plan.placements.get('AXfar')).toEqual({ x: 0, y: 4 });
    expect(result.plan.affectedRoots.map((one) => one.id)).toContain('ABAX');
    // And carried, not reshaped: a bracket keeps its own geometry.
    expect(result.plan.carried.map(({ leaf }) => leaf.id)).toContain('AX');
    expect(result.plan.reshaped).toHaveLength(0);
  });

  it('leaves that same bracket alone when the part is only re-posed', () => {
    // S21. The reader is not holding the body, so the body is not carried: the
    // cylinder's own end joint moves and the bracket welded to it changes
    // shape, the way a compound does when one of its joints is dragged.
    const parts = ram();
    weldBracketOnto(parts, parts.mountA, parts.barrel, 'AX', { x: -3, y: 4 });
    const [cylinder] = cylindersIn(parts.joints);
    const was = { x: parts.joints.find((one) => one.id === 'AXfar')!.x, y: 4 };

    const result = planEdit(
      rePose(cylinder, slidPose(cylinder, 3)),
      contextFor([cylinder], parts.joints)
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.movedIds.has('AXfar')).toBe(false);
    expect(result.plan.placements.get('AXfar') ?? was).toEqual(was);
    // Nothing claimed a rigid carry, so nothing is judged as one.
    expect(result.plan.affectedRoots).toHaveLength(0);
    // The barrel is still the barrel: a bar that moved rigidly, whose own load
    // and hand-placed center go through that motion and no other.
    expect(result.plan.carried.map(({ leaf }) => leaf.id).sort()).toEqual(['AB', 'CD']);
  });

  it('turns a bracket about its own end joint when a body drag rotates that side', () => {
    const parts = ram();
    weldBracketOnto(parts, parts.mountA, parts.barrel, 'AX', { x: 0, y: 2 });
    const [cylinder] = cylindersIn(parts.joints);

    const result = planEdit(
      bodyDrag(cylinder, turnedPose(cylinder, { x: 0, y: 0 }, Math.PI / 2)),
      contextFor([cylinder], parts.joints)
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const far = result.plan.placements.get('AXfar')!;
    expect(far.x).toBeCloseTo(-2, 9);
    expect(far.y).toBeCloseTo(0, 9);
  });

  it('leaves the bracket where it is when the same turn is a re-pose', () => {
    // The maintainer's first report, in miniature: a typed Angle turns the
    // cylinder about its own joint and must not swing the bar welded to it.
    const parts = ram();
    weldBracketOnto(parts, parts.mountA, parts.barrel, 'AX', { x: 0, y: 2 });
    const [cylinder] = cylindersIn(parts.joints);

    const result = planEdit(
      rePose(cylinder, turnedPose(cylinder, { x: 0, y: 0 }, Math.PI / 2)),
      contextFor([cylinder], parts.joints)
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.movedIds.has('AXfar')).toBe(false);
    // And the part itself went where it was put.
    expect(result.plan.placements.get('D')!.x).toBeCloseTo(0, 9);
    expect(result.plan.placements.get('D')!.y).toBeCloseTo(10, 9);
  });

  it('needs no second pass to keep a sliding mount with the part', () => {
    // A grounded block bolted to a mount used to be a *separate link* holding a
    // second joint coincident with that mount, which nothing in the cylinder's
    // own bodies reached -- so the plan carried a pass of its own (`settleBlocks`)
    // to move the partner, and a grounded one could not be put back afterwards
    // by the reseat, which only repairs floating sliders.
    //
    // A slider is one joint now (Stage 1 of
    // `docs/joint-type-and-cylinder-plan.md`). A mount that slides *is* the
    // mount, so it travels because the mount does, and the pass is gone rather
    // than fixed.
    const parts = ram();
    const [cylinder] = cylindersIn(parts.joints);
    const result = planEdit(
      bodyDrag(cylinder, slidPose(cylinder, 3)),
      contextFor([cylinder], parts.joints)
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.placements.get('A')).toEqual({ x: 3, y: 0 });
  });
});

describe('what a lock over a cylinder actually holds', () => {
  it('allows a rotation about a locked mount, which does not move it', () => {
    // Every pose names both mounts, so a locked pivot appears in every plan.
    // Refusing on that alone froze the ram solid: turning it about the locked
    // mount is the one motion a lock there is meant to leave available.
    const parts = ram();
    const [cylinder] = cylindersIn(parts.joints);

    const result = planEdit(
      bodyDrag(cylinder, turnedPose(cylinder, { x: 0, y: 0 }, Math.PI / 2)),
      contextFor([cylinder], parts.joints, (id) => id === 'A')
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.placements.get('A')!.x).toBeCloseTo(0, 9);
    expect(result.plan.placements.get('A')!.y).toBeCloseTo(0, 9);
    const rodFar = result.plan.placements.get('D')!;
    expect(rodFar.x).toBeCloseTo(0, 9);
    expect(rodFar.y).toBeCloseTo(10, 9);
  });

  it('allows it about the other mount too', () => {
    const parts = ram();
    const [cylinder] = cylindersIn(parts.joints);
    const result = planEdit(
      bodyDrag(cylinder, turnedPose(cylinder, { x: 10, y: 0 }, -Math.PI / 2)),
      contextFor([cylinder], parts.joints, (id) => id === 'D')
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.placements.get('D')!.x).toBeCloseTo(10, 9);
    expect(result.plan.placements.get('D')!.y).toBeCloseTo(0, 9);
  });

  it('allows an extension that leaves the locked anchor where it is', () => {
    const parts = ram();
    const [cylinder] = cylindersIn(parts.joints);
    const stretched = keepingLength(cylinder, { x: 0, y: 0 }, { x: 12, y: 0 });

    const result = planEdit(
      rePose(cylinder, stretched),
      contextFor([cylinder], parts.joints, (id) => id === 'A')
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.placements.get('D')).toEqual({ x: 12, y: 0 });
  });

  it('says nothing about a proposal that moves nothing', () => {
    const parts = ram();
    const [cylinder] = cylindersIn(parts.joints);
    const result = planEdit(
      bodyDrag(cylinder, slidPose(cylinder, 0)),
      contextFor([cylinder], parts.joints, () => true)
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.movedIds.size).toBe(0);
  });

  it('refuses a body drag when something carried really is displaced', () => {
    const parts = ram();
    weldBracketOnto(parts, parts.mountA, parts.barrel, 'AX', { x: -3, y: 4 });
    const [cylinder] = cylindersIn(parts.joints);

    const result = planEdit(
      bodyDrag(cylinder, slidPose(cylinder, 3)),
      // A lock out on the bracket, on none of the cylinder's own four.
      contextFor([cylinder], parts.joints, (id) => id === 'AXfar')
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.code).toBe('cylinder.pose-locked');
  });

  it('says nothing about that lock when the part is only re-posed', () => {
    // S21: the bracket is not carried, so the locked joint does not move, so
    // the Lock has nothing to hold against. A mark out on a bracket used to
    // freeze the cylinder it was welded to solid.
    const parts = ram();
    weldBracketOnto(parts, parts.mountA, parts.barrel, 'AX', { x: -3, y: 4 });
    const [cylinder] = cylindersIn(parts.joints);

    const result = planEdit(
      rePose(cylinder, slidPose(cylinder, 3)),
      contextFor([cylinder], parts.joints, (id) => id === 'AXfar')
    );

    expect(result.ok ? 'ok' : result.refusal.code).toBe('ok');
    if (!result.ok) return;
    expect(result.plan.movedIds.has('AXfar')).toBe(false);
  });
});

describe('a ram whose two ends are welded into one body', () => {
  /** Barrel and rod as two leaves of one compound, which is what a weld leaves. */
  function fusedRam() {
    const parts = ram();
    const fused = new RealLink(
      'ABCD',
      [parts.mountA, parts.inner, parts.seal, parts.mountB],
      undefined,
      undefined,
      undefined,
      [parts.barrel, parts.rod]
    );
    parts.links = parts.links.filter((link) => link.id !== 'AB' && link.id !== 'CD');
    parts.links.push(fused);
    rewire(parts.joints, parts.links);
    return parts;
  }

  it('is still a ram, because its slot is cut in the barrel and not in the body', () => {
    // The compound holds the sliding joint, and for a while that was enough to
    // rule the slot out: `isSlotWellFormed` asked the *carrier*, the carrier is
    // a root, and a rod welded in beside the barrel puts the seal inside it.
    // `reconcileSlots` answered by detaching a bore nothing can invent back, so
    // welding a ram's two ends together took the ram away for good and left a
    // drawing whose own URL the decoder refuses. The question is asked of the
    // bar the slot is cut in now, and a barrel never holds the seal.
    const parts = fusedRam();

    expect(parts.seal.carrier?.id, 'the slot is lifted to the compound').toBe('ABCD');
    expect(parts.seal.isSlotWellFormed).toBe(true);
    const [cylinder] = cylindersIn(parts.joints);
    expect(cylinder).toBeDefined();
    expect(cylinder.barrelRoot.id).toBe('ABCD');
    expect(cylinder.rodRoot.id).toBe('ABCD');
  });

  it('moves as one piece under a body drag', () => {
    const parts = fusedRam();
    const [cylinder] = cylindersIn(parts.joints);
    const context = contextFor([cylinder], parts.joints);

    const moved = planEdit(bodyDrag(cylinder, slidPose(cylinder, 3)), context);
    expect(moved.ok ? 'ok' : moved.refusal.code).toBe('ok');
    if (!moved.ok) return;
    expect(moved.plan.placements.get('A')).toEqual({ x: 3, y: 0 });
    expect(moved.plan.placements.get('D')).toEqual({ x: 13, y: 0 });
  });

  it('now takes a length, and the body changes shape to let it', () => {
    // It used to be refused here (`cylinder.both-ends-fused`), on the reading
    // that the distance between two points of a rigid body is not a number an
    // edit gets to choose. S21 says it is: the reader is drawing, and dragging
    // a corner of a welded triangle changes the triangle. What this drawing
    // still cannot do is *simulate*, which readiness says rather than the
    // editor forbidding the edit.
    const parts = fusedRam();
    const [cylinder] = cylindersIn(parts.joints);
    const context = contextFor([cylinder], parts.joints);

    const stretched = planEdit(
      rePose(cylinder, keepingLength(cylinder, { x: 0, y: 0 }, { x: 13, y: 0 })),
      context
    );

    expect(stretched.ok ? 'ok' : stretched.refusal.code).toBe('ok');
    if (!stretched.ok) return;
    expect(stretched.plan.placements.get('D')).toEqual({ x: 13, y: 0 });
    expect(stretched.plan.placements.get('A')).toEqual({ x: 0, y: 0 });
  });

  it('is still refused a body drag that is not a rigid motion', () => {
    // The one shape refusal left, and the promise `motion: 'body'` makes: a
    // body drag picks the whole assembly up, so every bar welded into it
    // arrives in the shape it started in. `dragCylinder` and `rotateCylinder`
    // only ever build a translation and a rotation, so this is a backstop on
    // the contract rather than a gesture a reader can make.
    const parts = fusedRam();
    const [cylinder] = cylindersIn(parts.joints);

    const torn = planEdit(
      bodyDrag(cylinder, keepingLength(cylinder, { x: 0, y: 0 }, { x: 13, y: 0 })),
      contextFor([cylinder], parts.joints)
    );

    expect(torn.ok).toBe(false);
    if (torn.ok) return;
    expect(torn.refusal.code).toBe('cylinder.pose-conflict');
    expect(torn.refusal.long).toContain('would change the shape of');
    expect(torn.refusal.long).toMatch(/Set joint \S+ to Revolute/);
  });
});

describe('planning what one ram’s motion reaches', () => {
  /**
   * Three rams. The first's barrel body carries the second's and third's
   * barrel mounts; the second's rod body carries the third's rod mount. So the
   * third is laid out twice: once when its first mount moves, and again once
   * its second one does.
   */
  function chain() {
    const first = ram('1');
    const second = ram('2');
    const third = ram('3');
    [second, third].forEach((one, index) =>
      one.joints.forEach((joint) => {
        joint.y += 20 * (index + 1);
      })
    );

    const spine = new RealLink('spine', [first.mountA, second.mountA, third.mountA]);
    const barrelBody = new RealLink(
      'A1B1spine',
      [...first.barrel.joints, second.mountA, third.mountA],
      undefined,
      undefined,
      undefined,
      [first.barrel, spine]
    );
    // The third ram's *other* mount hangs off the first ram's rod body, so its
    // two ends are moved by two different bodies -- which is the case a
    // one-shot layout gets wrong, because it runs on whichever moved first.
    const tie = new RealLink('tie', [first.mountB, third.mountB]);
    const rodBody = new RealLink(
      'C1D1tie',
      [...first.rod.joints, third.mountB],
      undefined,
      undefined,
      undefined,
      [first.rod, tie]
    );
    first.mountA.isWelded = true;
    first.mountB.isWelded = true;

    const joints = [...first.joints, ...second.joints, ...third.joints];
    const links = [
      ...first.links.filter((link) => link.id !== first.barrel.id && link.id !== first.rod.id),
      ...second.links,
      ...third.links,
      barrelBody,
      rodBody,
    ];
    rewire(joints, links);
    const cylinders = cylindersIn(joints);
    expect(cylinders).toHaveLength(3);
    return { joints, cylinders };
  }

  it('settles a chain of three rather than running a stale layout', () => {
    // The third ram's pose was computed the moment its first mount moved, and
    // then run unchanged after its second one moved too -- so a compatible
    // translation came out as parts disagreeing.
    const { joints, cylinders } = chain();
    const target = cylinders.find((one) => one.mountA.id === 'A1')!;

    const result = planEdit(bodyDrag(target, slidPose(target, 2)), contextFor(cylinders, joints));

    expect(result.ok ? 'ok' : result.refusal.code).toBe('ok');
    if (!result.ok) return;
    // Everything the spine and the tie hold moved by the same two units --
    // including the third ram, whose two mounts are carried by two different
    // bodies and which therefore translates rather than stretching.
    const was: Record<string, number> = { A1: 0, A2: 0, A3: 0, D1: 10, D3: 10 };
    for (const id of Object.keys(was)) {
      expect(result.plan.placements.get(id)!.x).toBeCloseTo(was[id] + 2, 6);
    }
    // The second ram has only one end carried, so it stretches: its far mount
    // stays exactly where it was.
    expect(result.plan.placements.get('D2')?.x ?? 10).toBeCloseTo(10, 6);
  });

  it('gives the same answer whichever ram the list happens to start with', () => {
    const forward = chain();
    const backward = chain();
    const pick = (made: ReturnType<typeof chain>) =>
      made.cylinders.find((one) => one.mountA.id === 'A1')!;

    const a = planEdit(
      bodyDrag(pick(forward), slidPose(pick(forward), 2)),
      contextFor(forward.cylinders, forward.joints)
    );
    const b = planEdit(
      bodyDrag(pick(backward), slidPose(pick(backward), 2)),
      contextFor([...backward.cylinders].reverse(), backward.joints)
    );

    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    for (const id of ['A1', 'A2', 'A3', 'D1', 'D2', 'D3']) {
      expect(b.plan.placements.get(id)!.x).toBeCloseTo(a.plan.placements.get(id)!.x, 6);
      expect(b.plan.placements.get(id)!.y).toBeCloseTo(a.plan.placements.get(id)!.y, 6);
    }
  });
});

describe('an edit that starts somewhere else', () => {
  /** A ram with an arm pinned to its barrel mount, for a drag to start on. */
  function ramAndArm() {
    const parts = ram();
    const far = new RevJoint('N', -4, 0);
    const arm = new RealLink('AN', [parts.mountA, far]);
    parts.joints.push(far);
    parts.links.push(arm);
    rewire(parts.joints, parts.links);
    const [cylinder] = cylindersIn(parts.joints);
    expect(cylinder).toBeDefined();
    return { parts, cylinder };
  }

  /** The same, with a bracket welded to the far mount carrying a witness point. */
  function ramArmAndBracket() {
    const { parts } = ramAndArm();
    weldBracketOnto(parts, parts.mountB, parts.rod, 'DW', { x: 13, y: 4 });
    const [cylinder] = cylindersIn(parts.joints);
    expect(cylinder).toBeDefined();
    return { parts, cylinder };
  }

  it('plans the gesture’s own moves and the ram’s together', () => {
    const { parts, cylinder } = ramAndArm();
    const moves = new Map<string, Point>([
      ['A', { x: 0, y: 1 }],
      ['N', { x: -4, y: 1 }],
    ]);
    const result = planEdit({ moves }, contextFor([cylinder], parts.joints));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The ram followed its moved mount rather than being left bent.
    expect(result.plan.placements.get('A')).toEqual({ x: 0, y: 1 });
    expect(result.plan.movedIds.has('C')).toBe(true);
  });

  it('is not stopped by a Lock out on a bracket the part no longer carries', () => {
    // This used to be refused: the cylinder had to turn to follow its moved end
    // joint, the bracket welded to its far end turned with it, and the Lock out
    // on that bracket held the whole gesture. Under S21 the bracket is not
    // carried, the locked point does not move, and the drag goes through.
    const { parts, cylinder } = ramArmAndBracket();
    const moves = new Map<string, Point>([
      ['A', { x: 0, y: 1 }],
      ['N', { x: -4, y: 1 }],
    ]);
    const result = planEdit(
      { moves },
      contextFor([cylinder], parts.joints, (id) => id === 'DWfar')
    );

    expect(result.ok ? 'ok' : result.refusal.code).toBe('ok');
    if (!result.ok) return;
    expect(result.plan.movedIds.has('DWfar')).toBe(false);
    expect(result.plan.placements.get('A')).toEqual({ x: 0, y: 1 });
  });

  it('refuses the whole gesture, and places nothing, when a lock does bite', () => {
    // The finding this file is named for: the drag used to be written first and
    // the cylinder's refusal discovered afterwards, leaving the arm moved and
    // no way back. Nothing is placed anywhere unless all of it can be — so the
    // lock goes on a joint the plan really does have to move, the end joint the
    // arm is pinned to.
    const { parts, cylinder } = ramArmAndBracket();
    const moves = new Map<string, Point>([
      ['A', { x: 0, y: 1 }],
      ['N', { x: -4, y: 1 }],
    ]);
    const result = planEdit(
      { moves },
      contextFor([cylinder], parts.joints, (id) => id === 'A')
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.code).toBe('cylinder.pose-locked');
  });
});

describe('what the gesture asked for is a constraint, not a suggestion', () => {
  /** A ram with a bracket welded to its barrel mount, and the bracket's far end. */
  function ramAndBracket() {
    const parts = ram();
    weldBracketOnto(parts, parts.mountA, parts.barrel, 'AX', { x: -3, y: 4 });
    const [cylinder] = cylindersIn(parts.joints);
    expect(cylinder).toBeDefined();
    return { parts, cylinder };
  }

  it('never places a requested joint somewhere else', () => {
    // Translating the bracket asks A and its far end to move together. The ram
    // then wants to swing about its own far mount, which would take the
    // bracket round with it -- so the two answers for one joint disagree. The
    // plan used to take the ram's and commit it, quietly turning a body the
    // gesture had asked to translate.
    const { parts, cylinder } = ramAndBracket();
    const moves = new Map<string, Point>([
      ['A', { x: 0, y: 2 }],
      ['AXfar', { x: -3, y: 6 }],
    ]);
    const result = planEdit({ moves }, contextFor([cylinder], parts.joints));

    if (result.ok) {
      // Whatever else it does, it does what was asked.
      expect(result.plan.placements.get('A')).toEqual({ x: 0, y: 2 });
      expect(result.plan.placements.get('AXfar')).toEqual({ x: -3, y: 6 });
    } else {
      expect(result.refusal.code).toBe('cylinder.pose-conflict');
    }
  });

  it('honors a request the ram can actually follow', () => {
    // The same body, moved along the ram's own axis: the barrel does not have
    // to turn, so the request and the consequence agree and it goes through.
    const { parts, cylinder } = ramAndBracket();
    const moves = new Map<string, Point>([
      ['A', { x: -1, y: 0 }],
      ['AXfar', { x: -4, y: 4 }],
    ]);
    const result = planEdit({ moves }, contextFor([cylinder], parts.joints));

    expect(result.ok ? 'ok' : result.refusal.code).toBe('ok');
    if (!result.ok) return;
    expect(result.plan.placements.get('A')).toEqual({ x: -1, y: 0 });
    expect(result.plan.placements.get('AXfar')).toEqual({ x: -4, y: 4 });
  });
});

describe('an asymmetric body carried through a turn', () => {
  it('lands exactly where one orientation-preserving transform puts it', () => {
    // The check behind this fits a single rotation from a body's two furthest
    // points and requires every other point to follow it, rather than
    // comparing pairwise distances -- which a *mirror* preserves just as well
    // as a turn. Nothing in the layout path can produce a mirrored body today,
    // so this is the positive half of that contract: a scalene bracket, turned
    // a quarter, with no two points that could be swapped for each other.
    const parts = ram();
    const { compound } = weldBracketOnto(parts, parts.mountA, parts.barrel, 'AX', {
      x: -3,
      y: 4,
    });
    // A third, off-axis point on the same body, so the triangle is scalene.
    const spur = new RevJoint('S', -5, 1);
    const spurBar = new RealLink('AS', [parts.mountA, spur]);
    const wider = new RealLink(
      'ABAXS',
      [...compound.joints, spur],
      undefined,
      undefined,
      undefined,
      [compound, spurBar]
    );
    parts.joints.push(spur);
    parts.links = parts.links.filter((link) => link.id !== compound.id);
    parts.links.push(wider);
    rewire(parts.joints, parts.links);

    const [cylinder] = cylindersIn(parts.joints);
    expect(cylinder.barrelRoot.id).toBe('ABAXS');

    const result = planEdit(
      bodyDrag(cylinder, turnedPose(cylinder, { x: 0, y: 0 }, Math.PI / 2)),
      contextFor([cylinder], parts.joints)
    );

    expect(result.ok ? 'ok' : result.refusal.code).toBe('ok');
    if (!result.ok) return;
    // A quarter turn about the origin sends (x, y) to (-y, x). Both points,
    // and not merely the distance between them.
    const bracket = result.plan.placements.get('AXfar')!;
    expect(bracket.x).toBeCloseTo(-4, 9);
    expect(bracket.y).toBeCloseTo(-3, 9);
    const tip = result.plan.placements.get('S')!;
    expect(tip.x).toBeCloseTo(-1, 9);
    expect(tip.y).toBeCloseTo(-5, 9);
  });
});

describe('the order the cylinders happen to be listed in', () => {
  /**
   * A chain of `count` cylinders, each one's rod welded through a tie to the
   * next one's barrel, so one body drag at the head has to walk the whole line.
   *
   * The next barrel is a **leaf of that welded body**, which is what the app's
   * own weld leaves behind and what makes the walk happen at all: a cylinder
   * rides a body motion when its barrel is inside the body being carried
   * (`ridingOn`), and re-lays itself when it is merely pinned to one. Tied to a
   * body it is not part of, the chain stops at the first cylinder — correctly,
   * under S21 — and this says nothing about the order the list is in.
   */
  function longChain(count: number) {
    const rams = Array.from({ length: count }, (_, index) => {
      const one = ram(String(index));
      one.joints.forEach((joint) => {
        joint.y += 20 * index;
      });
      return one;
    });

    const joints = rams.flatMap((one) => one.joints);
    const links = rams.flatMap((one) => one.links);
    for (let index = 0; index + 1 < count; index++) {
      const rod = rams[index].rod;
      const nextBarrel = rams[index + 1].barrel;
      const nextMount = rams[index + 1].mountA;
      const tie = new RealLink(`tie${index}`, [rams[index].mountB, nextMount]);
      const body = new RealLink(
        `body${index}`,
        [...rod.joints, ...nextBarrel.joints],
        undefined,
        undefined,
        undefined,
        [rod, tie, nextBarrel]
      );
      rams[index].mountB.isWelded = true;
      nextMount.isWelded = true;
      // The compound replaces both bars at the top level; the tie lives inside
      // it as a subset leaf, which is what a weld leaves behind.
      links.splice(links.indexOf(rod), 1, body);
      links.splice(links.indexOf(nextBarrel), 1);
    }
    rewire(joints, links);
    const cylinders = cylindersIn(joints);
    expect(cylinders).toHaveLength(count);
    return { joints, cylinders, rams };
  }

  it('does not decide whether a long chain can move', () => {
    // Revisiting a cylinder only when one of its end joints moves settles a
    // chain in a single pass however it is enumerated. Sweeping the whole list
    // in a fixed order carried one link of a reversed chain per round, and gave
    // up on a long one -- calling an ordinary translation a conflict.
    const COUNT = 26;
    const forward = longChain(COUNT);
    const backward = longChain(COUNT);
    const head = (made: ReturnType<typeof longChain>) =>
      made.cylinders.find((one) => one.mountA.id === 'A0')!;

    const a = planEdit(
      bodyDrag(head(forward), slidPose(head(forward), 2)),
      contextFor(forward.cylinders, forward.joints)
    );
    const b = planEdit(
      bodyDrag(head(backward), slidPose(head(backward), 2)),
      contextFor([...backward.cylinders].reverse(), backward.joints)
    );

    expect(a.ok ? 'ok' : a.refusal.code).toBe('ok');
    expect(b.ok ? 'ok' : b.refusal.code).toBe('ok');
    if (!a.ok || !b.ok) return;
    // And the same answer, joint for joint, at the far end of the chain.
    for (const id of [`A${COUNT - 1}`, `D${COUNT - 1}`]) {
      expect(b.plan.placements.get(id)!.x).toBeCloseTo(a.plan.placements.get(id)!.x, 6);
      expect(b.plan.placements.get(id)!.y).toBeCloseTo(a.plan.placements.get(id)!.y, 6);
    }
  });
});
