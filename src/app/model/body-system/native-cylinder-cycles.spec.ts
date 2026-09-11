import { nativeAxialCylinderExample } from '../../../test-utils/verification/native-axial-cylinder-example';
import { nativeObliqueCylinder } from '../../../test-utils/verification/native-oblique-cylinder-fixture';
import { nativeTranslatingCylinder } from '../../../test-utils/verification/native-translating-cylinder-fixture';
import { nativeRotatingCylinder } from '../../../test-utils/verification/native-rotating-cylinder-fixture';
import { nativeWeldedCylinder } from '../../../test-utils/verification/native-welded-cylinder-fixture';
import { buildSimulationSnapshot } from './build-simulation-snapshot';
import { selectSimulationView } from './simulation-view';
import { simulationBodyPose, simulationBodyMotion } from './simulation-body-readers';
import { simulationDriverEffort } from './simulation-force-readers';
import { SimulationValue } from './simulation-values';
import { compileBodyDocument } from './constraint-compiler';
import { admitBodyPartition } from './body-admission';
import { advanceBodyCommand, initialBodyContinuation } from './body-continuation';
import { inspectBodyInterval } from './body-interval';
import { localToWorld, add } from './body-frame';
import { solveFramePoint } from './body-solve-frame';
import { bodyCycleInputs } from './body-cycle-inputs';
import { buildBodyCycle } from './body-cycle';

function value<T>(result: SimulationValue<T>): T {
  if (!result.ok) throw new Error(result.reason);
  return result.value;
}
const rotatingDuration = 10 * (Math.acos(0.5 / Math.sqrt(41)) - Math.asin(4 / Math.sqrt(41)));
const cases = [
  { name: 'axial carriage', make: () => nativeAxialCylinderExample(), duration: 15 },
  { name: 'welded axial carriage', make: () => nativeAxialCylinderExample('weld'), duration: 15 },
  { name: 'oblique near root', make: () => nativeObliqueCylinder(), duration: 15 },
  { name: 'oblique far root', make: () => nativeObliqueCylinder(2, -1), duration: 15 },
  { name: 'translating bracket', make: () => nativeTranslatingCylinder(), duration: 15 },
  { name: 'reversed translating guide', make: () => nativeTranslatingCylinder(true), duration: 15 },
  { name: 'rotating carrier', make: () => nativeRotatingCylinder(), duration: rotatingDuration },
  { name: 'selective welded bracket', make: () => nativeWeldedCylinder(), duration: 15 },
];
describe('complete native cylinder example cycles', () => {
  for (const example of cases)
    it(
      example.name + ': hand motion, physical stops, unavailable reversal rates and return',
      () => {
        const fixture = example.make(),
          built = buildSimulationSnapshot(fixture.document, 3, {
            mode: 'dynamic',
            gravity: { x: 0, y: 0 },
            path: { commandStep: 0.08 },
          });
        if (!built.ok) throw new Error(built.reason);
        const snapshot = built.snapshot,
          key = [...snapshot.partitions.keys()][0],
          part = snapshot.partitions.get(key)!;
        if (!part.ok) throw new Error(part.reason);
        expect(part.path.kind).toBe('retrace');
        expect(part.path.duration).toBeCloseTo(example.duration, 7);
        expect(part.path.samples.filter((sample) => sample.stop).length).toBe(2);
        const seen = new Set<number>();
        for (const [index, input] of part.inputs.entries()) {
          const view = value(
            selectSimulationView(snapshot, { revision: 3, indices: new Map([[key, index]]) })
          );
          const speed = input.sample.direction * Math.abs(fixture.driver.profile.speed);
          const expected = fixture.hand(input.sample.command, speed, 0);
          for (const [id, hand] of expected) {
            const pose = value(simulationBodyPose(view, id));
            expect(pose.x).toBeCloseTo(hand.point.x, 7);
            expect(pose.y).toBeCloseTo(hand.point.y, 7);
            expect(Math.cos(pose.angle - hand.angle.value)).toBeCloseTo(1, 9);
            if (input.reversal) {
              // A fixed material member may still have exact zero motion independently of a clock.
              if (!snapshot.system.groups.get(snapshot.system.groupOf.get(id)!)!.fixed)
                expect(simulationBodyMotion(view, id)).toEqual({ ok: false, reason: 'reversal' });
            } else {
              const actual = value(simulationBodyMotion(view, id));
              expect(actual.velocity.vx).toBeCloseTo(hand.velocity.x, 7);
              expect(actual.velocity.vy).toBeCloseTo(hand.velocity.y, 7);
              expect(actual.acceleration.ax).toBeCloseTo(hand.acceleration.x, 7);
              expect(actual.acceleration.ay).toBeCloseTo(hand.acceleration.y, 7);
              expect(actual.velocity.omega).toBeCloseTo(hand.angle.velocity, 7);
              expect(actual.acceleration.alpha).toBeCloseTo(hand.angle.acceleration, 7);
            }
          }
          if (input.reversal)
            expect(simulationDriverEffort(view, fixture.driver.id)).toEqual({
              ok: false,
              reason: 'reversal',
            });
          else expect(simulationDriverEffort(view, fixture.driver.id).ok).toBe(true);
          if (!input.reversal) seen.add(input.sample.direction);
        }
        expect([...seen].sort()).toEqual([-1, 1]);
      }
    );

  it('proves the oblique tangency instead of accepting an infeasible length or switching to the other root', () => {
    for (const branch of [1, -1] as const)
      for (const reverse of [false, true]) {
        const fixture = nativeObliqueCylinder(3.2, branch, reverse, reverse),
          compiled = compileBodyDocument(fixture.document);
        if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues));
        const admitted = admitBodyPartition(compiled.system, compiled.system.partitions[0]);
        if (!admitted.ok) throw new Error(admitted.reason);
        const start = initialBodyContinuation(admitted),
          before = JSON.stringify([...start.poses]);
        expect(advanceBodyCommand(admitted, start, 0.1).ok).toBe(false);
        expect(JSON.stringify([...start.poses])).toBe(before);
        const interval = inspectBodyInterval(admitted, start, 0.1);
        if (!interval.ok) throw new Error(interval.reason);
        expect(interval.stop?.kind).toBe('fold');
        expect(interval.probes).toBeLessThan(32);
        expect(interval.state.command).toBeCloseTo(0.2, 8);
        const anchor = compiled.system.attachments.get(fixture.assembly.barrelMount)!;
        const point = add(
          localToWorld(
            interval.state.poses.get(anchor.groupId)!,
            solveFramePoint(admitted.frame, anchor.groupId, anchor.point)
          ),
          admitted.frame.origin
        );
        expect(point.x).toBeCloseTo(4 * Math.cos(0.4), 7);
        expect(point.y).toBeCloseTo(4 * Math.sin(0.4), 7);
        const cycle = buildBodyCycle(admitted, { commandStep: 0.08 });
        if (!cycle.ok) throw new Error(cycle.reason);
        expect(cycle.duration).toBeCloseTo(13, 7);
        expect(cycle.samples.filter((sample) => sample.stop?.kind === 'fold').length).toBe(1);
        const inputs = bodyCycleInputs(admitted, cycle, 3);
        if (!inputs.ok) throw new Error(inputs.reason);
        for (const input of inputs.inputs.filter((input) => input.reversal))
          expect(input.rates).toEqual({ ok: false, reason: 'reversal' });
        expect(advanceBodyCommand(admitted, start, 0.5).ok).toBe(true);
      }
  });
});
