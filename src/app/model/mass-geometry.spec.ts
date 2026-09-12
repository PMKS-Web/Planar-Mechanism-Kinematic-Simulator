import { RevJoint } from './joint';
import { RealLink } from './link';
import { uniformMassProperties } from './mass-properties';
import { uniformBodyOf } from './uniform-body';
import { massGeometryOf } from './mass-geometry';
import { inertiaAboutPoint } from './inertia-about-point';
import { MODEL_SCALE as S } from './render-scale';
import { SettingsService } from '../services/settings.service';

const body = (points: number[][]) =>
  new RealLink(
    'ABCDE'.slice(0, points.length),
    points.map(([x, y], i) => new RevJoint('ABCDE'[i], x * S, y * S)),
    12
  );
const factor = 0.001 / S ** 2;

describe('the explanatory mass domain', () => {
  it('uses the measured rod endpoints and recovers the analytical endpoint inertia', () => {
    const link = body([
      [2, 3],
      [5, 7],
      [3.5, 5],
    ]);
    const geometry = massGeometryOf(link)[0];
    expect(geometry.kind).toBe('rod');
    expect(geometry.points).toEqual([
      { x: 2 * S, y: 3 * S },
      { x: 5 * S, y: 7 * S },
    ]);
    const properties = uniformMassProperties(link, factor);
    link.CoM = properties.com;
    link.massMoI = properties.moi;
    expect(link.massMoI).toBeCloseTo(0.025, 12);
    for (const endpoint of geometry.points) {
      const shift = inertiaAboutPoint(link, endpoint, factor);
      expect(shift.available && shift.inertia).toBeCloseTo(0.1, 12);
      expect(shift.available && shift.shift).toBeCloseTo(0.075, 12);
    }
  });
  it('keeps the convex domain and its mass properties when an interior joint moves', () => {
    const link = body([
      [0, 0],
      [6, 0],
      [6, 2],
      [0, 2],
      [3, 1],
    ]);
    const points = massGeometryOf(link)[0].points;
    const before = uniformMassProperties(link, factor);
    link.joints[4].x = 4 * S;
    link.joints[4].y = 1.5 * S;
    expect(massGeometryOf(link)[0].points).toEqual(points);
    const after = uniformMassProperties(link, factor);
    expect(after.com).toEqual(before.com);
    expect(after.moi).toBeCloseTo(0.04, 12);
    expect(after.moi).toBe(before.moi);
    // An apparent concave traversal is not an authored boundary.
    link.joints = [link.joints[0], link.joints[1], link.joints[4], link.joints[2], link.joints[3]];
    expect(massGeometryOf(link)[0].points).toEqual(points);
    const c = uniformBodyOf(link.joints).calculation;
    expect(c.kind === 'plate' && c.area / S ** 2).toBe(12);
    link.joints[2].y = 3 * S;
    expect(uniformMassProperties(link, factor).moi).not.toBe(before.moi);
  });
  it('keeps drawing size and disc style out of mass integration', () => {
    const link = body([
      [0, 0],
      [1, 0],
    ]);
    (link.joints[0] as RevJoint).ground = true;
    const before = uniformMassProperties(link, factor);
    const previousScale = SettingsService.objectScale;
    try {
      const oldPath = link.d;
      SettingsService._objectScale.next(previousScale * 2);
      link.isCircle = true;
      link.reComputeDPath();
      expect(link.d).not.toBe(oldPath);
      expect(link.drawnAsDisc).toBe(true);
      expect(uniformMassProperties(link, factor).moi).toBe(before.moi);
      expect(massGeometryOf(link)[0].kind).toBe('rod');
    } finally {
      SettingsService._objectScale.next(previousScale);
    }
  });
  it('shows compound members separately and gives coincident geometry one location', () => {
    const link = body([
      [0, 0],
      [4, 0],
      [4, 3],
    ]);
    link.subset = [
      body([
        [0, 0],
        [4, 0],
      ]),
      body([
        [4, 0],
        [4, 3],
      ]),
    ];
    expect(massGeometryOf(link).map((d) => d.kind)).toEqual(['rod', 'rod']);
    const point = massGeometryOf(
      body([
        [2, 3],
        [2, 3],
      ])
    )[0];
    expect(point.kind).toBe('point');
    expect(point.points.map(({ x, y }) => ({ x, y }))).toEqual([{ x: 2 * S, y: 3 * S }]);
  });
});
