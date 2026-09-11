import { nativeFourBar } from '../../../test-utils/verification/native-body-fixtures';
import { BodyDocument } from './body-document';
import { BodyDocumentAuthority } from './body-document-authority';
import { BodySynthesisDesign } from './body-project';
import { newRecordId, WORLD } from './body-id';
import { localToWorld } from './body-frame';
import { SETTINGS_AT_START_ONLY } from '../edit-permission';
import { bodyEditEffects } from './body-edit-effects';
import { validateBodyDocument } from './body-validation';
import { nativeLinearCarriage } from '../../../test-utils/verification/native-linear-carriage-fixture';
import {
  NATIVE_EDIT_CONTEXT,
  insertNativeFixture,
} from '../../../test-utils/verification/native-lifecycle-fixtures';
import {
  decodeBodyDocument,
  encodeBodyDocument,
} from '../../services/transcoding/body-document-codec';
import { bodyDocumentEnvelope } from '../../services/transcoding/body-document-envelope';

const state = NATIVE_EDIT_CONTEXT.state;
function fixture() {
  const f = nativeLinearCarriage(0.3),
    document = f.document;
  const synthesis: BodySynthesisDesign = {
    stage: 'working',
    length: Math.PI,
    reference: 'front',
    endsOnly: false,
    allowDefect: true,
    constrain: true,
    poses: [
      { x: 1.123456789, y: -2, angle: 0.4 },
      { x: -3, y: 0.4, angle: -1.2 },
    ],
    region: { x: -5, y: -6, width: 20, height: 30 },
    generated: {
      bodies: [f.body],
      joints: document.joints.map((joint) => joint.id),
      partial: false,
      attachments: document.attachments
        .filter((point) => point.bodyId !== WORLD)
        .map((point) => ({
          id: point.id,
          at: localToWorld(
            document.bodies.find((body) => body.id === point.bodyId)!.pose,
            point.point
          ),
        })),
    },
  };
  const complete: BodyDocument = {
    ...document,
    synthesis,
    settings: {
      ...document.settings,
      gravity: false,
      forceUnit: 'kgf',
      angleUnit: 'rad',
      forceAnalysis: 'dynamic',
      showMajorGrid: false,
      showMinorGrid: false,
      showIds: false,
      objectScale: 1.23456789,
      defaultDrive: { angular: 0.2, linear: -0.7 },
    },
    view: {
      camera: { center: { x: 11, y: -9 }, span: 24 },
      backdrop: {
        asset: 'assets/backdrops/backhoe-arm.svg',
        label: 'Tracing reference',
        center: { x: -0.12, y: 4.56 },
        width: 7.89,
        angle: -0.4321,
        opacity: 0.37,
      },
    },
  };
  return { ...f, document: insertNativeFixture(complete) };
}
function reopen(document: BodyDocument): BodyDocument {
  const saved = encodeBodyDocument(document);
  if (!saved.ok) throw new Error(JSON.stringify(saved));
  const read = decodeBodyDocument(saved.payload);
  if (!read.ok) throw new Error(JSON.stringify(read));
  return read.document;
}

