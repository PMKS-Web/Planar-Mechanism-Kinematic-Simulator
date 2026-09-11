import { NativeBodyDocumentService } from './native-body-document.service';
import { BodyFactory } from '../model/body-system/body-factory';
import { WORLD } from '../model/body-system/body-id';
import { NATIVE_EDIT_CONTEXT } from '../../test-utils/verification/native-lifecycle-fixtures';

describe('native document service notifications', () => {
  it('emits one batch for a committed edit and each restore, and none for previews or refusals', () => {
    const service = new NativeBodyDocumentService(),
      events: unknown[] = [];
    const subscription = service.changes.subscribe((event) => events.push(event));
    const f = new BodyFactory();
    f.body('Link', { x: 0, y: 0, angle: 0 }, [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
    ]);
    const command = {
      id: 'create',
      operations: [
        {
          kind: 'insert' as const,
          records: { bodies: f.document.bodies.filter((body) => body.id !== WORLD) },
        },
      ],
    };
    const preview = service.preview(command, NATIVE_EDIT_CONTEXT.state);
    if (!preview.ok) throw new Error(preview.message);
    expect(events).toHaveLength(0);
    expect(service.commit(preview, NATIVE_EDIT_CONTEXT.state).ok).toBe(true);
    expect(events).toHaveLength(1);
    service.commit(
      { id: 'bad', operations: [{ kind: 'delete', targets: [{ kind: 'body', id: WORLD }] }] },
      NATIVE_EDIT_CONTEXT.state
    );
    service.commit({ id: 'noop', operations: [] }, NATIVE_EDIT_CONTEXT.state);
    expect(events).toHaveLength(1);
    service.undo(NATIVE_EDIT_CONTEXT.state);
    service.redo(NATIVE_EDIT_CONTEXT.state);
    expect(events).toHaveLength(3);
    subscription.unsubscribe();
  });
});
