import { PrisJoint, RevJoint } from './joint';
import { RealLink, SliderBlock } from './link';
import { ram, rewire, weldBracketOnto } from '../../test-utils/cylinder-graph';
import { Cylinder, CylinderPose, sealedCylinderStructures } from './cylinder';
import { EditContext, Point, planEdit, snapshotOf } from './cylinder-pose-plan';
import { Joint } from './joint';

/**
 * What moves when an edit touches a ram, once its mounts can be welded and can
 * carry blocks of their own.
 *
 * Writing the cylinder's own five coordinates is right exactly as long as
 * those five are all that is rigid with it. A bracket welded to a mount is
 * rigid with that side of the ram; a block bolted to a mount is coincident
 * with it. Moving the bar without them does not deform the drawing, it tears
 * it, and the rebuild afterwards reads the wreckage as a link that changed
 * shape.
 *
 * The claims worth making are about the settled result rather than about the
 * order the walk visited things in: each side carried by its own mount's
 * motion, the closure reaching a chain of rams, a lock refusing actual
 * displacement rather than mere mention, and a body that would have to change
 * shape refusing the edit while the same body merely moving does not.
 */

/** Lay a carried ram out along its new axis, keeping the length it was drawn at. */
function keepingLength(cylinder: Cylinder, barrelFar: Point, rodFar: Point): CylinderPose {
  const span = Math.hypot(rodFar.x - barrelFar.x, rodFar.y - barrelFar.y);
  const barrel = Math.hypot(
    cylinder.barrelNear.x - cylinder.barrelFar.x,
    cylinder.barrelNear.y - cylinder.barrelFar.y
  );
  const along = (distance: number) => ({
    x: barrelFar.x + ((rodFar.x - barrelFar.x) * distance) / span,
    y: barrelFar.y + ((rodFar.y - barrelFar.y) * distance) / span,
  });
  return { barrelFar, barrelNear: along(barrel), pin: along(span - barrel), rodFar };
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
    barrelFar: turn(cylinder.barrelFar),
    barrelNear: turn(cylinder.barrelNear),
    pin: turn(cylinder.pin),
    rodFar: turn(cylinder.rodFar),
  };
}

/** Slide the whole ram along x without turning or resizing it. */
function slidPose(cylinder: Cylinder, by: number): CylinderPose {
  const moved = (point: Point) => ({ x: point.x + by, y: point.y });
  return {
    barrelFar: moved(cylinder.barrelFar),
    barrelNear: moved(cylinder.barrelNear),
    pin: moved(cylinder.pin),
    rodFar: moved(cylinder.rodFar),
  };
}

