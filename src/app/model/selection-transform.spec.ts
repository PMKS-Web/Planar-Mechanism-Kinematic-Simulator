import { Coord } from './coord';
import { Force } from './force';
import { PrisJoint, RealJoint, RevJoint } from './joint';
import { RealLink } from './link';
import { canonicalSelectionClosure, captureSelectionTransform } from './selection-transform';

function wire(id: string, joints: RealJoint[]): RealLink {
  const link = new RealLink(id, joints);
  joints.forEach((joint) => joint.links.push(link));
  return link;
}

function twoBars() {
  const a = new RevJoint('A', 0, 0);
  const b = new RevJoint('B', 2, 0);
  const c = new RevJoint('C', 4, 0);
  const ab = wire('AB', [a, b]);
  const bc = wire('BC', [b, c]);
  return { joints: [a, b, c], links: [ab, bc], a, b, c, ab, bc };
}

/**
 * A ram: four joints and two links. C is the slider the rod hangs on -- it was
 * a coincident pin and a prismatic joint joined by a zero-length block until
 * Stage 1 of `docs/joint-type-and-cylinder-plan.md`.
 */
function cylinder() {
  const a = new RevJoint('A', 0, 0);
  const b = new RevJoint('B', 4, 0);
  const slider = new PrisJoint('C', 2, 0);
  const d = new RevJoint('D', 6, 0);
  slider.isSealed = true;
  slider.rotates = false;
  const barrel = wire('AB', [a, b]);
  const rod = wire('CD', [slider, d]);
  slider.slideOn(barrel, a, b);
  return {
    joints: [a, b, slider, d],
    links: [barrel, rod],
    barrel,
    rod,
    slider,
  };
}

describe('canonical selection closure', () => {
  it('deduplicates joints shared by selected links', () => {
    const scene = twoBars();

    const closure = canonicalSelectionClosure([scene.ab, scene.bc], scene.joints, scene.links);

    expect(closure.joints.map((joint) => joint.id)).toEqual(['A', 'B', 'C']);
  });

  it('expands a selected compound leaf to the complete rigid body', () => {
    const scene = twoBars();
    const compound = new RealLink('ABC', scene.joints, 0, 0, undefined, [scene.ab, scene.bc]);

    const closure = canonicalSelectionClosure([scene.ab], scene.joints, [compound]);

    expect(closure.links).toContain(compound);
    expect(closure.links).toContain(scene.ab);
    expect(closure.links).toContain(scene.bc);
    expect(closure.joints.map((joint) => joint.id)).toEqual(['A', 'B', 'C']);
  });

  it('takes a selected slider as the one joint it is', () => {
    // The closure used to reach from a slider's pin to the coincident prismatic
    // joint beside it, and to the block that joined the two. There is no pair
    // to fetch now, so a selected slider is exactly itself.
    const slider = new PrisJoint('P', 1, 1);
    const far = new RevJoint('E', 3, 1);
    const rider = wire('EP', [slider, far]);

    const closure = canonicalSelectionClosure([slider], [slider, far], [rider]);

    expect(closure.joints.map((joint) => joint.id)).toEqual(['P']);
  });

  it('carries a floating slider when its slot carrier is selected', () => {
    const scene = twoBars();
    const slider = new PrisJoint('P', 1, 0);
    const far = new RevJoint('E', 1, 3);
    const rider = wire('EP', [slider, far]);
    slider.slideOn(scene.ab, scene.a, scene.b);

    const closure = canonicalSelectionClosure(
      [scene.ab],
      [...scene.joints, slider, far],
      [...scene.links, rider]
    );

    expect(new Set(closure.joints.map((joint) => joint.id))).toEqual(new Set(['A', 'B', 'P']));
  });

  it('treats every cylinder member as one four-joint semantic part', () => {
    const part = cylinder();

    const closure = canonicalSelectionClosure([part.rod], part.joints, part.links);

    expect(new Set(closure.joints.map((joint) => joint.id))).toEqual(new Set(['A', 'B', 'C', 'D']));
    expect(closure.links).toEqual(expect.arrayContaining(part.links));
  });
});

