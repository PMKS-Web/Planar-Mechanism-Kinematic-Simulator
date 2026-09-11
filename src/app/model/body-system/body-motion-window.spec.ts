import { nativeLinearCarriage } from '../../../test-utils/verification/native-linear-carriage-fixture';
import { nativeDrivenCarrierCarriage } from '../../../test-utils/verification/native-force-fixtures';
import { buildSimulationSnapshot } from './build-simulation-snapshot';
import { selectSimulationView } from './simulation-view';
import { simulationBodyPose, simulationBodyMotion } from './simulation-body-readers';
import { simulationCoordinateRates } from './simulation-coordinate-readers';
import { simulationDriverEffort } from './simulation-force-readers';
import { SimulationValue } from './simulation-values';
import { BodyUnits, SI_UNITS } from './body-units';
import { newRecordId } from './body-id';

function value<T>(result: SimulationValue<T>): T {
  if (!result.ok) throw new Error(result.reason);
  return result.value;
}
const ENGLISH: BodyUnits = { length: 'in', mass: 'lb', inertia: 'lb*in2', force: 'lbf' };

describe('native nonlooping analysis windows', () => {
  it('keeps unbounded translation and endpoint rates without inventing a reversal in either direction or unit system', () => {
    for (const units of [SI_UNITS, ENGLISH])
      for (const speed of [0.3, -0.3]) {
        const fixture = nativeLinearCarriage(speed, units);
        const result = buildSimulationSnapshot(fixture.document, 4, {
          mode: 'dynamic',
          gravity: { x: 0, y: 0 },
          path: { duration: 2.3, commandStep: 0.2 },
        });
        if (!result.ok) throw new Error(JSON.stringify(result));
        const snapshot = result.snapshot,
          key = snapshot.bodyPartition.get(fixture.body)!;
        const part = snapshot.partitions.get(key)!;
        if (!part.ok) throw new Error(part.reason);
        expect(part.path).toMatchObject({
          kind: 'window',
          end: 'duration',
          duration: expect.closeTo(2.3, 12),
        });
        expect(part.inputs.some((input) => input.reversal)).toBe(false);
        for (const [index, input] of part.inputs.entries()) {
          const selected = value(
            selectSimulationView(snapshot, { revision: 4, indices: new Map([[key, index]]) })
          );
          const pose = value(simulationBodyPose(selected, fixture.body));
          expect(pose.x).toBeCloseTo(2 + speed * input.sample.time * Math.cos(fixture.angle), 9);
          expect(pose.y).toBeCloseTo(-1 + speed * input.sample.time * Math.sin(fixture.angle), 9);
          expect(pose.angle).toBeCloseTo(fixture.angle, 10);
          const motion = value(simulationBodyMotion(selected, fixture.body));
          expect(motion.velocity.vx).toBeCloseTo(speed * Math.cos(fixture.angle), 10);
          expect(motion.velocity.vy).toBeCloseTo(speed * Math.sin(fixture.angle), 10);
          expect(motion.acceleration.ax).toBeCloseTo(0, 10);
          expect(motion.acceleration.ay).toBeCloseTo(0, 10);
          const coordinate = value(simulationCoordinateRates(selected, fixture.driver.coordinate));
          expect(coordinate.value).toBeCloseTo(speed * input.sample.time, 10);
          expect(coordinate.velocity).toBeCloseTo(speed, 10);
          expect(coordinate.acceleration).toBeCloseTo(0, 10);
          expect(simulationDriverEffort(selected, fixture.driver.id).ok).toBe(true);
        }
      }
  });

  it('ends early at a real bound, refuses exhausted budgets atomically and leaves later builds usable', () => {
    const fixture = nativeLinearCarriage();
    const options = {
      mode: 'dynamic' as const,
      gravity: { x: 0, y: 0 },
      path: { duration: 2, commandStep: 0.1 },
    };
    const document = {
      ...fixture.document,
      limits: [
        {
          id: newRecordId<'limit'>(),
          coordinate: fixture.driver.coordinate,
          lower: -1,
          upper: 0.4,
        },
      ],
    };
    for (const extra of [{ maxSamples: 2 }, { maxIntervalProbes: 1 }]) {
      const failed = buildSimulationSnapshot(document, 1, {
        ...options,
        path: { ...options.path, ...extra },
      });
      if (!failed.ok) throw new Error(failed.reason);
      expect([...failed.snapshot.partitions.values()]).toEqual([
        expect.objectContaining({ ok: false, stage: 'trajectory', reason: 'unsolved' }),
      ]);
    }
    const result = buildSimulationSnapshot(document, 1, options);
    if (!result.ok) throw new Error(result.reason);
    const key = result.snapshot.bodyPartition.get(fixture.body)!,
      part = result.snapshot.partitions.get(key)!;
    if (!part.ok) throw new Error(part.reason);
    expect(part.path).toMatchObject({
      kind: 'window',
      end: 'stop',
      duration: expect.closeTo(4 / 3, 8),
      requestedDuration: 2,
    });
    expect(part.inputs.at(-1)!.reversal).toBe(true);
    expect(part.inputs.at(-1)!.rates).toEqual({ ok: false, reason: 'reversal' });
    expect(part.inputs.slice(0, -1).every((input) => input.rates?.ok)).toBe(true);
  });

  it('reads the rotating guide and horizontal slot coordinates against csc(theta) and cot(theta)', () => {
    const fixture = nativeDrivenCarrierCarriage();
    const result = buildSimulationSnapshot(fixture.document, 2, {
      mode: 'dynamic',
      gravity: { x: 0, y: -9.81 },
      path: { duration: 0.75, commandStep: 0.08 },
    });
    if (!result.ok) throw new Error(result.reason);
    const snapshot = result.snapshot,
      key = snapshot.bodyPartition.get(fixture.carriage)!,
      part = snapshot.partitions.get(key)!;
    if (!part.ok) throw new Error(part.reason);
    for (const [index, input] of part.inputs.entries()) {
      const selected = value(
        selectSimulationView(snapshot, { revision: 2, indices: new Map([[key, index]]) })
      );
      const theta = fixture.angle + 0.8 * input.sample.time,
        sin = Math.sin(theta),
        cos = Math.cos(theta);
      const travel = value(
        simulationCoordinateRates(selected, { jointId: fixture.guide.id, coordinate: 'travel' })
      );
      expect(travel.value).toBeCloseTo(1 / sin - fixture.travel, 9);
      expect(travel.velocity).toBeCloseTo((-0.8 * cos) / sin ** 2, 9);
      expect(travel.acceleration).toBeCloseTo((0.64 * (1 + cos ** 2)) / sin ** 3, 9);
      const slot = value(
        simulationCoordinateRates(selected, { jointId: fixture.slot.id, coordinate: 'travel' })
      );
      expect(slot.value).toBeCloseTo(cos / sin - 1 / Math.tan(fixture.angle), 9);
      expect(slot.velocity).toBeCloseTo(-0.8 / sin ** 2, 9);
      expect(slot.acceleration).toBeCloseTo((1.28 * cos) / sin ** 3, 9);
      const pose = value(simulationBodyPose(selected, fixture.carriage));
      expect(pose.x).toBeCloseTo(cos / sin, 9);
      expect(pose.y).toBeCloseTo(1, 9);
      const motion = value(simulationBodyMotion(selected, fixture.carriage));
      expect(motion.acceleration.ax).toBeCloseTo((1.28 * cos) / sin ** 3, 9);
      expect(motion.acceleration.ay).toBeCloseTo(0, 9);
    }
  });
});
