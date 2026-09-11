import { emptyBodyDocument } from './body-document';
import { BodyFactory } from './body-factory';
import { planBodyEdit } from './body-edit-plan';
import {
  NATIVE_EDIT_CONTEXT,
  insertNativeFixture,
  nativeThreeLeaves,
} from '../../../test-utils/verification/native-lifecycle-fixtures';
import { nativeObliqueCylinder } from '../../../test-utils/verification/native-oblique-cylinder-fixture';
import { WORLD } from './body-id';

describe('native structural edit planning', () => {
  it('inserts a complete construction atomically, owns its preview, and produces no-op plans without effects', () => {
    const fixture = nativeObliqueCylinder().document,
      source = emptyBodyDocument(),
      { version, units, ...records } = fixture;
    const plan = planBodyEdit(
      source,
      7,
      {
        id: 'create',
        operations: [
          {
            kind: 'insert',
            records: { ...records, bodies: records.bodies.filter((body) => body.id !== WORLD) },
          },
        ],
      },
      NATIVE_EDIT_CONTEXT
    );
    if (!plan.ok) throw new Error(plan.message);
    expect(source.bodies.length).toBe(1);
    expect(plan.document.bodies.length).toBe(fixture.bodies.length);
    expect(plan.baseRevision).toBe(7);
    expect(plan.changed).toBe(true);
    expect(Object.isFrozen(plan.document.bodies)).toBe(true);
    expect(plan.effects.added.filter((ref) => ref.kind === 'assembly').length).toBe(1);
    const same = planBodyEdit(
      plan.document,
      8,
      { id: 'noop', operations: [] },
      NATIVE_EDIT_CONTEXT
    );
    if (!same.ok) throw new Error(same.message);
    expect(same.changed).toBe(false);
    expect(same.effects.invalidatedBodies).toEqual([]);
  });
  it('uses the existing playback refusal and leaves source and selection untouched on a refused batch', () => {
    const fixture = nativeThreeLeaves(),
      before = JSON.stringify(fixture.document);
    const command = {
      id: 'delete',
      operations: [
        {
          kind: 'delete' as const,
          targets: [
            { kind: 'body' as const, id: fixture.members[0] },
            { kind: 'body' as const, id: WORLD },
          ],
        },
      ],
    };
    const refused = planBodyEdit(fixture.document, 0, command, NATIVE_EDIT_CONTEXT);
    expect(refused).toMatchObject({ ok: false, code: 'immutable-world' });
    expect(JSON.stringify(fixture.document)).toBe(before);
    const playing = planBodyEdit(fixture.document, 0, command, {
      ...NATIVE_EDIT_CONTEXT,
      state: { ...NATIVE_EDIT_CONTEXT.state, playing: true },
    });
    expect(playing).toMatchObject({
      ok: false,
      code: 'permission',
      permission: { short: 'animation running' },
    });
  });
  it('refuses a geometrically inconsistent connection without requiring a complete driven mechanism', () => {
    const f = new BodyFactory();
    const a = f.body('A', { x: 0, y: 0, angle: 0 }, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    const b = f.body('B', { x: 2, y: 0, angle: 0 }, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    const weld = f.joint('weld', f.attachment(a, { x: 0, y: 0 }), f.attachment(b, { x: 0, y: 0 }));
    const document = insertNativeFixture(f.document);
    expect(
      planBodyEdit(
        document,
        0,
        {
          id: 'bad',
          operations: [{ kind: 'joint-kind', jointId: weld.id, jointKind: 'revolute' }],
        },
        NATIVE_EDIT_CONTEXT
      )
    ).toMatchObject({ ok: false, code: 'connection-point' });
    const pin = planBodyEdit(
      document,
      0,
      {
        id: 'pin',
        operations: [
          {
            kind: 'joint-kind',
            jointId: weld.id,
            jointKind: 'revolute',
            worldPoint: { x: 1, y: 0 },
          },
        ],
      },
      NATIVE_EDIT_CONTEXT
    );
    if (!pin.ok) throw new Error(pin.message);
    expect(pin.document.joints[0].kind).toBe('revolute');
    expect(pin.document.bodies).toEqual(document.bodies);
  });
});
