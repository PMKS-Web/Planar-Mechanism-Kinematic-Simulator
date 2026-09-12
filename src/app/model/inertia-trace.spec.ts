import { uniformBodyOf } from './uniform-body';
import { uniformMassProperties } from './mass-properties';
import { inertiaAboutPoint } from './inertia-about-point';
import { RevJoint } from './joint';
import { RealLink } from './link';
import { MODEL_SCALE } from './render-scale';
import { forceMoment } from './force-moment';
import { appliedMoments } from './applied-moments';
import { Force } from './force';
import { Coord } from './coord';
import { LengthUnit } from './unit-enums';

describe('traceable mass integration in translated grid coordinates', () => {
  const rectangle = [
    { x: 2, y: 3 },
    { x: 8, y: 3 },
    { x: 8, y: 5 },
    { x: 2, y: 5 },
  ];
  const triangle = [
    { x: 2, y: 3 },
    { x: 6, y: 3 },
    { x: 3, y: 6 },
  ];
  for (const [name, points, expected] of [
    ['rectangle', rectangle, 40 / 12],
    ['asymmetric triangle', triangle, 44 / 36],
  ] as const) {
    it(`preserves ${name} inertia under translation and rotation`, () => {
      const original = uniformBodyOf([...points]);
      const moved = uniformBodyOf(points.map((p) => ({ x: p.x + 12345, y: p.y - 45678 })));
      const angle = 0.731;
      const rotated = uniformBodyOf(
        points.map((p) => ({
          x: p.x * Math.cos(angle) - p.y * Math.sin(angle),
          y: p.x * Math.sin(angle) + p.y * Math.cos(angle),
        }))
      );
      expect(original.gyrationSq).toBeCloseTo(expected, 10);
      expect(moved.gyrationSq).toBeCloseTo(expected, 8);
      expect(rotated.gyrationSq).toBeCloseTo(expected, 10);
      expect(moved.centroid.x).toBeCloseTo(original.centroid.x + 12345, 9);
      expect(moved.centroid.y).toBeCloseTo(original.centroid.y - 45678, 9);
      const c = original.calculation;
      if (c.kind !== 'plate') throw new Error('Expected a plate');
      expect(c.origin).toEqual({ x: 2, y: 3 });
      expect(c.vertices[0]).toEqual({ x: 0, y: 0 });
      expect(c.edges.length).toBe(c.vertices.length);
      expect(c.edges.at(-1)?.to).toBe(0);
      expect(c.edges.reduce((s, e) => s + e.cross / 2, 0)).toBeCloseTo(c.area, 12);
      expect(c.edges.reduce((s, e) => s + e.firstX / 6, 0) / c.area + c.origin.x).toBeCloseTo(
        original.centroid.x,
        12
      );
      expect(c.edges.reduce((s, e) => s + e.firstY / 6, 0) / c.area + c.origin.y).toBeCloseTo(
        original.centroid.y,
        12
      );
      expect(
        c.edges.reduce((s, e) => s + e.polar / 12, 0) / c.area - c.centroidX ** 2 - c.centroidY ** 2
      ).toBeCloseTo(expected, 12);
    });
  }
  it('has analytical rectangle edge contributions and a known offset inertia', () => {
    const body = uniformBodyOf(rectangle);
    if (body.calculation.kind !== 'plate') throw new Error('Expected a plate');
    const c = body.calculation;
    expect(c.edges.map((e) => e.cross / 2)).toEqual([0, 6, 6, 0]);
    expect(c.edges.map((e) => e.polar / 12)).toEqual([0, 112, 48, 0]);
    expect(c.sums.firstX / 6).toBe(36);
    expect(c.sums.firstY / 6).toBe(12);
    const link = new RealLink(
      'ABCD',
      rectangle.map((p, i) => new RevJoint('ABCD'[i], p.x * MODEL_SCALE, p.y * MODEL_SCALE)),
      12
    );
    const factor = 0.001 / MODEL_SCALE ** 2;
    const properties = uniformMassProperties(link, factor);
    link.CoM = properties.com;
    link.massMoI = properties.moi;
    const shifted = inertiaAboutPoint(
      link,
      { x: link.CoM.x + 3 * MODEL_SCALE, y: link.CoM.y + 4 * MODEL_SCALE },
      factor
    );
    expect(shifted.available && shifted.inertia - link.massMoI).toBeCloseTo(0.3, 12);
    expect(shifted.available && shifted.inertia).toBeCloseTo(0.34, 12);
  });
});

describe('signed applied-force moment trace', () => {
  it('uses the right-handed moment arm and is invariant under rigid translation', () => {
    const a = forceMoment({ x: 4, y: 5 }, { x: 1, y: 1 }, 2, -3);
    const b = forceMoment({ x: 104, y: -95 }, { x: 101, y: -99 }, 2, -3);
    expect(a.moment).toBe(-17);
    expect(b).toEqual(a);
    expect(forceMoment({ x: 4, y: 5 }, { x: 4, y: 5 }, 2, -3).moment).toBeCloseTo(0, 12);
  });
  it('sums two opposite-sign loads in SI, adds weight only when enabled, and stays read-only', () => {
    const link = new RealLink('AB', [new RevJoint('A', 0, 0), new RevJoint('B', 400, 0)], 1000);
    const a = new Force('F1', link, new Coord(200, 0), new Coord(200, 200), false, true, 2);
    const b = new Force('F2', link, new Coord(400, 0), new Coord(400, -200), false, true, 3);
    link.forces = [a, b];
    const noWeight = appliedMoments(link, { x: 0, y: 0 }, LengthUnit.CM, false);
    expect(noWeight.rows.map((r) => r.moment)).toEqual([0.02, -0.06]);
    expect(noWeight.total).toBeCloseTo(-0.04, 12);
    expect(appliedMoments(link, { x: 0, y: 0 }, LengthUnit.CM, true).total).toBeCloseTo(
      -0.04 - 0.0980665,
      12
    );
    expect(a.mag).toBe(2);
    expect(b.mag).toBe(3);
  });
});