describe('native authored project state', () => {
  it('retains full precision settings, ordered synthesis poses and shipped backdrop/camera alignment', () => {
    const { document } = fixture(),
      read = reopen(document);
    expect(read.settings).toEqual(document.settings);
    expect(read.synthesis).toEqual(document.synthesis);
    expect(read.view).toEqual(document.view);
    expect(read.drivers).toEqual(document.drivers);
    const reordered = {
      ...document,
      synthesis: {
        ...document.synthesis!,
        generated: {
          ...document.synthesis!.generated,
          attachments: [...document.synthesis!.generated.attachments].reverse(),
        },
      },
    };
    expect(encodeBodyDocument(reordered)).toEqual(encodeBodyDocument(document));
    expect(
      encodeBodyDocument({
        ...document,
        synthesis: { ...document.synthesis!, poses: [...document.synthesis!.poses].reverse() },
      })
    ).not.toEqual(encodeBodyDocument(document));
  });
  it('records metadata-only edits once without disturbing displayed clocks and restores them through history', () => {
    const { document } = nativeFourBar({ ground: 3, crank: 1, coupler: 3, rocker: 2 }),
      authority = new BodyDocumentAuthority(document);
    const clocks = authority.local.clocks.map((clock) => ({
      ...clock,
      time: 2 * Math.PI,
      command: 2 * Math.PI,
      synced: false,
    }));
    authority.setLocalState({ selection: [], clocks });
    const settings = { ...document.settings, gravity: !document.settings.gravity };
    const commit = authority.commit(
      { id: 'gravity', operations: [{ kind: 'project', settings }] },
      state
    );
    expect(commit).toMatchObject({ ok: true, changed: true });
    if (!commit.ok) throw new Error(commit.message);
    expect(commit.event?.plan?.effects.changed).toEqual([{ kind: 'project', field: 'settings' }]);
    expect(commit.event?.plan?.effects.invalidatedPartitions).toHaveLength(1);
    expect(authority.local.clocks).toEqual(clocks);
    expect(authority.undoDepth).toBe(1);
    authority.undo(state);
    expect(authority.document.settings).toEqual(document.settings);
    authority.redo(state);
    expect(reopen(authority.document).settings).toEqual(settings);
    expect(authority.local.clocks).toEqual(clocks);
    expect(
      authority.commit({ id: 'same', operations: [{ kind: 'project', settings }] }, state)
    ).toMatchObject({ ok: true, changed: false });
  });
  it('does not let a gravity change in a deletion batch restart the surviving machine', () => {
    const first = nativeFourBar({ ground: 3, crank: 1, coupler: 3, rocker: 2 }),
      second = nativeFourBar({ ground: 3, crank: 1, coupler: 3, rocker: 2 });
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
    const authority = new BodyDocumentAuthority(document);
    const clocks = authority.local.clocks.map((clock) => ({
      ...clock,
      time: 2 * Math.PI,
      command: 2 * Math.PI,
      synced: false,
    }));
    authority.setLocalState({ selection: [], clocks });
    expect(
      authority.commit(
        {
          id: 'mixed',
          operations: [
            { kind: 'project', settings: { ...document.settings, gravity: false } },
            {
              kind: 'delete',
              targets: [
                {
                  kind: 'body',
                  id: first.document.joints.find(
                    (joint) => joint.id === first.driver.coordinate.jointId
                  )!.bodyB,
                },
              ],
            },
          ],
        },
        state
      ).ok
    ).toBe(true);
    expect(authority.local.clocks).toEqual([
      clocks.find((clock) => clock.driverId === second.driver.id)!,
    ]);
  });
  it('keeps a partially removed synthesis result recognizable through delete, save, undo and redo', () => {
    const { document, body } = fixture(),
      authority = new BodyDocumentAuthority(document);
    expect(
      authority.commit(
        {
          id: 'remove-generated',
          operations: [{ kind: 'delete', targets: [{ kind: 'body', id: body }] }],
        },
        state
      ).ok
    ).toBe(true);
    const removed = reopen(authority.document);
    expect(removed.synthesis!.generated).toEqual({
      bodies: [],
      joints: [],
      attachments: [],
      partial: true,
    });
    expect(removed.synthesis!.poses).toEqual(document.synthesis!.poses);
    expect(removed.view).toEqual(document.view);
    authority.undo(state);
    expect(reopen(authority.document).synthesis).toEqual(document.synthesis);
    authority.redo(state);
    expect(authority.document.synthesis!.generated.partial).toBe(true);
  });
  it('allows synthesis-only authoring in Synthesis and uses the existing settings refusal at a displaced pose', () => {
    const { document } = fixture(),
      authority = new BodyDocumentAuthority(document);
    const result = authority.commit(
      { id: 'clear-design', operations: [{ kind: 'project', synthesis: null }] },
      { ...state, mode: 'synthesis' }
    );
    expect(result).toMatchObject({ ok: true, changed: true });
    expect(authority.document.synthesis).toBeUndefined();
    const source = authority.document;
    expect(
      authority.commit(
        {
          id: 'settings',
          operations: [{ kind: 'project', settings: { ...source.settings, gravity: true } }],
        },
        { ...state, atStart: false }
      )
    ).toMatchObject({ ok: false, permission: SETTINGS_AT_START_ONLY });
    expect(authority.document).toBe(source);
    const view = { camera: { center: { x: 0, y: 0 }, span: 12 } };
    expect(bodyEditEffects(source, { ...source, view }).invalidatedBodies).toEqual([]);
  });
  it('does not repair an invalid synthesis owner out of a batch that also deletes material', () => {
    const { document, body } = fixture(),
      authority = new BodyDocumentAuthority(document);
    const result = authority.commit(
      {
        id: 'invalid-batch',
        operations: [
          {
            kind: 'project',
            synthesis: {
              ...document.synthesis!,
              generated: {
                bodies: [newRecordId<'body'>()],
                joints: [],
                attachments: [],
                partial: false,
              },
            },
          },
          { kind: 'delete', targets: [{ kind: 'body', id: body }] },
        ],
      },
      state
    );
    expect(result).toMatchObject({ ok: false, code: 'invalid-document' });
    expect(authority.document).toEqual(document);
    expect(authority.undoDepth).toBe(0);
  });
  it('refuses an authored edit that cannot cross the shared document schema', () => {
    const { document } = fixture(),
      authority = new BodyDocumentAuthority(document);
    const settings = { ...document.settings, snapToGrid: true };
    const result = authority.commit(
      { id: 'unshareable', operations: [{ kind: 'project', settings }] },
      state
    );
    expect(result).toMatchObject({ ok: false, code: 'invalid-document' });
    expect(authority.document).toEqual(document);
    expect(authority.undoDepth).toBe(0);
  });
  it('refuses an edit whose individually valid UTF-8 records exceed the persistence envelope', () => {
    const { document, body } = fixture(),
      authority = new BodyDocumentAuthority(document);
    const attachments = Array.from({ length: 1400 }, () => ({
      id: newRecordId<'attachment'>(),
      bodyId: body,
      point: { x: 0, y: 0 },
      label: '漢'.repeat(2048),
      trace: false,
    }));
    expect(
      encodeBodyDocument({ ...document, attachments: [...document.attachments, ...attachments] })
    ).toMatchObject({ ok: false, reason: 'too-large' });
    expect(
      authority.commit(
        { id: 'oversized', operations: [{ kind: 'insert', records: { attachments } }] },
        state
      )
    ).toMatchObject({ ok: false, code: 'invalid-document' });
    expect(authority.document).toEqual(document);
    expect(authority.undoDepth).toBe(0);
  });
  it('rejects malformed metadata and private or remote image references rather than silently dropping them', () => {
    const { document } = fixture();
    const invalid: unknown[] = [
      { ...document, settings: { ...document.settings, objectScale: 0 } },
      { ...document, settings: { ...document.settings, defaultDrive: { angular: 0, linear: 1 } } },
      { ...document, settings: { ...document.settings, snapToGrid: true } },
      { ...document, view: { camera: { center: { x: 0, y: 0 }, span: -1 } } },
      {
        ...document,
        synthesis: { ...document.synthesis, poses: new Array(4).fill({ x: 0, y: 0, angle: 0 }) },
      },
      {
        ...document,
        synthesis: {
          ...document.synthesis,
          generated: { ...document.synthesis!.generated, bodies: [WORLD] },
        },
      },
      ...[
        'data:image/png;base64,AA',
        'https://example.com/image.png',
        'assets/backdrops/../private.png',
        'assets/backdrops/%2e%2e.png',
      ].map((asset) => ({
        ...document,
        view: { backdrop: { ...document.view!.backdrop, asset } },
      })),
    ];
    for (const value of invalid) {
      const read = decodeBodyDocument(bodyDocumentEnvelope(JSON.stringify(value))!);
      expect(read).toMatchObject({ ok: false, reason: 'invalid-document' });
      expect('document' in read).toBe(false);
    }
    expect(
      validateBodyDocument({
        ...document,
        synthesis: {
          ...document.synthesis!,
          generated: {
            ...document.synthesis!.generated,
            attachments: [{ id: newRecordId<'attachment'>(), at: { x: 0, y: 0 } }],
          },
        },
      }).some((issue) => issue.code === 'invalid-synthesis-owner')
    ).toBe(true);
  });
});
