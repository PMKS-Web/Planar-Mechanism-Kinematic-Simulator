import { PrisJoint } from '../joint';
import { buildMechanism } from '../../../test-utils/verification/fixture';
import { frictionDrivenSliderFixture } from '../../../test-utils/verification/friction-fixtures';
import { ForceSolver } from './force-solver';
import { NEWTONS_PER_KGF } from '../unit-conversions';

describe('guide friction boundaries', () => {
  for (const direction of [-1, 1]) {
    it(`has 20 N sliding resistance, 30 N static capacity and opposing drive at direction ${direction}`, () => {
      const built = buildMechanism(frictionDrivenSliderFixture('m'));
      const frame = ForceSolver.analyzeFrame(
        built.joints,
        built.links,
        'static',
        true,
        'm',
        0,
        undefined,
        false,
        { jointVelocities: new Map([['B', [direction, 0]]]), angularVelocities: new Map() }
      );
      expect(frame.status).toBe('ok');
      expect(frame.friction!.get('B')!.normalLoad).toBeCloseTo(100, 10);
      expect(frame.friction!.get('B')!.effort).toBeCloseTo(-20 * direction, 10);
      expect(frame.friction!.get('B')!.staticLimit).toBeCloseTo(30, 10);
      expect(frame.inputEffort!.valueSI).toBeCloseTo(20 * direction, 10);
    });
  }
  it('projects inclined gravity perpendicular to the permitted axis and adds inertia only to the driven effort', () => {
    const built = buildMechanism(frictionDrivenSliderFixture('m'));
    const guide = built.joints.find((j): j is PrisJoint => j instanceof PrisJoint)!;
    guide.angle_rad = Math.PI / 6;
    const axis: [number, number] = [Math.cos(guide.slotAngle), Math.sin(guide.slotAngle)];
    const frame = ForceSolver.analyzeFrame(
      built.joints,
      built.links,
      'dynamic',
      true,
      'm',
      0,
      {
        linkAccelerations: new Map(),
        linkAngularAccelerations: new Map(),
        pistonAccelerations: new Map([['AB', [2 * axis[0], 2 * axis[1]]]]),
      },
      false,
      { jointVelocities: new Map([['B', axis]]), angularVelocities: new Map() }
    );
    expect(frame.status).toBe('ok');
    expect(frame.friction!.get('B')!.normalLoad).toBeCloseTo(100 * Math.cos(Math.PI / 6), 8);
    expect(frame.inputEffort!.valueSI).toBeCloseTo(
      50 + 20 * Math.cos(Math.PI / 6) + 200 / NEWTONS_PER_KGF,
      8
    );
    expect(frame.additionalFrictionEffort!.valueSI).toBeCloseTo(20 * Math.cos(Math.PI / 6), 8);
  });
  for (const scale of [1, 200]) {
    for (const rate of [-1.01e-9, -0.99e-9, 0, 0.99e-9, 1.01e-9]) {
      it(`classifies physical rate ${rate} identically at coordinate scale ${scale}`, () => {
        const built = buildMechanism(frictionDrivenSliderFixture('m'));
        const frame = ForceSolver.analyzeFrame(
          built.joints,
          built.links,
          'static',
          true,
          'm',
          0,
          undefined,
          false,
          {
            coordinateScale: scale,
            jointVelocities: new Map([['B', [rate * scale, 0]]]),
            angularVelocities: new Map(),
          }
        );
        if (Math.abs(rate) <= 1e-9) {
          expect(frame.status).toBe('friction-unresolved');
          expect(frame.inputEffort).toBeUndefined();
          expect(frame.friction).toBeUndefined();
        } else {
          expect(frame.status).toBe('ok');
          expect(frame.friction!.get('B')!.effort * rate).toBeLessThan(0);
        }
      });
    }
  }
});
