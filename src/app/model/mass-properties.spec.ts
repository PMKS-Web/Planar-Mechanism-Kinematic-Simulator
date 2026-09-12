import { RevJoint } from './joint';
import { RealLink } from './link';
import { Coord } from './coord';
import { uniformMassProperties } from './mass-properties';
import { SettingsService } from '../services/settings.service';

function rod(id: string, start: number, end: number, mass: number): RealLink {
  return new RealLink(id, [new RevJoint(id[0], start, 0), new RevJoint(id[1], end, 0)], mass);
}

describe('shared mass-property working', () => {
  it('preserves mass and centroidal inertia under rigid translations and rotations of rod, plate and welded bodies', () => {
    const bar = rod('AB', 0, 4, 2);
    const plate = new RealLink(
      'ABC',
      [new RevJoint('A', 0, 0), new RevJoint('B', 4, 0), new RevJoint('C', 1, 3)],
      7
    );
    const left = rod('AB', 0, 2, 2),
      right = rod('BC', 2, 4, 3);
    const welded = new RealLink('ABC', [...left.joints, right.joints[1]], 5, undefined, undefined, [
      left,
      right,
    ]);
    for (const body of [bar, plate, welded]) {
      const before = uniformMassProperties(body, 1);
      const mass = body.mass;
      const points = new Set([...body.joints, ...body.subset.flatMap((member) => member.joints)]);
      for (const point of points) {
        point.x += 12345;
        point.y -= 45678;
      }
      const translated = uniformMassProperties(body, 1);
      expect(translated.com.x).toBeCloseTo(before.com.x + 12345, 9);
      expect(translated.com.y).toBeCloseTo(before.com.y - 45678, 9);
      expect(translated.moi).toBeCloseTo(before.moi, 8);
      for (const point of points) {
        const x = point.x,
          y = point.y;
        point.x = x * Math.cos(0.731) - y * Math.sin(0.731);
        point.y = x * Math.sin(0.731) + y * Math.cos(0.731);
      }
      expect(uniformMassProperties(body, 1).moi).toBeCloseTo(before.moi, 7);
      expect(body.mass).toBe(mass);
      const previousScale = SettingsService.objectScale;
      const old = uniformMassProperties(body, 1);
      try {
        SettingsService._objectScale.next(previousScale * 3);
        body.reComputeDPath();
        const scaled = uniformMassProperties(body, 1);
        expect(scaled.com).toEqual(old.com);
        expect(scaled.moi).toBe(old.moi);
        expect(body.mass).toBe(mass);
      } finally {
        SettingsService._objectScale.next(previousScale);
      }
    }
  });
  it('combines two rods into the closed-form inertia of one uniform rod', () => {
    const left = rod('AB', 0, 2, 2);
    const right = rod('BC', 2, 4, 2);
    const compound = new RealLink(
      'ABC',
      [...left.joints, right.joints[1]],
      4,
      undefined,
      undefined,
      [left, right]
    );
    const result = uniformMassProperties(compound, 1);
    expect(result.com.x).toBeCloseTo(2, 12);
    expect(result.moi).toBeCloseTo((4 * 4 ** 2) / 12, 12);
    expect(result.parts.map((part) => part.moi)).toEqual([2 / 3, 2 / 3]);
    expect(result.parts.map((part) => part.distanceSq)).toEqual([1, 1]);
    expect(result.parts.map((part) => part.shift)).toEqual([2, 2]);
    expect(result.parts.reduce((sum, part) => sum + part.contribution, 0)).toBeCloseTo(
      result.moi,
      12
    );
  });

  it('uses member overrides and their actual centers in the parallel-axis terms', () => {
    const left = rod('AB', 0, 2, 2);
    left.moiIsCustom = true;
    left.massMoI = 3;
    left.comIsCustom = true;
    left.CoM = new Coord(0, 0);
    const right = rod('BC', 2, 4, 2);
    const compound = new RealLink(
      'ABC',
      [...left.joints, right.joints[1]],
      4,
      undefined,
      undefined,
      [left, right]
    );
    const result = uniformMassProperties(compound, 1);
    expect(result.com.x).toBeCloseTo(1.5, 12);
    expect(result.moi).toBeCloseTo(3 + 2 / 3 + 4 * 1.5 ** 2, 12);
    expect(result.parts[0].moi).toBe(3);
  });
  it('counts overlapping members separately rather than unioning their mass domains', () => {
    const first = rod('AB', 0, 4, 2),
      second = rod('AB', 0, 4, 3);
    const body = new RealLink('AB', first.joints, 5, undefined, undefined, [first, second]);
    const result = uniformMassProperties(body, 1);
    expect(result.moi).toBeCloseTo((5 * 16) / 12, 12);
    expect(result.parts.map((part) => part.shift)).toEqual([0, 0]);
    expect(result.parts.map((part) => part.mass)).toEqual([2, 3]);
  });

  it('exposes the actual translated polygon calculation without changing its result', () => {
    const points = [
      [1e8, 1e8],
      [1e8 + 6, 1e8],
      [1e8 + 6, 1e8 + 2],
      [1e8, 1e8 + 2],
    ];
    const plate = new RealLink(
      'ABCD',
      points.map(([x, y], i) => new RevJoint('ABCD'[i], x, y)),
      12
    );
    const result = uniformMassProperties(plate, 1);
    expect(result.moi).toBeCloseTo(40, 10);
    const calculation = result.shape!.calculation;
    expect(calculation.kind).toBe('plate');
    if (calculation.kind !== 'plate') throw new Error('Expected a plate');
    expect(calculation.area).toBe(12);
    expect(calculation.centroidX).toBe(3);
    expect(calculation.centroidY).toBe(1);
    expect(calculation.polarOverMass - 10).toBeCloseTo(40 / 12, 12);
    expect(calculation.polarAreaMoment).toBe(160);
    expect(calculation.edges.map((edge) => edge.polarAreaMoment)).toEqual([0, 112, 48, 0]);
    const trace = result.trace;
    if (trace?.kind !== 'plate') throw new Error('Expected plate mass trace');
    expect(trace.originMoi).toBeCloseTo(160, 12);
    expect(trace.edgeMoi.reduce((sum, term) => sum + term, 0)).toBeCloseTo(trace.originMoi, 12);
  });
});
