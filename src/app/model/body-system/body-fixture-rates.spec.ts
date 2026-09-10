import { nativeAxialCarriage } from '../../../test-utils/verification/native-cylinder-fixtures';
import { nativeParallelCranks } from '../../../test-utils/verification/native-redundancy-fixtures';
import { nativeParallelogram } from '../../../test-utils/verification/native-body-fixtures';
import { compileBodyDocument } from './constraint-compiler';
import { admitBodyPartition } from './body-admission';
import { advanceBodyCommand, initialBodyContinuation } from './body-continuation';
import { BodyDocument } from './body-document';
import { BodyMotion, solveBodyRates } from './body-rates';
import { bodyPointRates } from './body-point-rates';
import { solveFramePoint } from './body-solve-frame';
import { WORLD } from './body-id';

const STILL: BodyMotion = {
  velocity: { vx: 0, vy: 0, omega: 0 },
  acceleration: { ax: 0, ay: 0, alpha: 0 },
};
function setup(document: BodyDocument) {
  const compiled = compileBodyDocument(document);
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues));
  const admitted = admitBodyPartition(compiled.system, compiled.system.partitions[0]);
  if (!admitted.ok) throw new Error(admitted.reason);
  return { system: compiled.system, admitted, initial: initialBodyContinuation(admitted) };
}

describe('rates of native continued mechanisms', () => {
  it('answers the axial carriage closed form at pinned and welded ram mounts, including small rates', () => {
    for (const connection of ['revolute', 'weld'] as const)
      for (const heading of [0, 1.1])
        for (const speed of [0.2, 1e-12]) {
          const fixture = nativeAxialCarriage(connection, heading);
          const { system, admitted, initial } = setup(fixture.document);
          const advanced = advanceBodyCommand(admitted, initial, 0.8);
          if (!advanced.ok) throw new Error(advanced.reason);
          const rates = solveBodyRates(
            admitted.frame.partition,
            advanced.state.poses,
            new Map([
              [fixture.driver.id, { value: 0.8, velocity: speed, acceleration: speed * 1.5 }],
            ]),
            new Map([[WORLD, STILL]])
          );
          if (!rates.ok) throw new Error(`${connection}, ${heading}, ${speed}: ${rates.reason}`);
          const a = system.attachments.get(fixture.witness)!;
          const motion = rates.motions.get(a.groupId)!;
          const point = bodyPointRates(
            advanced.state.poses.get(a.groupId)!,
            solveFramePoint(admitted.frame, a.groupId, a.point),
            motion
          )!;
          expect(point.velocity.x / speed).toBeCloseTo(Math.cos(heading), 10);
          expect(point.velocity.y / speed).toBeCloseTo(Math.sin(heading), 10);
          expect(point.acceleration.x / speed).toBeCloseTo(1.5 * Math.cos(heading), 10);
          expect(point.acceleration.y / speed).toBeCloseTo(1.5 * Math.sin(heading), 10);
          expect(motion.velocity.omega / speed).toBeCloseTo(0, 10);
          expect(motion.acceleration.alpha / speed).toBeCloseTo(0, 10);
        }
  });

  it('differentiates the geometrically redundant parallel branch without inventing coupler rotation', () => {
    const fixture = nativeParallelCranks();
    const { system, admitted, initial } = setup(fixture.document);
    const step = advanceBodyCommand(admitted, initial, 0.4);
    if (!step.ok) throw new Error(step.reason);
    const driver = fixture.document.drivers[0];
    const rates = solveBodyRates(
      admitted.frame.partition,
      step.state.poses,
      new Map([[driver.id, { value: 0.4, velocity: 0.8, acceleration: -0.2 }]]),
      new Map([[WORLD, STILL]])
    );
    if (!rates.ok) throw new Error(rates.reason);
    const at = system.attachments.get(fixture.witness)!;
    const motion = rates.motions.get(at.groupId)!;
    const point = bodyPointRates(
      step.state.poses.get(at.groupId)!,
      solveFramePoint(admitted.frame, at.groupId, at.point),
      motion
    )!;
    const theta = fixture.angle + 0.4;
    expect(point.velocity.x).toBeCloseTo(-0.8 * Math.sin(theta), 9);
    expect(point.velocity.y).toBeCloseTo(0.8 * Math.cos(theta), 9);
    expect(point.acceleration.x).toBeCloseTo(-0.64 * Math.cos(theta) + 0.2 * Math.sin(theta), 9);
    expect(point.acceleration.y).toBeCloseTo(-0.64 * Math.sin(theta) - 0.2 * Math.cos(theta), 9);
    expect(motion.velocity.omega).toBeCloseTo(0, 10);
    expect(motion.acceleration.alpha).toBeCloseTo(0, 10);
  });

  it('does not report the preceding rates at a singular pose on an admitted branch and recovers after it', () => {
    const fixture = nativeParallelogram();
    const { admitted, initial } = setup(fixture.document);
    let state = initial;
    for (const [command, ok] of [
      [0, true],
      [Math.PI - 0.7, false],
      [Math.PI - 0.6, true],
    ] as const) {
      const step = advanceBodyCommand(admitted, state, command);
      if (!step.ok) throw new Error(step.reason);
      state = step.state;
      const result = solveBodyRates(
        admitted.frame.partition,
        state.poses,
        new Map([[fixture.driver.id, { value: command, velocity: 1, acceleration: 0 }]]),
        new Map([[WORLD, STILL]])
      );
      expect(result.ok).toBe(ok);
      if (!ok) expect(result).toEqual({ ok: false, reason: 'rank' });
    }
  });
});
