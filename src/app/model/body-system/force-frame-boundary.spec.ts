import { nativeDrivenCarrierCarriage } from '../../../test-utils/verification/native-force-fixtures';
import { compileBodyDocument } from './constraint-compiler';
import { admitBodyPartition } from './body-admission';
import { CompiledBodyPartition } from './compiled-body-system';
import { createBodySolveFrame } from './body-solve-frame';
import { numericalGroupRates } from './body-point-rates';
import { BodyMotion, solveBodyRates } from './body-rates';
import { solveBodyForceFrame } from './body-force-frame';
import { driverForceValue, jointBodyWrench } from './force-frame-result';
import { WORLD } from './body-id';

const STILL: BodyMotion = {
  velocity: { vx: 0, vy: 0, omega: 0 },
  acceleration: { ax: 0, ay: 0, alpha: 0 },
};
const OMEGA = 0.8,
  ALPHA = 0.4;

describe('native force-frame boundary work', () => {
  it('matches cotangent carriage motion and accounts for nonzero work from a rotating prescribed carrier', () => {
    const fixture = nativeDrivenCarrierCarriage(),
      compiled = compileBodyDocument(fixture.document);
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues));
    const system = compiled.system,
      admitted = admitBodyPartition(system, system.partitions[0]);
    if (!admitted.ok) throw new Error(admitted.reason);
    const b = system.groupOf.get(fixture.carriage)!,
      a = system.groupOf.get(fixture.carrier)!;
    const sine = Math.sin(fixture.angle),
      cosine = Math.cos(fixture.angle);
    const vx = -OMEGA / (sine * sine);
    const ax = (2 * cosine * OMEGA * OMEGA) / (sine * sine * sine) - ALPHA / (sine * sine);
    const normal = (-2 * ax) / sine;
    const couple = 0.3 * ALPHA;
    const carrierWork = (fixture.travel * normal + couple) * OMEGA;
    const carriageEnergy = 2 * vx * ax + 0.3 * OMEGA * ALPHA;
    const fullRates = solveBodyRates(
      admitted.frame.partition,
      admitted.poses,
      new Map([[fixture.driver.id, { value: 0, velocity: OMEGA, acceleration: ALPHA }]]),
      new Map([[WORLD, STILL]])
    );
    if (!fullRates.ok) throw new Error(fullRates.reason);
    const full = solveBodyForceFrame(
      fixture.document,
      system,
      admitted.frame,
      {
        sample: {
          revision: 1,
          partitionKey: admitted.frame.partition.key,
          index: 0,
          time: 0,
          command: 0,
          direction: 1,
        },
        pose: { ok: true, poses: admitted.poses, commands: admitted.commands },
        rates: fullRates,
      },
      { mode: 'dynamic', gravity: { x: 0, y: 0 } }
    );
    if (!full.ok) throw new Error(full.reason);
    const effort = driverForceValue(full, fixture.driver.id);
    if (!effort.ok) throw new Error(effort.reason);
    expect(effort.value.value).toBeCloseTo(3 * ALPHA + fixture.travel * normal + couple, 8);
    const guide = jointBodyWrench(full, fixture.guide.id, fixture.carriage);
    if (!guide.ok) throw new Error(guide.reason);
    expect(guide.value.force.x).toBeCloseTo(-sine * normal, 8);
    expect(guide.value.force.y).toBeCloseTo(cosine * normal, 8);
    expect(guide.value.moment).toBeCloseTo(couple, 8);

    // Same physical carriage, now asking only for its subsystem with prescribed carrier motion.
    const part: CompiledBodyPartition = {
      key: 'prescribed carrier',
      unknowns: [b],
      boundary: [a, WORLD],
      rows: system.partitions[0].rows.filter(
        (row) => row.jointId === fixture.guide.id || row.jointId === fixture.slot.id
      ),
      drivers: [],
      limits: [],
      materialIds: [fixture.carriage],
    };
    const worldPoses = new Map([...system.groups].map(([id, group]) => [id, group.pose]));
    const frame = createBodySolveFrame(part, worldPoses);
    const motion: BodyMotion = {
      velocity: { vx: 0, vy: 0, omega: OMEGA },
      acceleration: { ax: 0, ay: 0, alpha: ALPHA },
    };
    const boundary = numericalGroupRates(frame, a, worldPoses.get(a)!, motion)!;
    const rates = solveBodyRates(
      frame.partition,
      frame.initialPoses,
      new Map(),
      new Map([
        [a, boundary],
        [WORLD, STILL],
      ])
    );
    if (!rates.ok) throw new Error(rates.reason);
    expect(rates.motions.get(b)!.velocity.vx).toBeCloseTo(vx, 10);
    expect(rates.motions.get(b)!.acceleration.ax).toBeCloseTo(ax, 10);
    const result = solveBodyForceFrame(
      fixture.document,
      system,
      frame,
      {
        sample: {
          revision: 1,
          partitionKey: part.key,
          index: 0,
          time: 0,
          command: 0,
          direction: 1,
        },
        pose: { ok: true, poses: frame.initialPoses, commands: new Map() },
        rates,
      },
      { mode: 'dynamic', gravity: { x: 0, y: 0 } }
    );
    if (!result.ok) throw new Error(result.reason);
    expect(result.drivers.size).toBe(0);
    expect(result.power.ok).toBe(true);
    if (result.power.ok) {
      expect(result.power.value.driver).toBeCloseTo(0, 12);
      expect(result.power.value.boundary).toBeCloseTo(carrierWork, 8);
      expect(Math.abs(result.power.value.boundary)).toBeGreaterThan(1);
      expect(result.power.value.kineticEnergyRate).toBeCloseTo(carriageEnergy, 8);
      expect(result.power.value.residual).toBeCloseTo(0, 8);
    }
    const localGuide = jointBodyWrench(result, fixture.guide.id, fixture.carriage);
    if (!localGuide.ok) throw new Error(localGuide.reason);
    expect(localGuide.value.force.x).toBeCloseTo(-sine * normal, 8);
    expect(localGuide.value.force.y).toBeCloseTo(cosine * normal, 8);
    expect(localGuide.value.moment).toBeCloseTo(couple, 8);
  });
});
