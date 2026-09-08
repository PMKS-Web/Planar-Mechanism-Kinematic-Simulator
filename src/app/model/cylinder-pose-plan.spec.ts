import { RealLink } from './link';
import { ram, rewire, weldBracketOnto } from '../../test-utils/cylinder-graph';
import { Cylinder, CylinderPose, sealedCylinderStructures } from './cylinder';
import { planCylinderPose, PoseSnapshot, snapshotOf } from './cylinder-pose-plan';

/**
 * What moves when a ram is re-posed, once its mounts can be welded to things.
 *
 * Writing the cylinder's own five coordinates is right exactly as long as
 * those five are all that is rigid with it. A bracket welded to a mount is
 * rigid with that side of the ram, and moving the bar without it does not
 * deform the body — it tears it, and the rebuild afterwards reads the wreckage
 * as a link that changed shape. So the placements are worked out in full
 * first, and the interesting claims are that each side is carried by its own
 * mount's motion, that the closure reaches a second ram bolted to the first,
 * and that a request nothing can satisfy moves nothing at all.
 */

/** A ram from (0,0) to (10,0), and the structure the model recognizes in it. */
function ramAndCylinder(suffix: string = '') {
  const parts = ram(suffix);
  const [cylinder] = sealedCylinderStructures(parts.joints);
  return { parts, cylinder };
}

/** Slide the whole ram `by` along x without turning or resizing it. */
function slidPose(cylinder: Cylinder, snapshot: PoseSnapshot, by: number): CylinderPose {
  const moved = (id: string) => {
    const was = snapshot.get(id)!;
    return { x: was.x + by, y: was.y };
  };
  return {
    barrelFar: moved(cylinder.barrelFar.id),
    barrelNear: moved(cylinder.barrelNear.id),
    pin: moved(cylinder.pin.id),
    rodFar: moved(cylinder.rodFar.id),
  };
}

const noDependents = {
  layoutFor: () => undefined,
  tolerance: 1e-6,
};

