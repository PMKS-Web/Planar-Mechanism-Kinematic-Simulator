import { nativeAxialCarriage } from '../../../test-utils/verification/native-cylinder-fixtures';
import { NATIVE_EDIT_CONTEXT } from '../../../test-utils/verification/native-lifecycle-fixtures';
import { BodyDocumentAuthority } from './body-document-authority';
import { buildSimulationSnapshot } from './build-simulation-snapshot';
import { selectSimulationView } from './simulation-view';

describe('native displayed frame clocks', () => {
  it('retains the return leg of a ram cycle through a posed edit and history even where position repeats', () => {
    const f = nativeAxialCarriage('weld');
    const authority = new BodyDocumentAuthority(f.document);
    const built = buildSimulationSnapshot(authority.document, 0, {
      mode: 'static',
      gravity: { x: 0, y: 0 },
      path: { commandStep: 0.1 },
    });
    if (!built.ok) throw new Error(built.reason);
    const key = built.snapshot.bodyPartition.get(f.carriage)!;
    const partition = built.snapshot.partitions.get(key)!;
    if (!partition.ok) throw new Error(partition.reason);
    const index = partition.inputs.findIndex(
      (input) => input.sample.direction === -1 && !input.reversal
    );
    expect(index).toBeGreaterThan(0);
    const sample = partition.inputs[index];
    const outward = partition.inputs.find(
      (input) => input.sample.direction === 1 && input.sample.command === sample.sample.command
    )!;
    expect(outward).toBeDefined();
    expect(outward.pose).toEqual(sample.pose);
    const view = selectSimulationView(built.snapshot, {
      revision: 0,
      indices: new Map([[key, index]]),
    });
    if (!view.ok) throw new Error(view.reason);
    expect(authority.setSimulationView(view.value)).toBe(true);
    const clocks = authority.local.clocks;
    expect(clocks[0].direction).toBe(-1);
    expect(clocks[0].time).toBe(sample.sample.time);
    const state = { ...NATIVE_EDIT_CONTEXT.state, atStart: false };
    const result = authority.commit(
      {
        id: 'return-trace',
        operations: [
          { kind: 'attachment-properties', attachmentId: f.witness, change: { trace: true } },
        ],
      },
      state
    );
    if (!result.ok) throw new Error(result.message);
    expect(authority.local.clocks).toEqual(clocks);
    const displayed = authority.display!.poses;
    authority.undo(state);
    expect(authority.local.clocks).toEqual(clocks);
    expect(authority.display!.poses).toEqual(displayed);
    authority.redo(state);
    expect(authority.local.clocks).toEqual(clocks);
    expect(authority.display!.poses).toEqual(displayed);
  });
});
