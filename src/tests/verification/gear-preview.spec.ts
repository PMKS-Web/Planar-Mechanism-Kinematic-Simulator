import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildMechanism } from '../../test-utils/verification/fixture';
import {
  GEAR_PAIR,
  GEAR_FOUR_BAR,
  GEAR_FIVE_TURNS,
} from '../../test-utils/verification/gear-fixtures';
import { PositionSolver } from '../../app/model/mechanism/position-solver';

/** The temporary viewer consumes actual solver samples, never a second simulation. */
describe('gear preview data', () => {
  it('exports validated fixture samples only when explicitly requested', () => {
    if (process.env['PMKS_WRITE_GEAR_PREVIEW'] !== '1') return;
    const cases = Object.entries({
      pair: GEAR_PAIR,
      fourbar: GEAR_FOUR_BAR,
      five: GEAR_FIVE_TURNS,
    }).flatMap(([id, fixture]) =>
      [1, -1].map((direction) => {
        const mechanism = buildMechanism({
          ...fixture,
          inputAngVel: direction * 2 * Math.PI,
        }).mechanism;
        expect(mechanism.isMechanismValid(), `${id}: ${mechanism.failure}`).toBe(true);
        mechanism.prepareSolvers();
        return {
          id,
          direction,
          period: mechanism.cyclePeriod,
          gears: fixture.transmission.gears,
          links: fixture.links.map((link) => ({ id: link.joints, points: [...link.joints] })),
          samples: mechanism.joints.map((joints, index) => {
            const rates = PositionSolver.constraintKinematics(
              joints,
              mechanism.links[index],
              mechanism.inputAngularVelocities[index]
            );
            expect(rates, `${id} frame ${index} has complete audited rates`).toBeDefined();
            return {
              q: mechanism.gearTravel[index],
              time: mechanism.timeNum[index],
              points: Object.fromEntries(
                joints.map((joint) => [
                  joint.id,
                  {
                    x: joint.x,
                    y: joint.y,
                    velocity: rates!.velocity.get(joint.id),
                    acceleration: rates!.acceleration.get(joint.id),
                  },
                ])
              ),
              angles: Object.fromEntries(mechanism.gearMotionAtSample(index)!.angles),
            };
          }),
        };
      })
    );
    const directory = resolve('artifacts/gears');
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      resolve(directory, 'samples.json'),
      JSON.stringify({ generatedAt: new Date().toISOString(), cases })
    );
  });
});