describe('selection affine snapshot', () => {
  it('translates from the gesture-start snapshot instead of accumulating drift', () => {
    const scene = twoBars();
    const snapshot = captureSelectionTransform([scene.ab], scene.joints, scene.links);

    snapshot.apply({ translation: { x: 2, y: 1 } });
    snapshot.apply({ translation: { x: 4, y: 3 } });

    expect([scene.a.x, scene.a.y]).toEqual([4, 3]);
    expect([scene.b.x, scene.b.y]).toEqual([6, 3]);
    expect([scene.c.x, scene.c.y]).toEqual([4, 0]);
  });

  it('rotates and uniformly scales around the group-bounds center', () => {
    const scene = twoBars();
    const snapshot = captureSelectionTransform([scene.ab, scene.bc], scene.joints, scene.links);

    expect(snapshot.pivot).toEqual(new Coord(2, 0));
    snapshot.apply({ rotation: Math.PI / 2, scale: 2 });

    expect(scene.a.x).toBeCloseTo(2, 10);
    expect(scene.a.y).toBeCloseTo(-4, 10);
    expect(scene.b.x).toBeCloseTo(2, 10);
    expect(scene.b.y).toBeCloseTo(0, 10);
    expect(scene.c.x).toBeCloseTo(2, 10);
    expect(scene.c.y).toBeCloseTo(4, 10);
  });

  it('carries a selected body force and custom CoM through the same affine map', () => {
    const scene = twoBars();
    const force = new Force('F1', scene.ab, new Coord(1, 0), new Coord(1, 1));
    scene.ab.forces.push(force);
    scene.ab.placeCustomCoM({ x: 1, y: 0.5 });
    const snapshot = captureSelectionTransform([scene.ab], scene.joints, scene.links);

    snapshot.apply({ rotation: Math.PI / 2, scale: 2 });

    expect(force.startCoord.x).toBeCloseTo(1, 10);
    expect(force.startCoord.y).toBeCloseTo(0, 10);
    expect(force.endCoord.x).toBeCloseTo(-1, 10);
    expect(force.endCoord.y).toBeCloseTo(0, 10);
    expect(scene.ab.CoM.x).toBeCloseTo(0, 10);
    expect(scene.ab.CoM.y).toBeCloseTo(0, 10);
    expect(scene.ab.customCoMFromOffset()!.x).toBeCloseTo(0, 10);
    expect(scene.ab.customCoMFromOffset()!.y).toBeCloseTo(0, 10);
  });

  it('reframes semantic geometry on a neighboring link deformed by a selected joint', () => {
    const scene = twoBars();
    const force = new Force('F1', scene.ab, new Coord(1, 0), new Coord(1, 1));
    scene.ab.forces.push(force);
    scene.ab.placeCustomCoM({ x: 1, y: 0.5 });
    const snapshot = captureSelectionTransform([scene.b], scene.joints, scene.links);

    snapshot.apply({ translation: { x: 0, y: 2 } });

    expect([scene.a.x, scene.a.y]).toEqual([0, 0]);
    expect([scene.b.x, scene.b.y]).toEqual([2, 2]);
    expect(force.startCoord.x).toBeCloseTo(1, 10);
    expect(force.startCoord.y).toBeCloseTo(1, 10);
    expect(force.endCoord.x).toBeCloseTo(0, 10);
    expect(force.endCoord.y).toBeCloseTo(2, 10);
    expect(scene.ab.CoM.x).toBeCloseTo(0.5, 10);
    expect(scene.ab.CoM.y).toBeCloseTo(1.5, 10);
    expect(scene.ab.customCoMFromOffset()!.x).toBeCloseTo(0.5, 10);
    expect(scene.ab.customCoMFromOffset()!.y).toBeCloseTo(1.5, 10);
  });

  it('refuses atomically when the closure intersects existing lock consequences', () => {
    const scene = twoBars();
    scene.b.locked = true;
    const snapshot = captureSelectionTransform([scene.ab], scene.joints, scene.links);

    const result = snapshot.apply({ translation: { x: 3, y: 2 } });

    expect(result).toEqual({ applied: false, lockedJointIds: ['B'] });
    expect([scene.a.x, scene.a.y, scene.b.x, scene.b.y]).toEqual([0, 0, 2, 0]);
  });

  it('moves a selected slider like any other joint', () => {
    const slider = new PrisJoint('P', 1, 1);
    const far = new RevJoint('E', 3, 1);
    const rider = wire('EP', [slider, far]);
    const snapshot = captureSelectionTransform([slider], [slider, far], [rider]);

    snapshot.apply({ translation: { x: 2, y: -1 } });

    expect([slider.x, slider.y]).toEqual([3, 0]);
    // The rider's far joint is not in the selection, so it stays.
    expect([far.x, far.y]).toEqual([3, 1]);
  });

  it('refuses when a lock holds the selected slider', () => {
    const slider = new PrisJoint('P', 1, 1);
    const far = new RevJoint('E', 3, 1);
    const rider = wire('EP', [slider, far]);
    slider.locked = true;
    const snapshot = captureSelectionTransform([slider], [slider, far], [rider]);

    expect(snapshot.apply({ translation: { x: 2, y: -1 } })).toEqual({
      applied: false,
      lockedJointIds: ['P'],
    });
    expect([slider.x, slider.y]).toEqual([1, 1]);
  });

  it('turns a grounded slot axis from the gesture-start angle without drift', () => {
    const slider = new PrisJoint('P', 2, 0);
    slider.groundAt(0);
    const far = new RevJoint('E', 4, 0);
    const rider = wire('EP', [slider, far]);
    const snapshot = captureSelectionTransform([slider], [slider, far], [rider]);

    snapshot.apply({ rotation: Math.PI / 4, pivot: { x: 0, y: 0 } });
    snapshot.apply({ rotation: Math.PI / 2, pivot: { x: 0, y: 0 } });

    expect(slider.x).toBeCloseTo(0, 10);
    expect(slider.y).toBeCloseTo(2, 10);
    expect(slider.slotAngle).toBeCloseTo(Math.PI / 2, 10);
  });

  it('turns the selection through the anchor when a scale goes negative', () => {
    const scene = twoBars();
    // Off the axis, so a mirror can be told from a half turn.
    scene.c.y = 3;
    const snapshot = captureSelectionTransform([scene.ab, scene.bc], scene.joints, scene.links);

    // Dragged back through the point it scales away from: the parts land on
    // the far side of it rather than stopping flat against it.
    const result = snapshot.apply({ scale: { x: -1, y: 1 }, pivot: { x: 0, y: 0 } });

    expect(result.applied).toBe(true);
    expect(scene.a.x).toBeCloseTo(0, 10);
    expect(scene.b.x).toBeCloseTo(-2, 10);
    expect(scene.c.x).toBeCloseTo(-4, 10);
    // One axis only: C keeps the height it had, so this is a mirror and not a
    // half turn dressed as one.
    expect(scene.c.y).toBeCloseTo(3, 10);
  });

  it('refuses the one scale with no way back', () => {
    const scene = twoBars();
    const snapshot = captureSelectionTransform([scene.ab], scene.joints, scene.links);

    // Zero puts every joint on one point or one line, and nothing about where
    // they were survives to bring them back.
    expect(snapshot.apply({ scale: 0 }).applied).toBe(false);
    expect(snapshot.apply({ scale: Number.NaN }).applied).toBe(false);
    const flattened = snapshot.apply({ scale: { x: 0, y: 1 } });
    expect(flattened.applied).toBe(false);
    if (!flattened.applied) expect(flattened.reason).toBe('invalid-transform');
    expect([scene.a.x, scene.a.y]).toEqual([0, 0]);
    expect([scene.b.x, scene.b.y]).toEqual([2, 0]);
  });

  it('carries a grounded slot axis through the whole map, not only the turn', () => {
    const slider = new PrisJoint('P', 2, 0);
    slider.groundAt(0);
    const far = new RevJoint('E', 4, 0);
    const rider = wire('EP', [slider, far]);
    const snapshot = captureSelectionTransform([slider], [slider, far], [rider]);

    // Mirrored about x = 0: a slot lying along +x now lies along -x. Left at
    // its old bearing it would send the slider off the line its own joints are
    // on, which is what a flip made visible.
    snapshot.apply({ scale: { x: -1, y: 1 }, pivot: { x: 0, y: 0 } });
    expect(Math.abs(slider.slotAngle)).toBeCloseTo(Math.PI, 10);

    // And a squash turns it too: a 45-degree slot flattened by half in y comes
    // out at atan(0.5).
    slider.angle_rad = Math.PI / 4;
    const squashed = captureSelectionTransform([slider], [slider, far], [rider]);
    squashed.apply({ scale: { x: 1, y: 0.5 }, pivot: { x: 0, y: 0 } });
    expect(slider.slotAngle).toBeCloseTo(Math.atan2(0.5, 1), 10);
  });

  it('keeps all hidden cylinder geometry collinear', () => {
    const part = cylinder();
    const snapshot = captureSelectionTransform([part.rod], part.joints, part.links);

    snapshot.apply({
      translation: { x: 3, y: -2 },
      rotation: Math.PI / 2,
      scale: 1.5,
      pivot: { x: 0, y: 0 },
    });

    part.joints.forEach((joint) => expect(joint.x).toBeCloseTo(3, 10));
    // A, B, C, D at 0, 4, 2, 6 along +x, turned a quarter and scaled by 1.5,
    // then carried by (3, -2).
    [-2, 4, 1, 7].forEach((expected, index) =>
      expect(part.joints[index].y).toBeCloseTo(expected, 10)
    );
  });
});
