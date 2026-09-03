import '../model/joint';
import { Coord } from '../model/coord';
import { RevJoint } from '../model/joint';
import { RealLink } from '../model/link';
import { MODEL_SCALE } from '../model/render-scale';
import { createMechanismHarness, wireGraph } from '../../test-utils/mechanism-harness';
import { GridUtilsService } from './grid-utils.service';
import { MechanismService } from './mechanism.service';

/**
 * Every route that moves a joint lands in `dragJoint`, and a held bar has a
 * say there. These are the CAD rules at the service level: what a drag of a
 * joint on a held bar does to it, to the bar's other end, and to nothing
 * else -- and what the canvas is told when the holds would not let it go.
 */

const S = MODEL_SCALE;

/** A four-bar: ground A, crank AB, coupler BC, rocker CD, ground D. */
function fourBar(mechanism: MechanismService) {
  const a = new RevJoint('A', 0, 0, true, true);
  const b = new RevJoint('B', 0, 2 * S);
  const c = new RevJoint('C', 3 * S, 3 * S);
  const d = new RevJoint('D', 4 * S, 0, false, true);
  const ab = new RealLink('AB', [a, b], 1, 1);
  const bc = new RealLink('BC', [b, c], 1, 1);
  const cd = new RealLink('CD', [c, d], 1, 1);
  mechanism.joints = [a, b, c, d];
  mechanism.links = [ab, bc, cd];
  mechanism.forces = [];
  wireGraph(mechanism);
  mechanism.updateMechanism();
  return { a, b, c, d, ab, bc, cd };
}

const dist = (p: { x: number; y: number }, q: { x: number; y: number }) =>
  Math.hypot(q.x - p.x, q.y - p.y);

describe('dragging against a held bar', () => {
  let service: MechanismService;
  let grid: GridUtilsService;

  beforeEach(() => {
    const harness = createMechanismHarness();
    service = harness.service;
    grid = harness.injector.get(GridUtilsService);
  });

  it('slides the free end on the arc about the grounded end when the length is held', () => {
    const parts = fourBar(service);
    parts.ab.hold = 'length';
    grid.dragJoint(parts.b, new Coord(3 * S, 2 * S));
    expect(dist(parts.a, parts.b)).toBeCloseTo(2 * S, 3);
    // Nearest point of the arc to the ask, not the ask itself.
    expect(parts.b.x).toBeGreaterThan(0.5 * S);
    expect(grid.lastHoldRefusal).toBeUndefined();
    // The bar's own record of its length agrees with its joints.
    expect(parts.ab.length).toBeCloseTo(2 * S, 3);
  });

  it('keeps the free end on the line through the grounded end when the angle is held', () => {
    const parts = fourBar(service);
    parts.ab.hold = 'angle';
    grid.dragJoint(parts.b, new Coord(1 * S, 3 * S));
    // The bar points straight up: B stays on x = 0, at the height asked.
    expect(parts.b.x).toBeCloseTo(0, 3);
    expect(parts.b.y).toBeCloseTo(3 * S, 3);
  });

  it('tows the far end along when it is free, and leaves the rest alone', () => {
    const parts = fourBar(service);
    parts.bc.hold = 'length';
    const before = dist(parts.b, parts.c);
    const dWas = { x: parts.d.x, y: parts.d.y };
    grid.dragJoint(parts.c, new Coord(6 * S, 3 * S));
    expect(parts.c.x).toBeCloseTo(6 * S, 2);
    expect(dist(parts.b, parts.c)).toBeCloseTo(before, 3);
    expect(parts.b.x).toBeGreaterThan(0);
    expect(parts.d).toMatchObject(dWas);
  });

  it('refuses a joint the holds have fully determined, naming them', () => {
    const parts = fourBar(service);
    parts.ab.hold = 'length';
    parts.bc.hold = 'length';
    parts.c.locked = true;
    const bWas = { x: parts.b.x, y: parts.b.y };
    expect(grid.holdsImmobilizing(parts.b).map((bar) => bar.id)).toEqual(['AB', 'BC']);
    grid.dragJoint(parts.b, new Coord(2 * S, 2 * S));
    expect(parts.b.x).toBeCloseTo(bWas.x, 3);
    expect(parts.b.y).toBeCloseTo(bWas.y, 3);
    expect(grid.lastHoldRefusal?.immovable.map((joint) => joint.id)).toEqual(['B']);
  });

  it('moves a whole body through the holds when one of its joints is held', () => {
    const parts = fourBar(service);
    parts.ab.hold = 'length';
    // Dragging the coupler carries B and C; B may only ride the arc about A.
    grid.dragLink(parts.bc, 2 * S, 0);
    expect(dist(parts.a, parts.b)).toBeCloseTo(2 * S, 3);
    expect(parts.c.x).toBeCloseTo(5 * S, 2);
  });

  it('forgets a refusal once the bars that refused are unlocked', () => {
    const parts = fourBar(service);
    parts.ab.hold = 'length';
    parts.bc.hold = 'length';
    parts.c.locked = true;
    grid.dragJoint(parts.b, new Coord(2 * S, 2 * S));
    expect(grid.lastHoldRefusal).toBeDefined();
    // Unlock everything: the next drag is an ordinary drag, and must not be
    // reported as the limit it no longer is.
    parts.ab.hold = undefined;
    parts.bc.hold = undefined;
    parts.c.locked = false;
    grid.dragJoint(parts.b, new Coord(1 * S, 2 * S));
    expect(parts.b.x).toBeCloseTo(1 * S, 6);
    expect(grid.lastHoldRefusal).toBeUndefined();
  });

  it('is not consulted when no held bar reaches the moved joint', () => {
    const parts = fourBar(service);
    parts.ab.hold = 'length';
    grid.dragJoint(parts.c, new Coord(5 * S, 4 * S));
    expect(parts.c.x).toBeCloseTo(5 * S, 6);
    expect(parts.c.y).toBeCloseTo(4 * S, 6);
    expect(parts.b.y).toBeCloseTo(2 * S, 6);
  });
});

