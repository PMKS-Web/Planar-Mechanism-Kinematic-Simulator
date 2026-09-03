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

  it('is not consulted when no held bar reaches the moved joint', () => {
    const parts = fourBar(service);
    parts.ab.hold = 'length';
    grid.dragJoint(parts.c, new Coord(5 * S, 4 * S));
    expect(parts.c.x).toBeCloseTo(5 * S, 6);
    expect(parts.c.y).toBeCloseTo(4 * S, 6);
    expect(parts.b.y).toBeCloseTo(2 * S, 6);
  });
});
