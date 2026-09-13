import { nativeTranslatingCylinder } from '../../../test-utils/verification/native-translating-cylinder-fixture';
import { compileBodyDocument } from './constraint-compiler';
import { admitBodyPartition } from './body-admission';
import { initialBodyContinuation } from './body-continuation';
import { solveBodyRates } from './body-rates';
import { STILL_BODY_MOTION } from './simulation-body-context';
import { newRecordId } from './body-id';
import { factorBodyRows } from './body-linear-algebra';
import { projectedRowRoundoff } from './body-rates';

describe('round-off carried from velocity into redundant acceleration rows', () => {
  it('allows constant-speed translation but still rejects a contradictory acceleration across rate scales', () => {
    for (const reverse of [false, true]) {
      const f = nativeTranslatingCylinder(reverse, reverse),
        c = compileBodyDocument(f.document);
      if (!c.ok) throw Error('compile');
      const a = admitBodyPartition(c.system, c.system.partitions[0]);
      if (!a.ok) throw Error(a.reason);
      const state = initialBodyContinuation(a),
        part = a.frame.partition;
      const boundary = new Map(part.boundary.map((id) => [id, STILL_BODY_MOTION]));
      for (const speed of [1e-12, 0.2, 1, 1e8]) {
        const command = { value: state.command, velocity: speed, acceleration: 0 };
        const commands = new Map([[f.driver.id, command]]);
        const result = solveBodyRates(part, state.poses, commands, boundary);
        if (!result.ok) throw Error(result.reason);
        for (const motion of result.motions.values()) {
          expect(motion.velocity.omega / speed).toBeCloseTo(0, 12);
          expect(motion.acceleration.ax / (speed * speed)).toBeCloseTo(0, 12);
          expect(motion.acceleration.ay / (speed * speed)).toBeCloseTo(0, 12);
          expect(motion.acceleration.alpha / (speed * speed)).toBeCloseTo(0, 12);
        }
        const extraId = newRecordId<'driver'>();
        const duplicate = {
          ...part.drivers[0].row,
          key: 'conflicting acceleration',
          commandId: extraId,
        };
        const conflict = new Map([
          ...commands,
          [extraId, { ...command, acceleration: 1e-6 * speed * speed }],
        ]);
        expect(
          solveBodyRates(
            { ...part, rows: [...part.rows, duplicate] },
            state.poses,
            conflict,
            boundary
          )
        ).toEqual({ ok: false, reason: 'acceleration-inconsistent' });
      }
    }
  });
  it("propagates a redundant row's error through its residual projection without lending it to an unrelated row", () => {
    const factor = factorBodyRows(
      [
        [1, 0],
        [1, 0],
        [0, 1],
        [0, 1],
      ],
      2
    )!;
    const error = projectedRowRoundoff(factor, [2, 0, 0, 0]);
    expect(error[0]).toBeCloseTo(1, 12);
    expect(error[1]).toBeCloseTo(1, 12);
    expect(error[2]).toBe(0);
    expect(error[3]).toBe(0);
  });
});
