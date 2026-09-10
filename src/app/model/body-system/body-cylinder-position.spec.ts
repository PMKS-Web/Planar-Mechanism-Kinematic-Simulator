import { nativeAxialCarriage } from '../../../test-utils/verification/native-cylinder-fixtures';
import { compileBodyDocument } from './constraint-compiler';
import { admitBodyPartition } from './body-admission';
import { advanceBodyCommand, initialBodyContinuation } from './body-continuation';
import { solveFramePoint } from './body-solve-frame';
import { localToWorld, rotate } from './body-frame';
import { bodyRowValue } from './body-constraint-rows';
import { newRecordId } from './body-id';

describe('native cylinder and external mount constraints', () => {
  it('moves a ram and carriage without synthetic parts at pinned and welded mounts', () => {
    for (const connection of ['revolute', 'weld'] as const)
      for (const heading of [0, 0.7, -1.1]) {
        const fixture = nativeAxialCarriage(connection, heading);
        const compiled = compileBodyDocument(fixture.document);
        if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues));
        const system = compiled.system,
          admitted = admitBodyPartition(system, system.partitions[0]);
        if (!admitted.ok) throw new Error(`${connection}: ${admitted.reason}`);
        expect(fixture.document.bodies.length).toBe(4);
        expect(fixture.document.joints.length).toBe(4);
        expect(system.partitions[0].unknowns.length).toBe(connection === 'weld' ? 1 : 2);
        expect(admitted.mobility.dof).toBe(1);
        let state = initialBodyContinuation(admitted);
        const witness = system.attachments.get(fixture.witness)!;
        for (const command of [0, 0.2, 0.8, 1.5, 0.4]) {
          const result = advanceBodyCommand(admitted, state, command);
          if (!result.ok) throw new Error(`${connection} at ${command}: ${result.reason}`);
          state = result.state;
          const point = localToWorld(
            state.poses.get(witness.groupId)!,
            solveFramePoint(admitted.frame, witness.groupId, witness.point)
          );
          const mount = localToWorld(fixture.origin, { x: 3 + command, y: 0 });
          const offAxis = rotate({ x: 0.7, y: 0.6 }, heading + 0.3);
          expect(point.x + admitted.frame.origin.x).toBeCloseTo(mount.x + offAxis.x, 10);
          expect(point.y + admitted.frame.origin.y).toBeCloseTo(mount.y + offAxis.y, 10);
          for (const row of admitted.frame.partition.rows)
            expect(
              bodyRowValue(row, state.poses, new Map([[fixture.driver.id, command]]))
            ).toBeCloseTo(0, 10);
        }
        expect(advanceBodyCommand(admitted, state, 1.6)).toMatchObject({
          ok: false,
          reason: 'travel',
        });
      }
  });

  it('enforces a tighter passive carriage stop even while the driven ram is inside its own stroke', () => {
    const fixture = nativeAxialCarriage();
    const document = {
      ...fixture.document,
      limits: [
        ...fixture.document.limits,
        {
          id: newRecordId<'limit'>(),
          coordinate: { jointId: fixture.guide.id, coordinate: 'travel' as const },
          lower: -0.3,
          upper: 0.6,
        },
      ],
    };
    const compiled = compileBodyDocument(document);
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues));
    const system = compiled.system,
      admitted = admitBodyPartition(system, system.partitions[0]);
    if (!admitted.ok) throw new Error(admitted.reason);
    const start = initialBodyContinuation(admitted);
    expect(advanceBodyCommand(admitted, start, 0.9).ok).toBe(true);
    expect(advanceBodyCommand(admitted, start, 1.4)).toMatchObject({ ok: false, reason: 'travel' });
    expect(start.command).toBe(0.4);
  });
});
