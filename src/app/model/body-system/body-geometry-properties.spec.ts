import { BodyDocumentAuthority } from './body-document-authority';
import { BodyEditOperation } from './body-edit-types';
import { BodyDocument } from './body-document';
import { BodyId, newRecordId } from './body-id';
import { compose, localToWorld } from './body-frame';
import { CenterEditAnchor, MaterialBody } from './material-body';
import { nativeEditableBar } from '../../../test-utils/verification/native-geometry-fixture';
import {
  nativeThreeLeaves,
  NATIVE_EDIT_CONTEXT,
} from '../../../test-utils/verification/native-lifecycle-fixtures';
import {
  encodeBodyDocument,
  decodeBodyDocument,
} from '../../services/transcoding/body-document-codec';

const state = NATIVE_EDIT_CONTEXT.state;
function commit(authority: BodyDocumentAuthority, operations: readonly BodyEditOperation[]) {
  const result = authority.commit({ id: 'geometry-properties', operations }, state);
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
function center(document: BodyDocument, id: BodyId) {
  const body = material(document, id);
  if (body.mass.center.mode !== 'explicit') throw new Error('Expected explicit center');
  return localToWorld(body.pose, body.mass.center.point);
}

describe('geometry edit locks and center references', () => {
  it('distinguishes locking a single pin from locking its body and retains the body lock through save/undo', () => {
    const f = nativeEditableBar(true),
      authority = new BodyDocumentAuthority(f.document);
    commit(authority, [{ kind: 'lock', targets: [{ kind: 'attachment', id: f.a }], locked: true }]);
    const rotated = { x: 0, y: 0, angle: 0.7 };
    commit(authority, [{ kind: 'body-poses', poses: [{ bodyId: f.body.id, pose: rotated }] }]);
    commit(authority, [{ kind: 'lock', targets: [{ kind: 'body', id: f.body.id }], locked: true }]);
    const original = authority.document,
      depth = authority.undoDepth;
    for (const operation of [
      { kind: 'body-poses', poses: [{ bodyId: f.body.id, pose: { ...rotated, angle: 1.4 } }] },
      { kind: 'attachment-position', attachmentId: f.b, point: { x: 12, y: 0 } },
      { kind: 'attachment-position', attachmentId: f.witness, point: { x: 3, y: 3 } },
    ] satisfies BodyEditOperation[]) {
      expect(authority.commit({ id: 'locked-body', operations: [operation] }, state)).toMatchObject(
        { ok: false, code: 'locked-position', targets: [{ kind: 'body', id: f.body.id }] }
      );
      expect(authority.document).toBe(original);
      expect(authority.undoDepth).toBe(depth);
    }
    expect(material(reopen(authority.document), f.body.id).locked).toBe(true);
    authority.undo(state);
    expect(material(authority.document, f.body.id).locked).toBeUndefined();
    authority.redo(state);
    expect(material(authority.document, f.body.id).locked).toBe(true);
    commit(authority, [
      {
        kind: 'body-properties',
        bodyId: f.body.id,
        change: {
          label: 'Still editable',
          mass: { mass: { mode: 'explicit', value: 4 } },
          presentation: { fill: '#008577' },
        },
      },
    ]);
    commit(authority, [{ kind: 'delete', targets: [{ kind: 'body', id: f.body.id }] }]);
    expect(authority.document.bodies.some((body) => body.id === f.body.id)).toBe(false);
  });
  it('refuses movement of an individually locked bound attachment and allows explicit unlock and move in one batch', () => {
    const f = nativeEditableBar(),
      authority = new BodyDocumentAuthority(f.document);
    commit(authority, [{ kind: 'lock', targets: [{ kind: 'attachment', id: f.b }], locked: true }]);
    const move: BodyEditOperation = {
      kind: 'attachment-position',
      attachmentId: f.b,
      point: { x: 20, y: 0 },
    };
    expect(authority.commit({ id: 'move-lock', operations: [move] }, state)).toMatchObject({
      ok: false,
      code: 'locked-position',
    });
    commit(authority, [
      move,
      { kind: 'lock', targets: [{ kind: 'attachment', id: f.b }], locked: false },
    ]);
    expect(authority.document.attachments.find((point) => point.id === f.b)!.point.x).toBe(20);
  });
  it('preserves the three distinct center behaviors through extension, rotation, translation, and save/reopen', () => {
    for (const kind of ['body', 'grid', 'attachment'] as const) {
      const f = nativeEditableBar(),
        authority = new BodyDocumentAuthority(f.document);
      const editAnchor: CenterEditAnchor = kind === 'attachment' ? { attachmentId: f.a } : kind;
      commit(authority, [
        {
          kind: 'body-properties',
          bodyId: f.body.id,
          change: {
            mass: {
              center: { mode: 'explicit', point: { x: 4, y: 3 }, editAnchor },
            },
          },
        },
      ]);
      commit(authority, [
        { kind: 'attachment-position', attachmentId: f.b, point: { x: 20, y: 0 } },
      ]);
      expect(center(authority.document, f.body.id)).toEqual({ x: kind === 'body' ? 9 : 4, y: 3 });
      commit(authority, [
        {
          kind: 'body-poses',
          poses: [{ bodyId: f.body.id, pose: { x: 0, y: 0, angle: Math.PI / 2 } }],
        },
      ]);
      const turned = center(authority.document, f.body.id);
      expect(turned.x).toBeCloseTo(kind === 'body' ? -3 : 4, 12);
      expect(turned.y).toBeCloseTo(kind === 'body' ? 9 : 3, 12);
      commit(authority, [
        {
          kind: 'body-poses',
          poses: [{ bodyId: f.body.id, pose: { x: 1, y: -2, angle: Math.PI / 2 } }],
        },
      ]);
      const moved = center(reopen(authority.document), f.body.id);
      expect(moved.x).toBeCloseTo(kind === 'body' ? -2 : kind === 'grid' ? 4 : 5, 12);
      expect(moved.y).toBeCloseTo(kind === 'body' ? 7 : kind === 'grid' ? 3 : 1, 12);
    }
  });
  it('rotates a centroid-relative custom center when an endpoint turns the bar, and retains its named direction through reordered geometry', () => {
    const f = nativeEditableBar(),
      authority = new BodyDocumentAuthority(f.document);
    commit(authority, [
      {
        kind: 'body-properties',
        bodyId: f.body.id,
        change: {
          mass: {
            center: { mode: 'explicit', point: { x: 4, y: 3 }, editAnchor: 'body' },
          },
        },
      },
    ]);
    commit(authority, [{ kind: 'attachment-position', attachmentId: f.b, point: { x: 0, y: 20 } }]);
    const first = center(authority.document, f.body.id);
    expect(first.x).toBeCloseTo(-3, 12);
    expect(first.y).toBeCloseTo(9, 12);
    const saved = reopen(authority.document),
      body = material(saved, f.body.id);
    if (body.geometry.kind !== 'bar' || body.mass.center.mode !== 'explicit')
      throw new Error('Expected bar');
    const axis = body.mass.center.editAxis;
    expect(axis?.length).toBe(2);
    const reopened = new BodyDocumentAuthority(saved);
    commit(reopened, [
      {
        kind: 'body-geometry',
        bodyId: body.id,
        geometry: {
          ...body.geometry,
          vertices: [body.geometry.vertices[1], body.geometry.vertices[0]],
        },
      },
    ]);
    commit(reopened, [{ kind: 'attachment-position', attachmentId: f.b, point: { x: -30, y: 0 } }]);
    const next = center(reopened.document, body.id);
    expect(next.x).toBeCloseTo(-14, 12);
    expect(next.y).toBeCloseTo(-3, 12);
    expect(material(reopened.document, body.id).mass.center).toMatchObject({ editAxis: axis });
  });
  it('keeps a polygon center on its original geometry direction after a different pair becomes longest', () => {
    const f = nativeEditableBar(),
      authority = new BodyDocumentAuthority(f.document);
    if (f.body.geometry.kind !== 'bar') throw new Error('Expected bar');
    const extra = { id: newRecordId<'vertex'>(), x: 0, y: 2 };
    commit(authority, [
      {
        kind: 'body-geometry',
        bodyId: f.body.id,
        geometry: {
          kind: 'polygon',
          vertices: [...f.body.geometry.vertices, extra],
        },
      },
    ]);
    commit(authority, [
      {
        kind: 'body-properties',
        bodyId: f.body.id,
        change: {
          mass: {
            center: { mode: 'explicit', point: { x: 13 / 3, y: 2 / 3 }, editAnchor: 'body' },
          },
        },
      },
    ]);
    // B-C is the original direction. Moving A makes A-B longest but must not select a new frame.
    commit(authority, [
      { kind: 'attachment-position', attachmentId: f.a, point: { x: -20, y: 0 } },
    ]);
    expect(center(authority.document, f.body.id).x).toBeCloseTo(-7 / 3, 12);
    const resumed = new BodyDocumentAuthority(reopen(authority.document));
    commit(resumed, [{ kind: 'attachment-position', attachmentId: f.b, point: { x: 10, y: 2 } }]);
    const point = center(resumed.document, f.body.id);
    expect(point.x).toBeCloseTo(-10 / 3 + 10 / Math.sqrt(104), 12);
    expect(point.y).toBeCloseTo(4 / 3 + 2 / Math.sqrt(104), 12);
    // Removing the named geometry direction rebases the editing reference in place.
    commit(resumed, [
      {
        kind: 'body-geometry',
        bodyId: f.body.id,
        geometry: { kind: 'circle', center: { x: 0, y: 0 }, radius: 3 },
      },
      {
        kind: 'delete',
        targets: [
          { kind: 'attachment', id: f.a },
          { kind: 'attachment', id: f.b },
        ],
      },
    ]);
    expect(center(resumed.document, f.body.id)).toEqual(point);
    expect(material(reopen(resumed.document), f.body.id).mass.center).not.toHaveProperty(
      'editAxis'
    );
  });
  it('keeps the center at its world position when its editing attachment is deleted during a turn', () => {
    const f = nativeEditableBar(),
      authority = new BodyDocumentAuthority(f.document);
    commit(authority, [
      {
        kind: 'body-properties',
        bodyId: f.body.id,
        change: {
          mass: {
            center: { mode: 'explicit', point: { x: 4, y: 3 }, editAnchor: { attachmentId: f.a } },
          },
        },
      },
    ]);
    commit(authority, [
      { kind: 'delete', targets: [{ kind: 'attachment', id: f.a }] },
      {
        kind: 'body-poses',
        poses: [{ bodyId: f.body.id, pose: { x: 5, y: 2, angle: Math.PI / 2 } }],
      },
    ]);
    const point = center(reopen(authority.document), f.body.id);
    expect(point.x).toBeCloseTo(4, 12);
    expect(point.y).toBeCloseTo(3, 12);
    expect(material(authority.document, f.body.id).mass.center).toMatchObject({
      editAnchor: 'body',
    });
  });
  it('lets an explicitly supplied center win over automatic edit-anchor remapping, even when its value is unchanged', () => {
    const f = nativeEditableBar(),
      authority = new BodyDocumentAuthority(f.document);
    const property: BodyEditOperation = {
      kind: 'body-properties',
      bodyId: f.body.id,
      change: {
        mass: {
          center: { mode: 'explicit', point: { x: 4, y: 3 }, editAnchor: 'body' },
        },
      },
    };
    commit(authority, [property]);
    commit(authority, [
      property,
      { kind: 'attachment-position', attachmentId: f.b, point: { x: 20, y: 0 } },
    ]);
    expect(center(authority.document, f.body.id)).toEqual({ x: 4, y: 3 });
  });
  it('moves an aggregate center with its chosen member attachment while preserving its world-axis offset', () => {
    const f = nativeThreeLeaves(),
      authority = new BodyDocumentAuthority(f.document);
    const anchor = f.document.attachments.find((point) => point.bodyId === f.members[1])!;
    const point = { x: 0.4, y: 0.8 };
    commit(authority, [
      {
        kind: 'group-properties',
        members: f.members,
        change: {
          mass: {
            mass: 12,
            center: { point, editAnchor: { attachmentId: anchor.id } },
          },
        },
      },
    ]);
    const transform = { x: 3, y: -2, angle: Math.PI / 2 };
    commit(authority, [
      {
        kind: 'body-poses',
        poses: f.members.map((bodyId) => ({
          bodyId,
          pose: compose(transform, material(f.document, bodyId).pose),
        })),
      },
    ]);
    const result = reopen(authority.document),
      group = result.groups[0];
    const world = localToWorld(material(result, group.frameBody).pose, group.mass!.center!.point);
    // The reference attachment was at (1,0), and is now at (3,-1).
    expect(world.x).toBeCloseTo(2.4, 12);
    expect(world.y).toBeCloseTo(-0.2, 12);
    expect(group.mass!.mass).toBe(12);
    expect(group.mass!.center!.editAnchor).toEqual({ attachmentId: anchor.id });
  });
});
