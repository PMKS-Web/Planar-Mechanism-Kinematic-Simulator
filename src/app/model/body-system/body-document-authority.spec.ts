import { BodyDocumentAuthority } from './body-document-authority';
import { BodyFactory } from './body-factory';
import { BodyEditCommand } from './body-edit-types';
import { newRecordId, WORLD } from './body-id';
import {
  NATIVE_EDIT_CONTEXT,
  insertNativeFixture,
} from '../../../test-utils/verification/native-lifecycle-fixtures';
import { nativeLinearCarriage } from '../../../test-utils/verification/native-linear-carriage-fixture';

const state = NATIVE_EDIT_CONTEXT.state;
function bodies() {
  const f = new BodyFactory();
  const a = f.body('A', { x: 0, y: 0, angle: 0 }, [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
  ]);
  const b = f.body('B', { x: 0, y: 0, angle: 0.4 }, [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
  ]);
  f.joint('revolute', f.attachment(a, { x: 0, y: 0 }), f.attachment(b, { x: 0, y: 0 }));
  return { authority: new BodyDocumentAuthority(insertNativeFixture(f.document)), a, b };
}
describe('native document commit and history', () => {
  it('replans a stale deletion to include a newly attached load and makes one history entry per commit', () => {
    const { authority, a } = bodies();
    const command: BodyEditCommand = {
      id: 'delete',
      operations: [{ kind: 'delete', targets: [{ kind: 'body', id: a }] }],
    };
    const preview = authority.preview(command, state);
    if (!preview.ok) throw new Error(preview.message);
    const force = {
      id: newRecordId<'force'>(),
      bodyId: a,
      label: 'new load',
      point: { x: 0, y: 0 },
      vector: { x: 3, y: 4 },
      couple: 1,
      frame: 'world' as const,
    };
    expect(
      authority.commit(
        { id: 'attach-load', operations: [{ kind: 'insert', records: { forces: [force] } }] },
        state
      )
    ).toMatchObject({ ok: true, changed: true, revision: 1 });
    const result = authority.commit(preview, state);
    if (!result.ok) throw new Error(result.message);
    expect(result.revision).toBe(2);
    expect(authority.undoDepth).toBe(2);
    expect(result.event?.plan?.effects.removed).toContainEqual({ kind: 'force', id: force.id });
    expect(authority.document.forces).toEqual([]);
    expect(authority.undo(state)).toMatchObject({ ok: true, changed: true, revision: 3 });
    expect(authority.document.forces).toEqual([force]);
    expect(authority.redoDepth).toBe(1);
  });
  it('keeps valid local selections in history without adding selection changes to Undo', () => {
    const { authority, a, b } = bodies(),
      original = authority.document;
    expect(authority.setLocalState({ selection: [{ kind: 'body', id: a }], clocks: [] })).toBe(
      true
    );
    expect(authority.document).toBe(original);
    expect(authority.undoDepth).toBe(0);
    const result = authority.commit(
      { id: 'remove-a', operations: [{ kind: 'delete', targets: [{ kind: 'body', id: a }] }] },
      state
    );
    expect(result.ok).toBe(true);
    expect(authority.local.selection).toEqual([]);
    authority.undo(state);
    expect(authority.local.selection).toEqual([{ kind: 'body', id: a }]);
    authority.setLocalState({ selection: [{ kind: 'body', id: b }], clocks: [] });
    authority.redo(state);
    expect(authority.local.selection).toEqual([]);
    authority.undo(state);
    expect(authority.local.selection).toEqual([{ kind: 'body', id: b }]);
  });
  it('keeps refusals, no-ops and changed permissions out of history and out of the change stream', () => {
    const { authority, a } = bodies(),
      original = authority.document;
    const command: BodyEditCommand = {
      id: 'remove-a',
      operations: [{ kind: 'delete', targets: [{ kind: 'body', id: a }] }],
    };
    const preview = authority.preview(command, state);
    if (!preview.ok) throw new Error(preview.message);
    const refused = authority.commit(preview, { ...state, playing: true });
    expect(refused).toMatchObject({ ok: false, code: 'permission' });
    expect('event' in refused).toBe(false);
    expect(authority.commit({ id: 'noop', operations: [] }, state)).toEqual({
      ok: true,
      changed: false,
      revision: 0,
    });
    expect(authority.undoDepth).toBe(0);
    expect(authority.document).toBe(original);
  });
  it('preserves an unrelated machine clock through a paused deletion and undo/redo', () => {
    const first = nativeLinearCarriage(0.3),
      second = nativeLinearCarriage(-0.7);
    const document = {
      ...first.document,
      bodies: [
        ...first.document.bodies,
        ...second.document.bodies.filter((body) => body.id !== WORLD),
      ],
      attachments: [...first.document.attachments, ...second.document.attachments],
      joints: [...first.document.joints, ...second.document.joints],
      drivers: [first.driver, second.driver],
    };
    const authority = new BodyDocumentAuthority(insertNativeFixture(document));
    const clocks = authority.local.clocks.map((clock, i) => ({
      ...clock,
      command: i ? -0.35 : 0.15,
      time: 0.5,
      synced: false,
    }));
    authority.setLocalState({ selection: [{ kind: 'body', id: second.body }], clocks });
    const parked = { ...state, atStart: false, sharedStepZero: true };
    const result = authority.commit(
      {
        id: 'delete-first',
        operations: [{ kind: 'delete', targets: [{ kind: 'body', id: first.body }] }],
      },
      parked
    );
    if (!result.ok) throw new Error(result.message);
    expect(authority.local.clocks).toEqual([
      clocks.find((clock) => clock.driverId === second.driver.id)!,
    ]);
    expect(authority.local.selection).toEqual([{ kind: 'body', id: second.body }]);
    authority.undo(parked);
    expect(authority.local.clocks).toEqual(clocks);
    authority.redo(parked);
    expect(authority.local.clocks).toHaveLength(1);
  });
});
