import '../../app/model/joint';
import { buildMechanism } from '../../test-utils/verification/fixture';
import {
  MECHANICAL_CLOCK,
  CLOCK_MODULE,
} from '../../test-utils/verification/mechanical-clock-fixture';
import { gearBodyFor } from '../../app/model/mechanism/gear-drive';
import { validateGearAssembly } from '../../app/model/mechanism/gear-validation';
import { assignBodies } from '../../app/model/mechanism/bodies';
import { KinematicsSolver } from '../../app/model/mechanism/kinematic-solver';
import { gearSample } from '../../app/model/gear-analysis';

describe('mechanical clock: independent concentric shafts through real compound meshes', () => {
  it('validates the same module and 30m center distance without merging central bodies', () => {
    const { mechanism: m, joints, links } = buildMechanism(MECHANICAL_CLOCK);
    expect(validateGearAssembly(MECHANICAL_CLOCK.transmission, joints, links)).toEqual([]);
    expect(m.isMechanismValid(), m.failure).toBe(true);
    const bodies = assignBodies(joints, links);
    expect(bodies.movingBodies.size).toBe(3);
    expect(bodies.bodyOf(links[0])).not.toBe(bodies.bodyOf(links[2]));
    const [a, , c, , e] = joints;
    expect(a).not.toBe(e);
    expect([a.x, a.y]).toEqual([e.x, e.y]);
    expect(Math.hypot(c.x - a.x, c.y - a.y)).toBeCloseTo(30 * CLOCK_MODULE, 12);
    expect(m.gearDrive!.bodies).toHaveLength(3);
    expect(m.dof).toBe(1);
    c.x += 0.05;
    expect(
      validateGearAssembly(MECHANICAL_CLOCK.transmission, joints, links).filter(
        (d) => d.code === 'center-distance'
      )
    ).toHaveLength(2);
  });

  for (const sign of [-1, 1]) {
    it(`preserves exact ratios, rigid hand motion and twelve turns with input sign ${sign}`, () => {
      const m = buildMechanism({ ...MECHANICAL_CLOCK, inputAngVel: sign * 2 * Math.PI }).mechanism;
      expect(m.isMechanismValid(), m.failure).toBe(true);
      const plan = m.gearDrive!;
      expect(gearBodyFor(plan, 'GA')!.ratio).toEqual({ numerator: 1n, denominator: 1n });
      expect(gearBodyFor(plan, 'GB')!.ratio).toEqual({ numerator: -1n, denominator: 4n });
      expect(gearBodyFor(plan, 'GC')).toBe(gearBodyFor(plan, 'GB'));
      expect(gearBodyFor(plan, 'GD')!.ratio).toEqual({ numerator: 1n, denominator: 12n });
      expect(gearBodyFor(plan, 'GD')!.multiplier / gearBodyFor(plan, 'GC')!.multiplier).toBeCloseTo(
        -1 / 3,
        14
      );
      expect(plan.periodTurns).toBe(12);
      expect(m.joints).toHaveLength(4321);
      expect(m.joints.length).toBeLessThan(6000);
      expect(m.cyclePeriod).toBeCloseTo(12, 9);
      for (const turns of [1, 3, 6, 12]) {
        const step = turns * 360;
        expect(gearSample(m, step, 'GA', 'Angular Gear Travel')[0]).toBeCloseTo(
          sign * turns * 2 * Math.PI,
          10
        );
        expect((gearSample(m, step, 'GD', 'Angular Gear Travel')[0] * 180) / Math.PI).toBeCloseTo(
          sign * turns * 30,
          9
        );
        const hand = m.joints[step].find((j) => j.id === 'F')!;
        const theta = Math.PI / 2 + (sign * turns * Math.PI) / 6;
        expect(hand.x).toBeCloseTo(3.4 * Math.cos(theta), 9);
        expect(hand.y).toBeCloseTo(3.4 * Math.sin(theta), 9);
      }
      for (let step = 0; step < m.joints.length; step++) {
        const motion = m.gearMotionAtSample(step)!;
        expect(motion.angles.get('GB')).toEqual(motion.angles.get('GC'));
        expect(motion.angles.get('GD')!.velocity / motion.angles.get('GA')!.velocity).toBeCloseTo(
          1 / 12,
          14
        );
      }
      for (const step of [0, 360, 1080, 2160, 4320]) {
        m.prepareSolvers();
        KinematicsSolver.resetVariables();
        KinematicsSolver.determineKinematics(
          m.joints[step],
          m.links[step],
          m.inputAngularVelocities[step]
        );
        expect(KinematicsSolver.linkAngVelMap.get('AB')).toBeCloseTo(sign * 2 * Math.PI, 10);
        expect(KinematicsSolver.linkAngVelMap.get('EF')).toBeCloseTo((sign * Math.PI) / 6, 10);
        expect(KinematicsSolver.linkAngAccMap.get('AB')).toBeCloseTo(0, 10);
        expect(KinematicsSolver.linkAngAccMap.get('EF')).toBeCloseTo(0, 10);
        for (const [id, length, omega] of [
          ['B', 5, 2 * Math.PI],
          ['F', 3.4, Math.PI / 6],
        ] as const) {
          const acceleration = KinematicsSolver.jointAccMap.get(id)!;
          expect(Math.hypot(...acceleration)).toBeCloseTo(length * omega * omega, 8);
        }
      }
      m.joints[0].forEach((j) => {
        const end = m.joints.at(-1)!.find((p) => p.id === j.id)!;
        expect(end.x).toBeCloseTo(j.x, 9);
        expect(end.y).toBeCloseTo(j.y, 9);
      });
      expect(gearSample(m, 4320, 'GD', 'Angular Gear Pos')[0]).toBeCloseTo(
        Math.PI / 2 + sign * 2 * Math.PI,
        10
      );
    });
  }
});
