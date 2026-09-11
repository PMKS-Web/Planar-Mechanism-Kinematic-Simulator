import { BodyDocumentAuthority } from './body-document-authority';
import { BodyEditOperation } from './body-edit-types';
import { BodyDocument } from './body-document';
import { BodyId, WORLD } from './body-id';
import { compose, localToWorld } from './body-frame';
import { MaterialBody } from './material-body';
import { BodyFactory } from './body-factory';
import { nativeEditableBar } from '../../../test-utils/verification/native-geometry-fixture';
import {
  nativeThreeLeaves,
  nativeThreeCylinders,
  NATIVE_EDIT_CONTEXT,
} from '../../../test-utils/verification/native-lifecycle-fixtures';
import {
  encodeBodyDocument,
  decodeBodyDocument,
} from '../../services/transcoding/body-document-codec';

const state = NATIVE_EDIT_CONTEXT.state;
function commit(authority: BodyDocumentAuthority, operations: readonly BodyEditOperation[]) {
  const result = authority.commit({ id: 'geometry-edit', operations }, state);
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result;
}
function material(document: BodyDocument, id: BodyId): MaterialBody {
  return document.bodies.find((body) => body.id === id)! as MaterialBody;
}
function reopen(document: BodyDocument): BodyDocument {
  const saved = encodeBodyDocument(document);
  if (!saved.ok) throw new Error(JSON.stringify(saved));
  const result = decodeBodyDocument(saved.payload);
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.document;
}

