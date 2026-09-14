import { BodyDocumentAuthority } from './body-document-authority';
import { bodyBarFieldCommand } from './body-bar-field-command';
import { nativeCommand } from './body-joint-interaction';
import { nativeEditableBar } from '../../../test-utils/verification/native-geometry-fixture';
import { bodyBarHoldPair, bodyCylinderHoldPair } from './body-bar-hold';
import { nativeAxialCarriage } from '../../../test-utils/verification/native-cylinder-fixtures';
import { nativeHoldCommand } from './body-menu-commands';
import { validateBodyEditHolds } from './body-hold-validation';
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

/**
 * A cylinder's Fixed Angle, which the public menu offers and this route used to
 * refuse as "bars only".
 *
 * A hold is a heading between two points of one body, and a cylinder's heading
 * runs mount to mount across two — but the rod slides along the barrel's own
 * axis, so the barrel's bearing *is* the direction the cylinder points, and the
 * barrel's mount and bore anchor are the pair that names it.
 */
it('holds a cylinder at the direction it points, on the barrel that carries the axis', () => {
  const fixture = nativeAxialCarriage(),
    document = fixture.document;
  const pair = bodyCylinderHoldPair(document, fixture.assembly.barrel);
  expect(pair?.from).toBe(fixture.assembly.barrelMount);
  const held = editBodyMarks(document, {
    kind: 'hold',
    bodyId: fixture.assembly.barrel,
    ...pair!,
    dimension: 'angle',
    enabled: true,
  });
  if (!held.ok) throw new Error(held.message);
  // The fixture stands the cylinder at 0.4 rad, and that is what is held.
  expect(held.document.holds).toHaveLength(1);
  expect(held.document.holds[0].angle).toBeCloseTo(fixture.origin.angle, 12);
  expect(held.document.holds[0].length).toBeUndefined();
  expect(validateBodyEditHolds(held.document)).toBeUndefined();
});

/** There is no length to go with it: that distance is the stroke the drive moves. */
it('offers no length hold on a cylinder, the way the public menu offers one row', () => {
  const fixture = nativeAxialCarriage();
  expect(bodyBarHoldPair(fixture.document, fixture.assembly.barrel)).toBeUndefined();
  expect(nativeHoldCommand(fixture.document, fixture.assembly.barrel, 'length')).toBeUndefined();
  expect(nativeHoldCommand(fixture.document, fixture.assembly.barrel, 'angle')).toBeDefined();
});