describe('planning where a cylinder’s pose puts everything', () => {
  it('moves only the five joints when nothing is attached to it', () => {
    const parts = ram();
    const [cylinder] = sealedCylinderStructures(parts.joints);
    const result = planEdit(
      { poses: [{ cylinder, pose: slidPose(cylinder, 3) }] },
      contextFor([cylinder], parts.joints)
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect([...result.plan.movedIds].sort()).toEqual(['A', 'B', 'C', 'D', 'P']);
    expect(result.plan.placements.get('A')).toEqual({ x: 3, y: 0 });
    expect(result.plan.placements.get('D')).toEqual({ x: 13, y: 0 });
    // The slider rides the pin, always.
    expect(result.plan.placements.get('P')).toEqual(result.plan.placements.get('C'));
  });

  it('carries a welded bracket with the side it is welded to', () => {
    const parts = ram();
    weldBracketOnto(parts, parts.barrelFar, parts.barrel, 'AX', { x: -3, y: 4 });
    const [cylinder] = sealedCylinderStructures(parts.joints);

    const result = planEdit(
      { poses: [{ cylinder, pose: slidPose(cylinder, 3) }] },
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

  it('turns a bracket about its own mount when that side rotates', () => {
    const parts = ram();
    weldBracketOnto(parts, parts.barrelFar, parts.barrel, 'AX', { x: 0, y: 2 });
    const [cylinder] = sealedCylinderStructures(parts.joints);

    const result = planEdit(
      { poses: [{ cylinder, pose: turnedPose(cylinder, { x: 0, y: 0 }, Math.PI / 2) }] },
      contextFor([cylinder], parts.joints)
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const far = result.plan.placements.get('AXfar')!;
    expect(far.x).toBeCloseTo(-2, 9);
    expect(far.y).toBeCloseTo(0, 9);
  });

  it('takes a block bolted to a mount along with it', () => {
    // An external block is a separate link, so nothing in the cylinder's own
    // bodies reaches it. Left behind it stops being coincident with the pin it
    // rides -- and a *grounded* one cannot be put back by the reseat that runs
    // after a commit, because that only repairs floating sliders.
    const parts = ram();
    const guide = new PrisJoint('Q', 0, 0);
    const block = new SliderBlock('AQ', [parts.barrelFar, guide]);
    guide.ground = true;
    parts.joints.push(guide);
    parts.links.push(block);
    rewire(parts.joints, parts.links);

    const [cylinder] = sealedCylinderStructures(parts.joints);
    const result = planEdit(
      { poses: [{ cylinder, pose: slidPose(cylinder, 3) }] },
      contextFor([cylinder], parts.joints)
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.placements.get('Q')).toEqual({ x: 3, y: 0 });
    expect(result.plan.placements.get('Q')).toEqual(result.plan.placements.get('A'));
  });
});

describe('what a lock over a cylinder actually holds', () => {
  it('allows a rotation about a locked mount, which does not move it', () => {
    // Every pose names both mounts, so a locked pivot appears in every plan.
    // Refusing on that alone froze the ram solid: turning it about the locked
    // mount is the one motion a lock there is meant to leave available.
    const parts = ram();
    const [cylinder] = sealedCylinderStructures(parts.joints);

    const result = planEdit(
      { poses: [{ cylinder, pose: turnedPose(cylinder, { x: 0, y: 0 }, Math.PI / 2) }] },
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
    const [cylinder] = sealedCylinderStructures(parts.joints);
    const result = planEdit(
      { poses: [{ cylinder, pose: turnedPose(cylinder, { x: 10, y: 0 }, -Math.PI / 2) }] },
      contextFor([cylinder], parts.joints, (id) => id === 'D')
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.placements.get('D')!.x).toBeCloseTo(10, 9);
    expect(result.plan.placements.get('D')!.y).toBeCloseTo(0, 9);
  });

  it('allows an extension that leaves the locked anchor where it is', () => {
    const parts = ram();
    const [cylinder] = sealedCylinderStructures(parts.joints);
    const stretched = keepingLength(cylinder, { x: 0, y: 0 }, { x: 12, y: 0 });

    const result = planEdit(
      { poses: [{ cylinder, pose: stretched }] },
      contextFor([cylinder], parts.joints, (id) => id === 'A')
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.placements.get('D')).toEqual({ x: 12, y: 0 });
  });

  it('says nothing about a proposal that moves nothing', () => {
    const parts = ram();
    const [cylinder] = sealedCylinderStructures(parts.joints);
    const result = planEdit(
      { poses: [{ cylinder, pose: slidPose(cylinder, 0) }] },
      contextFor([cylinder], parts.joints, () => true)
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.movedIds.size).toBe(0);
  });

  it('refuses when something carried really is displaced', () => {
    const parts = ram();
    weldBracketOnto(parts, parts.barrelFar, parts.barrel, 'AX', { x: -3, y: 4 });
    const [cylinder] = sealedCylinderStructures(parts.joints);

    const result = planEdit(
      { poses: [{ cylinder, pose: slidPose(cylinder, 3) }] },
      // A lock out on the bracket, on none of the ram's own five.
      contextFor([cylinder], parts.joints, (id) => id === 'AXfar')
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.code).toBe('cylinder.pose-locked');
  });
});

describe('a ram whose two ends share one body', () => {
  /** Barrel and rod welded into one compound, still recognized as a ram. */
  function fusedRam() {
    const parts = ram();
    const fused = new RealLink(
      'ABCD',
      [parts.barrelFar, parts.barrelNear, parts.pin, parts.rodFar],
      undefined,
      undefined,
      undefined,
      [parts.barrel, parts.rod]
    );
    parts.links = parts.links.filter((link) => link.id !== 'AB' && link.id !== 'CD');
    parts.links.push(fused);
    rewire(parts.joints, parts.links);
    const [cylinder] = sealedCylinderStructures(parts.joints);
    // Asserted, not skipped: a test that quietly returns when its fixture
    // fails to resolve proves nothing about the behavior it is named for.
    expect(cylinder).toBeDefined();
    expect(cylinder.barrelRoot.id).toBe('ABCD');
    expect(cylinder.rodRoot.id).toBe('ABCD');
    return { parts, cylinder };
  }

  it('may still be moved as one piece', () => {
    // Nothing about sharing a body forbids translating it. Refusing on root
    // equality alone turned an ordinary drag away.
    const { parts, cylinder } = fusedRam();
    const result = planEdit(
      { poses: [{ cylinder, pose: slidPose(cylinder, 2) }] },
      contextFor([cylinder], parts.joints)
    );

    expect(result.ok ? 'ok' : result.refusal.code).toBe('ok');
    if (!result.ok) return;
    expect(result.plan.placements.get('A')).toEqual({ x: 2, y: 0 });
    expect(result.plan.placements.get('D')).toEqual({ x: 12, y: 0 });
  });

  it('but may not extend, because that is a rigid body changing shape', () => {
    const { parts, cylinder } = fusedRam();
    const stretched = keepingLength(cylinder, { x: 0, y: 0 }, { x: 14, y: 0 });
    const result = planEdit(
      { poses: [{ cylinder, pose: stretched }] },
      contextFor([cylinder], parts.joints)
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.code).toBe('cylinder.both-ends-fused');
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

    const spine = new RealLink('spine', [first.barrelFar, second.barrelFar, third.barrelFar]);
    const barrelBody = new RealLink(
      'A1B1spine',
      [...first.barrel.joints, second.barrelFar, third.barrelFar],
      undefined,
      undefined,
      undefined,
      [first.barrel, spine]
    );
    // The third ram's *other* mount hangs off the first ram's rod body, so its
    // two ends are moved by two different bodies -- which is the case a
    // one-shot layout gets wrong, because it runs on whichever moved first.
    const tie = new RealLink('tie', [first.rodFar, third.rodFar]);
    const rodBody = new RealLink(
      'C1D1tie',
      [...first.rod.joints, third.rodFar],
      undefined,
      undefined,
      undefined,
      [first.rod, tie]
    );
    first.barrelFar.isWelded = true;
    first.rodFar.isWelded = true;

    const joints = [...first.joints, ...second.joints, ...third.joints];
    const links = [
      ...first.links.filter((link) => link.id !== first.barrel.id && link.id !== first.rod.id),
      ...second.links,
      ...third.links,
      barrelBody,
      rodBody,
    ];
    rewire(joints, links);
    const cylinders = sealedCylinderStructures(joints);
    expect(cylinders).toHaveLength(3);
    return { joints, cylinders };
  }

  it('settles a chain of three rather than running a stale layout', () => {
    // The third ram's pose was computed the moment its first mount moved, and
    // then run unchanged after its second one moved too -- so a compatible
    // translation came out as parts disagreeing.
    const { joints, cylinders } = chain();
    const target = cylinders.find((one) => one.barrelFar.id === 'A1')!;

    const result = planEdit(
      { poses: [{ cylinder: target, pose: slidPose(target, 2) }] },
      contextFor(cylinders, joints)
    );

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
      made.cylinders.find((one) => one.barrelFar.id === 'A1')!;

    const a = planEdit(
      { poses: [{ cylinder: pick(forward), pose: slidPose(pick(forward), 2) }] },
      contextFor(forward.cylinders, forward.joints)
    );
    const b = planEdit(
      { poses: [{ cylinder: pick(backward), pose: slidPose(pick(backward), 2) }] },
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
    const arm = new RealLink('AN', [parts.barrelFar, far]);
    parts.joints.push(far);
    parts.links.push(arm);
    rewire(parts.joints, parts.links);
    const [cylinder] = sealedCylinderStructures(parts.joints);
    expect(cylinder).toBeDefined();
    return { parts, cylinder };
  }

  /** The same, with a bracket welded to the far mount carrying a witness point. */
  function ramArmAndBracket() {
    const { parts } = ramAndArm();
    weldBracketOnto(parts, parts.rodFar, parts.rod, 'DW', { x: 13, y: 4 });
    const [cylinder] = sealedCylinderStructures(parts.joints);
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

  it('refuses the whole gesture when the ram cannot follow', () => {
    // The finding this is named for: the drag used to be written first and the
    // ram's refusal discovered afterwards, leaving the arm moved and no way
    // back. Nothing is placed anywhere now unless all of it can be.
    const { parts, cylinder } = ramArmAndBracket();
    const moves = new Map<string, Point>([
      ['A', { x: 0, y: 1 }],
      ['N', { x: -4, y: 1 }],
    ]);
    const result = planEdit(
      { moves },
      // The ram's far end is welded to a bracket, and a point out on that
      // bracket is locked. The ram has to turn to follow its moved mount, so
      // the bracket has to turn with it, so the whole gesture cannot happen.
      contextFor([cylinder], parts.joints, (id) => id === 'DWfar')
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.code).toBe('cylinder.pose-locked');
  });
});
