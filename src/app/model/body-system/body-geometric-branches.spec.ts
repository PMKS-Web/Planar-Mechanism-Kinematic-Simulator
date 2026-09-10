import {
  nativeParallelCranks,
  nativeTwoSlots,
  nativeTwoSlotTip,
  TWO_SLOT_PIVOT,
} from '../../../test-utils/verification/native-redundancy-fixtures';
import { BodyDocument } from './body-document';
import { compileBodyDocument } from './constraint-compiler';
import { admitBodyPartition } from './body-admission';
import { advanceBodyCommand, initialBodyContinuation } from './body-continuation';
import { AttachmentId, newRecordId, WORLD } from './body-id';
import { BodyFactory } from './body-factory';
import { solveFramePoint } from './body-solve-frame';
import { localToWorld, rotate } from './body-frame';
import { bodyRowValue } from './body-constraint-rows';

function runner(document: BodyDocument) {
  const result = compileBodyDocument(document);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  expect(result.system.partitions).toHaveLength(1);
  const admitted = admitBodyPartition(result.system, result.system.partitions[0]);
  if (!admitted.ok) throw new Error(admitted.reason);
  let state = initialBodyContinuation(admitted);
  return {
    admitted,
    advance(command: number) {
      const next = advanceBodyCommand(admitted, state, command);
      if (!next.ok) throw new Error(`${command}: ${next.reason}`);
      state = next.state;
      for (const row of admitted.frame.partition.rows) {
        const commands = new Map([[admitted.frame.partition.drivers[0].id, command]]);
        expect(Math.abs(bodyRowValue(row, state.poses, commands))).toBeLessThan(1e-8);
      }
    },
    point(id: AttachmentId) {
      const at = result.system.attachments.get(id)!;
      const local = localToWorld(
        state.poses.get(at.groupId)!,
        solveFramePoint(admitted.frame, at.groupId, at.point)
      );
      return { x: local.x + admitted.frame.origin.x, y: local.y + admitted.frame.origin.y };
    },
  };
}

describe('native geometric redundancy and shared carriers', () => {
  it('drives one-pin bodies without inventing endpoints, and WORLD does not join their clocks', () => {
    const f = new BodyFactory();
    const cranks = [0, 4].map((x) => {
      const body = f.body('one-pin rod', { x, y: 0, angle: 0.4 }, [
        { x: -1, y: 0 },
        { x: 2, y: 0 },
      ]);
      const pin = f.joint(
        'revolute',
        f.attachment(WORLD, { x, y: 0 }),
        f.attachment(body, { x: 0, y: 0 })
      );
      const witness = f.attachment(body, { x: 2, y: 0.7 });
      const driver = {
        id: newRecordId<'driver'>(),
        coordinate: { jointId: pin.id, coordinate: 'angle' as const },
        profile: { kind: 'constant-speed' as const, initial: 0, speed: 1 },
      };
      return { body, driver, witness, x };
    });
    const doc = { ...f.document, drivers: cranks.map((crank) => crank.driver) };
    const compiled = compileBodyDocument(doc);
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues));
    expect(compiled.system.partitions).toHaveLength(2);
    expect(doc.joints).toHaveLength(2);
    for (const crank of cranks) {
      const part = compiled.system.partitions.find((p) => p.materialIds.includes(crank.body))!;
      expect(part.materialIds).toEqual([crank.body]);
      const admitted = admitBodyPartition(compiled.system, part);
      if (!admitted.ok) throw new Error(admitted.reason);
      let state = initialBodyContinuation(admitted);
      for (const command of [0.3, Math.PI, 2 * Math.PI, 0]) {
        const next = advanceBodyCommand(admitted, state, command);
        if (!next.ok) throw new Error(next.reason);
        state = next.state;
        const a = compiled.system.attachments.get(crank.witness)!;
        const point = localToWorld(
          state.poses.get(a.groupId)!,
          solveFramePoint(admitted.frame, a.groupId, a.point)
        );
        const expected = rotate({ x: 2, y: 0.7 }, 0.4 + command);
        expect(point.x + admitted.frame.origin.x).toBeCloseTo(crank.x + expected.x, 9);
        expect(point.y + admitted.frame.origin.y).toBeCloseTo(expected.y, 9);
        expect(
          [...state.poses.keys()].every((id) => id === WORLD || part.unknowns.includes(id))
        ).toBe(true);
      }
    }
  });

  it('carries a geometrically redundant third crank through two turns, exact singular samples and retracing', () => {
    const { document, witness, angle } = nativeParallelCranks();
    for (const candidate of [
      document,
      {
        ...document,
        bodies: [...document.bodies].reverse(),
        joints: [...document.joints].reverse(),
      },
    ]) {
      const solve = runner(candidate);
      expect(solve.admitted.mobility).toMatchObject({ status: 'second-order', dof: 1 });
      const angles = [
        ...Array.from({ length: 180 }, (_, i) => angle + ((i + 1) * 4 * Math.PI) / 180),
        Math.PI,
        2 * Math.PI,
        3 * Math.PI,
      ].sort((a, b) => a - b);
      for (const heading of [...angles, ...angles.slice().reverse(), angle]) {
        solve.advance(heading - angle);
        const actual = solve.point(witness);
        expect(actual.x).toBeCloseTo(2 + Math.cos(heading), 7);
        expect(actual.y).toBeCloseTo(0.6 + Math.sin(heading), 7);
      }
    }
  });

  it('keeps two independently rotating riders on their own carrier slots through a whole turn', () => {
    const { document, riders, angle } = nativeTwoSlots();
    expect(document.bodies).toHaveLength(4);
    expect(document.joints).toHaveLength(5);
    for (const candidate of [
      document,
      {
        ...document,
        attachments: [...document.attachments].reverse(),
        joints: [...document.joints].reverse(),
      },
    ]) {
      const solve = runner(candidate);
      expect(solve.admitted.mobility.dof).toBe(1);
      for (let i = 0; i <= 180; i++) {
        const heading = angle + (i * 2 * Math.PI) / 180;
        solve.advance(heading - angle);
        for (const rider of riders) {
          const expected = nativeTwoSlotTip(heading, rider.radius);
          const actual = solve.point(rider.at);
          expect(actual.x).toBeCloseTo(expected.x, 8);
          expect(actual.y).toBeCloseTo(expected.y, 8);
          const c = TWO_SLOT_PIVOT;
          const bodyAngle = Math.atan2(expected.y - c.y, expected.x - c.x);
          const offset = rotate({ x: rider.radius / 2, y: 0.3 }, bodyAngle);
          const witness = solve.point(rider.witness);
          expect(witness.x).toBeCloseTo(c.x + offset.x, 8);
          expect(witness.y).toBeCloseTo(c.y + offset.y, 8);
        }
      }
    }
  });
});
