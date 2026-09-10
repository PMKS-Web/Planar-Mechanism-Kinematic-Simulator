import {
  nativeFourBar,
  nativeFourBarPoint,
  nativeParallelogram,
} from '../../../test-utils/verification/native-body-fixtures';
import { compileBodyDocument } from './constraint-compiler';
import { admitBodyPartition } from './body-admission';
import { advanceBodyCommand, initialBodyContinuation } from './body-continuation';
import { solveFramePoint } from './body-solve-frame';
import { localToWorld } from './body-frame';
import { BodyDocument } from './body-document';
import { newRecordId, WORLD } from './body-id';
import { BodyFactory } from './body-factory';

function admitted(document: BodyDocument) {
  const compiled = compileBodyDocument(document);
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues));
  const system = compiled.system;
  const result = admitBodyPartition(system, system.partitions[0]);
  if (!result.ok) throw new Error(result.reason);
  return { system, admitted: result };
}

describe('native commanded continuation', () => {
  it('subdivides a long request and retraces the same four-bar branch', () => {
    const fixture = nativeFourBar(),
      { system, admitted: model } = admitted(fixture.document);
    let state = initialBodyContinuation(model);
    const source = JSON.stringify([...state.poses]);
    const witness = system.attachments.get(fixture.witness)!;
    const advance = advanceBodyCommand(model, state, 1.1);
    expect(advance.ok).toBe(true);
    expect(advance.attempts).toBeGreaterThan(1);
    for (const command of [1.1, 0.4, 0, -0.3, 0]) {
      const result = advanceBodyCommand(model, state, command);
      if (!result.ok) throw new Error(result.reason);
      state = result.state;
      const actual = localToWorld(
        state.poses.get(witness.groupId)!,
        solveFramePoint(model.frame, witness.groupId, witness.point)
      );
      const expected = nativeFourBarPoint(command + 0.7);
      expect(actual.x + model.frame.origin.x).toBeCloseTo(expected.x, 8);
      expect(actual.y + model.frame.origin.y).toBeCloseTo(expected.y, 8);
    }
    expect(JSON.stringify([...initialBodyContinuation(model).poses])).toBe(source);
  });

  it('carries the parallel branch across exact collinear samples and multiple complete turns', () => {
    const fixture = nativeParallelogram(),
      { system, admitted: model } = admitted(fixture.document);
    let state = initialBodyContinuation(model);
    const witness = system.attachments.get(fixture.witness)!;
    const targets = [
      ...Array.from({ length: 180 }, (_, i) => 0.7 + ((i + 1) * 4 * Math.PI) / 180),
      Math.PI,
      2 * Math.PI,
      3 * Math.PI,
    ].sort((a, b) => a - b);
    for (const angle of targets) {
      const result = advanceBodyCommand(model, state, angle - 0.7);
      if (!result.ok) throw new Error(`${angle}: ${result.reason} after ${result.attempts}`);
      state = result.state;
      const point = localToWorld(
        state.poses.get(witness.groupId)!,
        solveFramePoint(model.frame, witness.groupId, witness.point)
      );
      expect(point.x + model.frame.origin.x).toBeCloseTo(3 + Math.cos(angle), 7);
      expect(point.y + model.frame.origin.y).toBeCloseTo(Math.sin(angle), 7);
    }
  });

  it('rolls back all private substeps when the cut budget refuses a request', () => {
    const { admitted: model } = admitted(nativeFourBar().document);
    const state = initialBodyContinuation(model);
    const before = JSON.stringify({
      command: state.command,
      poses: [...state.poses],
      tangent: state.tangent,
    });
    expect(advanceBodyCommand(model, state, 1.1, { maxCuts: 0 })).toMatchObject({
      ok: false,
      reason: 'branch',
    });
    expect(advanceBodyCommand(model, state, 1.1, { maxAttempts: 2 }).ok).toBe(false);
    expect(
      JSON.stringify({ command: state.command, poses: [...state.poses], tangent: state.tangent })
    ).toBe(before);
    expect(advanceBodyCommand(model, state, 0.05).ok).toBe(true);
  });

  it('validates a passive coordinate bound after settling and retains the original continuation', () => {
    const fixture = nativeFourBar();
    const passive = fixture.document.joints.find(
      (joint) =>
        joint.kind === 'revolute' &&
        joint.id !== fixture.driver.coordinate.jointId &&
        joint.bodyB === WORLD
    )!;
    const document: BodyDocument = {
      ...fixture.document,
      limits: [
        {
          id: newRecordId<'limit'>(),
          coordinate: { jointId: passive.id, coordinate: 'angle' },
          lower: -0.02,
          upper: 0.02,
        },
      ],
    };
    const { admitted: model } = admitted(document),
      state = initialBodyContinuation(model);
    const before = JSON.stringify([...state.poses]);
    const result = advanceBodyCommand(model, state, 0.4);
    expect(result).toMatchObject({ ok: false, reason: 'travel' });
    expect(JSON.stringify([...state.poses])).toBe(before);
    expect(state.command).toBe(0);
  });

  it('moves an unbounded tiny carriage from zero travel without a dimension-dependent cut loop', () => {
    const f = new BodyFactory();
    const id = f.body('tiny', { x: 0, y: 0, angle: 0 }, [
      { x: 0, y: 0 },
      { x: 1e-12, y: 0 },
    ]);
    const joint = f.joint(
      'prismatic',
      f.attachment(WORLD, { x: 0, y: 0 }),
      f.attachment(id, { x: 0, y: 0 })
    );
    const driver = {
      id: newRecordId<'driver'>(),
      coordinate: { jointId: joint.id, coordinate: 'travel' as const },
      profile: { kind: 'constant-speed' as const, initial: 0, speed: 1e-12 },
    };
    const { admitted: model } = admitted({ ...f.document, drivers: [driver] });
    const result = advanceBodyCommand(model, initialBodyContinuation(model), 2e-12);
    if (!result.ok) throw new Error(result.reason);
    const point = result.state.poses.get(id)!;
    expect(point.x / 1e-12).toBeCloseTo(2, 10);
  });
});
