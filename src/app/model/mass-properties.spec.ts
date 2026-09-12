import { RevJoint } from './joint';
import { RealLink } from './link';
import { Coord } from './coord';
import { uniformMassProperties } from './mass-properties';

function rod(id: string, start: number, end: number, mass: number): RealLink {
  return new RealLink(id, [new RevJoint(id[0], start, 0), new RevJoint(id[1], end, 0)], mass);
}

describe('shared mass-property working', () => {
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
  });
});