describe('planning where a cylinder’s pose puts everything', () => {
  it('moves only the five joints when nothing is welded to it', () => {
    const { parts, cylinder } = ramAndCylinder();
    const snapshot = snapshotOf(parts.joints);
    const result = planCylinderPose(
      { cylinder, pose: slidPose(cylinder, snapshot, 3) },
      { cylinders: [cylinder], snapshot, ...noDependents }
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
    const { parts, cylinder: plain } = ramAndCylinder();
    weldBracketOnto(parts, parts.barrelFar, parts.barrel, 'AX', { x: -3, y: 4 });
    const [cylinder] = sealedCylinderStructures(parts.joints);
    const snapshot = snapshotOf(parts.joints);
    expect(plain).toBeDefined();

    const result = planCylinderPose(
      { cylinder, pose: slidPose(cylinder, snapshot, 3) },
      { cylinders: [cylinder], snapshot, ...noDependents }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The bracket's far end is on the barrel's body, so it travels with it —
    // this is the joint the old five-coordinate write left standing still.
    expect(result.plan.placements.get('AXfar')).toEqual({ x: 0, y: 4 });
    expect(result.plan.movedIds.has('AXfar')).toBe(true);
    expect(result.plan.affectedRoots.map((one) => one.id)).toContain('ABAX');
  });

  it('turns a bracket about its own mount when that side rotates', () => {
    // A quarter turn of the barrel about A: a bracket point one unit "above"
    // the axis has to end up one unit to the side of it, which is the whole
    // difference between carrying a body and translating one.
    const { parts } = ramAndCylinder();
    weldBracketOnto(parts, parts.barrelFar, parts.barrel, 'AX', { x: 0, y: 2 });
    const [cylinder] = sealedCylinderStructures(parts.joints);
    const snapshot = snapshotOf(parts.joints);

    const turned: CylinderPose = {
      barrelFar: { x: 0, y: 0 },
      barrelNear: { x: 0, y: 6 },
      pin: { x: 0, y: 6 },
      rodFar: { x: 0, y: 10 },
    };
    const result = planCylinderPose(
      { cylinder, pose: turned },
      { cylinders: [cylinder], snapshot, ...noDependents }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const far = result.plan.placements.get('AXfar')!;
    expect(far.x).toBeCloseTo(-2, 9);
    expect(far.y).toBeCloseTo(0, 9);
  });

  it('refuses a ram with both ends fused into one body', () => {
    // Nothing to extend against. Resizing it would be inventing a freedom the
    // drawing does not have.
    const { parts } = ramAndCylinder();
    const bridge = new RealLink(
      'both',
      [parts.barrelFar, parts.barrelNear, parts.pin, parts.rodFar],
      undefined,
      undefined,
      undefined,
      [parts.barrel, parts.rod]
    );
    parts.links = parts.links.filter((link) => link.id !== 'AB' && link.id !== 'CD');
    parts.links.push(bridge);
    parts.joints.forEach((joint) => {
      if ('links' in joint) (joint as { links: unknown[] }).links = [bridge];
    });

    const [cylinder] = sealedCylinderStructures(parts.joints);
    if (!cylinder) return; // a fused ram may not resolve at all, which is also fine
    const snapshot = snapshotOf(parts.joints);
    const result = planCylinderPose(
      { cylinder, pose: slidPose(cylinder, snapshot, 1) },
      { cylinders: [cylinder], snapshot, ...noDependents }
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.code).toBe('cylinder.both-ends-fused');
  });
});

describe('planning what one ram’s motion reaches', () => {
  it('re-lays a second ram bolted to the body the first one moves', () => {
    // The dependency the old code reached one level of. The first ram's barrel
    // is welded to a bracket whose far end *is* the second ram's mount, so
    // moving the first carries the bracket, which carries that mount, which
    // the second ram has to be re-laid from.
    const first = ram('1');
    const second = ram('2');
    // Clear of the first, or the two rams sit on top of each other and the
    // bracket between them has no length to be rigid about.
    second.joints.forEach((joint) => {
      joint.y += 20;
    });
    const bracket = new RealLink('A1A2', [first.barrelFar, second.barrelFar]);
    const compound = new RealLink(
      'A1B1A2',
      [...first.barrel.joints, second.barrelFar],
      undefined,
      undefined,
      undefined,
      [first.barrel, bracket]
    );
    first.barrelFar.isWelded = true;

    const joints = [...first.joints, ...second.joints];
    const links = [
      ...first.links.filter((link) => link.id !== first.barrel.id),
      ...second.links,
      compound,
    ];
    rewire(joints, links);

    const snapshot = snapshotOf(joints);
    const cylinders = sealedCylinderStructures(joints);
    expect(cylinders).toHaveLength(2);

    const target = cylinders.find((one) => one.barrelFar.id === 'A1')!;
    const laidOut: string[] = [];
    const result = planCylinderPose(
      { cylinder: target, pose: slidPose(target, snapshot, 2) },
      {
        cylinders,
        snapshot,
        tolerance: 1e-6,
        // Stands in for `stretchedCylinderPose`: the barrel keeps the length it
        // was drawn at, and the pin is wherever that leaves it on the new axis.
        layoutFor: (cylinder, barrelFar, rodFar) => {
          laidOut.push(cylinder.barrelFar.id);
          const span = Math.hypot(rodFar.x - barrelFar.x, rodFar.y - barrelFar.y);
          const along = (distance: number) => ({
            x: barrelFar.x + ((rodFar.x - barrelFar.x) * distance) / span,
            y: barrelFar.y + ((rodFar.y - barrelFar.y) * distance) / span,
          });
          return { barrelFar, barrelNear: along(6), pin: along(6), rodFar };
        },
      }
    );

    expect(result.ok ? 'ok' : result.refusal.code).toBe('ok');
    if (!result.ok) return;
    // The second ram's mount rode the first ram's body...
    expect(result.plan.placements.get('A2')).toEqual({ x: 2, y: 20 });
    // ...so the second ram was asked where it now lies.
    expect(laidOut).toEqual(['A2']);
    // And its own far end followed the layout it was given.
    expect(result.plan.placements.get('D2')).toBeDefined();
  });

  it('moves nothing when a locked joint would be carried', () => {
    const { parts } = ramAndCylinder();
    weldBracketOnto(parts, parts.barrelFar, parts.barrel, 'AX', { x: -3, y: 4 });
    const [cylinder] = sealedCylinderStructures(parts.joints);
    const snapshot = snapshotOf(parts.joints);

    const result = planCylinderPose(
      { cylinder, pose: slidPose(cylinder, snapshot, 3) },
      {
        cylinders: [cylinder],
        snapshot,
        ...noDependents,
        // A lock out on the bracket, on none of the ram's own five.
        frozen: (id) => id === 'AXfar',
      }
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.code).toBe('cylinder.pose-locked');
    expect(result.refusal.long).toContain('locked');
  });
});