describe('a four-bar with every length locked', () => {
  let service: MechanismService;
  let grid: GridUtilsService;

  beforeEach(() => {
    const harness = createMechanismHarness();
    service = harness.service;
    grid = harness.injector.get(GridUtilsService);
  });

  const lengths = (parts: ReturnType<typeof fourBar>) => [
    dist(parts.a, parts.b),
    dist(parts.b, parts.c),
    dist(parts.c, parts.d),
  ];

  it('moves the coupler with a dragged joint and keeps every length', () => {
    const parts = fourBar(service);
    parts.ab.hold = 'length';
    parts.bc.hold = 'length';
    parts.cd.hold = 'length';
    const was = lengths(parts);
    grid.dragJoint(parts.b, new Coord(0.6 * S, 1.9 * S));
    lengths(parts).forEach((now, index) => expect(now).toBeCloseTo(was[index], 3));
    expect(parts.b.x).toBeGreaterThan(0.3 * S);
    expect(grid.lastHoldRefusal).toBeUndefined();
  });

  it('refuses an ask the loop cannot follow, whole, rather than bending a lock', () => {
    // A shorter coupler and rocker than the stock four-bar's, so that with B
    // swung to the far side of A the two together cannot span to D.
    const parts = fourBar(service);
    parts.c.x = 1.5 * S;
    parts.c.y = 1 * S;
    parts.b.y = 1 * S;
    parts.d.x = 3 * S;
    service.links.forEach((link) => (link as RealLink).updateLengthAndAngle());
    service.updateMechanism();
    parts.ab.hold = 'length';
    parts.bc.hold = 'length';
    parts.cd.hold = 'length';
    const was = lengths(parts);
    const bWas = { x: parts.b.x, y: parts.b.y };
    grid.dragJoint(parts.b, new Coord(-1 * S, 0));
    lengths(parts).forEach((now, index) => expect(now).toBeCloseTo(was[index], 3));
    expect(parts.b.x).toBeCloseTo(bWas.x, 6);
    expect(parts.b.y).toBeCloseTo(bWas.y, 6);
    expect(grid.lastHoldRefusal?.satisfied).toBe(false);
    expect(grid.lastHoldRefusal?.immovable).toEqual([]);
  });
});

describe('a typed length or angle near a lock', () => {
  let service: MechanismService;
  let grid: GridUtilsService;

  beforeEach(() => {
    const harness = createMechanismHarness();
    service = harness.service;
    grid = harness.injector.get(GridUtilsService);
  });

  it('is solved exactly, moving the neighbors the locks allow', () => {
    // AB and CD locked, both grounded at one end; BC typed longer. Neither
    // end of BC can simply move outward -- each rides its own arc -- so the
    // solver swings both until BC is exactly the number asked.
    const parts = fourBar(service);
    parts.ab.hold = 'length';
    parts.cd.hold = 'length';
    const ab = dist(parts.a, parts.b);
    const cd = dist(parts.c, parts.d);
    expect(grid.setBarValue(parts.bc, 'length', 5 * S)).toBe('applied');
    expect(dist(parts.b, parts.c)).toBeCloseTo(5 * S, 3);
    expect(dist(parts.a, parts.b)).toBeCloseTo(ab, 3);
    expect(dist(parts.c, parts.d)).toBeCloseTo(cd, 3);
    expect(parts.bc.length).toBeCloseTo(5 * S, 3);
  });

  it('keeps a locked bar locked at the number typed into it', () => {
    const parts = fourBar(service);
    parts.bc.hold = 'length';
    expect(grid.setBarValue(parts.bc, 'length', 4 * S)).toBe('applied');
    expect(dist(parts.b, parts.c)).toBeCloseTo(4 * S, 3);
    expect(parts.bc.hold).toBe('length');
  });

  it('refuses a number no configuration allows, and moves nothing', () => {
    const parts = fourBar(service);
    parts.ab.hold = 'length';
    parts.cd.hold = 'length';
    const bc = dist(parts.b, parts.c);
    expect(grid.setBarValue(parts.bc, 'length', 20 * S)).toBe('refused');
    expect(dist(parts.b, parts.c)).toBeCloseTo(bc, 6);
  });

  it('leaves a bar no lock reaches to the panel', () => {
    const parts = fourBar(service);
    expect(grid.setBarValue(parts.bc, 'length', 5 * S)).toBe('unheld');
  });
});
