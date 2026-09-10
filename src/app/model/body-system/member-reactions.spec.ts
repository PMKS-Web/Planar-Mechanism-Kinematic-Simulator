import { nativeWeldedLoadedRod } from '../../../test-utils/verification/native-force-fixtures';
import { compileBodyDocument } from './constraint-compiler';
import { admitBodyPartition } from './body-admission';
import { initialBodyContinuation, advanceBodyCommand } from './body-continuation';
import { BodyMotion, solveBodyRates } from './body-rates';
import { groupForceLoads } from './body-force-loads';
import { memberForceLoads } from './member-force-loads';
import { recoverMemberReactions } from './member-reactions';
import { solveBodyEfforts } from './body-efforts';
import { WORLD } from './body-id';
import { rebaseBody } from './rebase-body';
import { SI_UNITS, BodyUnits, unitFactors } from './body-units';
import { add, cross, rotate, scale } from './body-frame';
import { addWrenches, transportWrench, wrenchPower } from './joint-wrenches';
import { BodyDocument } from './body-document';

const STILL: BodyMotion = {
  velocity: { vx: 0, vy: 0, omega: 0 },
  acceleration: { ax: 0, ay: 0, alpha: 0 },
};
const G = 9.80665;
const UNITS: BodyUnits[] = [
  SI_UNITS,
  { length: 'in', mass: 'lb', inertia: 'lb*in2', force: 'lbf' },
];

function reversed(document: BodyDocument): BodyDocument {
  return {
    ...document,
    bodies: [...document.bodies].reverse(),
    joints: [...document.joints].reverse(),
    attachments: [...document.attachments].reverse(),
    forces: [...document.forces].reverse(),
  };
}

describe('native material weld reactions', () => {
  it('recovers the off-axis bracket wrench, transports its reference and conserves internal power', () => {
    for (const units of UNITS)
      for (const rebase of [false, true])
        for (const reverse of [false, true]) {
          const fixture = nativeWeldedLoadedRod(units),
            length = unitFactors(units).length;
          const base = rebase
            ? rebaseBody(fixture.document, fixture.bracket, {
                x: 0.4 / length,
                y: -0.2 / length,
                angle: 0.7,
              })
            : fixture.document;
          const document = reverse ? reversed(base) : base;
          const compiled = compileBodyDocument(document);
          if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues));
          const system = compiled.system,
            admitted = admitBodyPartition(system, system.partitions[0]);
          if (!admitted.ok) throw new Error(admitted.reason);
          const groupId = system.groupOf.get(fixture.body)!;
          let state = initialBodyContinuation(admitted);
          for (const command of [0, 0.4, 1.2]) {
            const advanced = advanceBodyCommand(admitted, state, command);
            if (!advanced.ok) throw new Error(advanced.reason);
            state = advanced.state;
            const rates = solveBodyRates(
              admitted.frame.partition,
              state.poses,
              new Map([[fixture.driver.id, { value: command, velocity: 3, acceleration: -0.5 }]]),
              new Map([[WORLD, STILL]])
            );
            if (!rates.ok) throw new Error(rates.reason);
            for (const mode of ['static', 'dynamic'] as const) {
              const gravity = { x: 0, y: -G };
              const loads = groupForceLoads(
                document,
                system,
                admitted.frame,
                state.poses,
                mode,
                gravity,
                rates
              );
              if (!loads.ok) throw new Error(loads.reason);
              const external = solveBodyEfforts(
                admitted.frame.partition,
                state.poses,
                loads.required
              );
              const members = memberForceLoads(
                document,
                system,
                admitted.frame,
                state.poses,
                groupId,
                mode,
                gravity,
                rates
              );
              const result = recoverMemberReactions(
                document,
                system,
                admitted.frame,
                state.poses,
                groupId,
                members,
                external
              );
              if (!result.ok) throw new Error(result.reason);
              const weld = result.joints.get(fixture.weld.id)!;
              if (!weld.ok) throw new Error(weld.reason);
              expect(weld.basis).toBe('unique');
              const angle = fixture.angle + command;
              const oldOrigin = rotate({ x: 1, y: 1 }, angle);
              const radius = rotate({ x: 0.5, y: 0 }, angle + 0.3);
              const center = add(oldOrigin, radius);
              const acceleration = {
                x: 0.5 * center.y - 9 * center.x,
                y: -0.5 * center.x - 9 * center.y,
              };
              const inertial = mode === 'dynamic' ? scale(acceleration, 3) : { x: 0, y: 0 };
              const expectedForce = add(inertial, { x: 0, y: 10 + 3 * G });
              const tip = rotate({ x: 2, y: 0 }, angle);
              const oldMoment =
                (mode === 'dynamic' ? -0.25 * 0.5 : 0) +
                cross(radius, inertial) +
                10 * (tip.x - oldOrigin.x) +
                3 * G * radius.x -
                3;
              const delta = rebase ? rotate({ x: 0.4, y: -0.2 }, angle + 0.3) : { x: 0, y: 0 };
              const origin = add(oldOrigin, delta);
              expect(weld.b.force.x).toBeCloseTo(expectedForce.x, 8);
              expect(weld.b.force.y).toBeCloseTo(expectedForce.y, 8);
              expect(weld.b.moment).toBeCloseTo(oldMoment - cross(delta, expectedForce), 8);
              const common = addWrenches(weld.a, transportWrench(weld.b, origin));
              expect(common.force.x).toBeCloseTo(0, 8);
              expect(common.force.y).toBeCloseTo(0, 8);
              expect(common.moment).toBeCloseTo(0, 8);
              const power =
                wrenchPower(weld.a, { vx: 0, vy: 0, omega: 3 }) +
                wrenchPower(weld.b, { vx: -3 * origin.y, vy: 3 * origin.x, omega: 3 });
              expect(power).toBeCloseTo(0, 8);
              expect(members.ok).toBe(true);
              if (members.ok) {
                const sumPower = [...members.members.values()].reduce(
                  (sum, member) => sum + member.appliedPower!,
                  0
                );
                const sumEnergy = [...members.members.values()].reduce(
                  (sum, member) => sum + member.kineticEnergyRate!,
                  0
                );
                expect(sumPower).toBeCloseTo(loads.appliedPower!, 8);
                expect(sumEnergy).toBeCloseTo(loads.kineticEnergyRate!, 8);
              }
            }
          }
        }
  });
});
