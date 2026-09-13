import { BodyDocumentAuthority } from './body-document-authority';
import { bodyBarFieldCommand } from './body-bar-field-command';
import { nativeCommand } from './body-joint-interaction';
import { nativeEditableBar } from '../../../test-utils/verification/native-geometry-fixture';
import { bodyBarHoldPair } from './body-bar-hold';
import { editBodyMarks } from './body-edit-marks';

it('holds the displayed bar endpoints when incidental attachments are enumerated first', () => {
  const f = nativeEditableBar();
  const document = { ...f.document, attachments: [...f.document.attachments].reverse() };
  expect(bodyBarHoldPair(document, f.body.id)).toEqual({ from: f.a, to: f.b });
});
it('length and angle holds can be enabled and removed independently', () => {
  const f = nativeEditableBar();
  let document = f.document;
  const toggle = (dimension: 'length' | 'angle', enabled: boolean) => {
    const result = editBodyMarks(document, {
      kind: 'hold',
      bodyId: f.body.id,
      from: f.a,
      to: f.b,
      dimension,
      enabled,
    });
    if (!result.ok) throw new Error(result.message);
    document = result.document;
  };
  toggle('length', true);
  toggle('angle', true);
  expect(document.holds[0]).toMatchObject({ length: 10, angle: 0 });
  toggle('length', false);
  expect(document.holds[0].length).toBeUndefined();
  expect(document.holds[0].angle).toBe(0);
  toggle('angle', false);
  expect(document.holds).toHaveLength(0);
});

it('typing a held length or angle replaces its target atomically and preserves the other value', () => {
  const f = nativeEditableBar();
  const authority = new BodyDocumentAuthority(f.document);
  const state = {
    mode: 'edit' as const,
    playing: false,
    atStart: true,
    sharedStepZero: true,
    solveDeferred: false,
    empty: false,
    runnable: false,
  };
  authority.commit(
    nativeCommand(
      { kind: 'hold', bodyId: f.body.id, from: f.a, to: f.b, dimension: 'length', enabled: true },
      { kind: 'hold', bodyId: f.body.id, from: f.a, to: f.b, dimension: 'angle', enabled: true }
    ),
    state
  );
  for (const [field, value] of [
    ['length', 12],
    ['angle', 0.6],
  ] as const) {
    const before = authority.document,
      depth = authority.undoDepth;
    const command = bodyBarFieldCommand(before, f.body.id, field, value);
    if (!('operations' in command)) throw new Error(command.message);
    expect(authority.commit(command, state).ok).toBe(true);
    expect(authority.undoDepth).toBe(depth + 1);
    const hold = authority.document.holds[0];
    expect(hold.length).toBeCloseTo(12, 10);
    expect(hold.angle).toBeCloseTo(field === 'angle' ? 0.6 : 0, 10);
    expect(authority.undo(state).ok).toBe(true);
    expect(authority.document).toEqual(before);
    expect(authority.redo(state).ok).toBe(true);
  }
});