describe('canonical native geometry edits', () => {
  it('moves bound vertices and all bound markers, while a free tracer leaves the shape alone', () => {
    const f = nativeEditableBar();
    if (f.body.geometry.kind !== 'bar') throw new Error('Expected bar');
    const factory = new BodyFactory(f.document);
    const duplicate = factory.vertexAttachment(f.body.id, f.body.geometry.vertices[1].id);
    const authority = new BodyDocumentAuthority(factory.document);
    commit(authority, [{ kind: 'attachment-position', attachmentId: f.b, point: { x: 20, y: 0 } }]);
    const after = reopen(authority.document),
      body = material(after, f.body.id);
    expect(body.geometry).toMatchObject({
      vertices: [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
      ],
    });
    for (const id of [f.b, duplicate])
      expect(after.attachments.find((point) => point.id === id)!.point).toEqual({ x: 20, y: 0 });
    expect(after.attachments.find((point) => point.id === f.witness)!.point).toEqual({
      x: 3,
      y: 2,
    });
    expect(authority.undoDepth).toBe(1);
    authority.undo(state);
    expect(authority.document).toEqual(factory.document);
    authority.redo(state);
    commit(authority, [
      { kind: 'attachment-position', attachmentId: f.witness, point: { x: -4, y: 7 } },
    ]);
    expect(material(authority.document, f.body.id).geometry).toEqual(body.geometry);
  });
  it('rejects a disconnected one-sided pin edit and accepts one whole three-way endpoint proposal in either order', () => {
    for (const reverse of [false, true]) {
      const f = nativeEditableBar();
      const factory = new BodyFactory(f.document);
      const ids = [
        f.body.id,
        ...[1, 2].map((i) =>
          factory.body(`Link ${i}`, { x: 10, y: i, angle: 0 }, [
            { x: 0, y: -i },
            { x: 2, y: 1 },
          ])
        ),
      ];
      const pin = factory.junction(ids, { x: 10, y: 0 });
      const authority = new BodyDocumentAuthority(factory.document),
        before = authority.document;
      const operations: BodyEditOperation[] = pin.attachments.map((id) => {
        const point = before.attachments.find((item) => item.id === id)!;
        return {
          kind: 'attachment-position',
          attachmentId: id,
          point: { x: point.point.x + 1, y: point.point.y + 2 },
        };
      });
      expect(
        authority.commit({ id: 'half-pin', operations: operations.slice(0, 1) }, state)
      ).toMatchObject({ ok: false });
      expect(authority.document).toBe(before);
      commit(authority, reverse ? [...operations].reverse() : operations);
      for (const id of pin.attachments) {
        const point = authority.document.attachments.find((item) => item.id === id)!;
        expect(localToWorld(material(authority.document, point.bodyId).pose, point.point)).toEqual({
          x: 11,
          y: 2,
        });
      }
      expect(authority.document.bodies).toEqual(before.bodies);
      expect(authority.undoDepth).toBe(1);
    }
  });
  it('enforces length and angle holds on the settled candidate without turning them into physical joints', () => {
    const f = nativeEditableBar(),
      authority = new BodyDocumentAuthority(f.document);
    commit(authority, [
      { kind: 'hold', bodyId: f.body.id, from: f.a, to: f.b, dimension: 'length' },
    ]);
    const original = authority.document;
    expect(
      authority.commit(
        {
          id: 'stretch',
          operations: [{ kind: 'attachment-position', attachmentId: f.b, point: { x: 20, y: 0 } }],
        },
        state
      )
    ).toMatchObject({ ok: false, code: 'held-dimension' });
    expect(authority.document).toBe(original);
    commit(authority, [
      {
        kind: 'body-poses',
        poses: [{ bodyId: f.body.id, pose: { x: 0, y: 0, angle: Math.PI / 2 } }],
      },
    ]);
    commit(authority, [
      { kind: 'hold', bodyId: f.body.id, from: f.a, to: f.b, dimension: 'angle' },
    ]);
    expect(
      authority.commit(
        {
          id: 'turn',
          operations: [
            { kind: 'body-poses', poses: [{ bodyId: f.body.id, pose: { x: 0, y: 0, angle: 0 } }] },
          ],
        },
        state
      )
    ).toMatchObject({ ok: false, code: 'held-dimension' });
    commit(authority, [{ kind: 'attachment-position', attachmentId: f.b, point: { x: 20, y: 0 } }]);
    expect(authority.document.joints).toEqual(f.document.joints);
    expect(reopen(authority.document).holds[0].angle).toBeCloseTo(Math.PI / 2, 12);
  });
  it('carries a whole welded group without changing its local shape or weld rest transforms', () => {
    const f = nativeThreeLeaves(),
      authority = new BodyDocumentAuthority(f.document);
    const transform = { x: 2, y: 3, angle: 0.7 };
    const poses = f.members.map((bodyId) => ({
      bodyId,
      pose: compose(transform, material(f.document, bodyId).pose),
    }));
    expect(
      authority.commit(
        { id: 'leave-neighbors', operations: [{ kind: 'body-poses', poses: poses.slice(0, 1) }] },
        state
      )
    ).toMatchObject({ ok: false, code: 'invalid-document' });
    commit(authority, [{ kind: 'body-poses', poses }]);
    for (const id of f.members) {
      expect(material(authority.document, id).geometry).toEqual(material(f.document, id).geometry);
      expect(material(authority.document, id).pose).toEqual(
        poses.find((item) => item.bodyId === id)!.pose
      );
    }
    expect(authority.document.joints).toEqual(f.document.joints);
    expect(authority.document.attachments).toEqual(f.document.attachments);
    expect(reopen(authority.document).groups[0].presentation).toEqual(
      f.document.groups[0].presentation
    );
  });
  it('protects cylinder intrinsic geometry but permits a coherent rigid pose of the assembled rams', () => {
    const f = nativeThreeCylinders(),
      authority = new BodyDocumentAuthority(f.document);
    const cylinder = f.cylinders[0],
      barrel = material(f.document, cylinder.barrel);
    expect(
      authority.commit(
        {
          id: 'resize-leaf',
          operations: [{ kind: 'body-geometry', bodyId: barrel.id, geometry: barrel.geometry }],
        },
        state
      )
    ).toMatchObject({ ok: false, code: 'assembly-interior' });
    expect(
      authority.commit(
        {
          id: 'move-mount',
          operations: [
            {
              kind: 'attachment-position',
              attachmentId: cylinder.barrelMount,
              point: { x: 1, y: 0 },
            },
          ],
        },
        state
      )
    ).toMatchObject({ ok: false, code: 'assembly-interior' });
    const transform = { x: 4, y: -2, angle: 0.5 };
    commit(authority, [
      {
        kind: 'body-poses',
        poses: f.document.bodies
          .filter((body) => body.id !== WORLD)
          .map((body) => ({ bodyId: body.id, pose: compose(transform, body.pose) })),
      },
    ]);
    expect(authority.document.assemblies).toEqual(f.document.assemblies);
    expect(authority.document.limits).toEqual(f.document.limits);
  });
  it('rejects a removed bound vertex and rolls back unrelated properties in the same transaction', () => {
    const f = nativeEditableBar(),
      authority = new BodyDocumentAuthority(f.document);
    const original = authority.document;
    expect(
      authority.commit(
        {
          id: 'lose-vertex',
          operations: [
            { kind: 'body-properties', bodyId: f.body.id, change: { label: 'Must roll back' } },
            {
              kind: 'body-geometry',
              bodyId: f.body.id,
              geometry: { kind: 'circle', center: { x: 0, y: 0 }, radius: 1 },
            },
          ],
        },
        state
      )
    ).toMatchObject({ ok: false, code: 'invalid-document' });
    expect(authority.document).toBe(original);
    expect(authority.undoDepth).toBe(0);
  });
});
