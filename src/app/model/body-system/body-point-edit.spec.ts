import { BodyDocumentAuthority } from './body-document-authority';
import { BodyEditOperation } from './body-edit-types';
import { BodyFactory } from './body-factory';
import { MaterialBody } from './material-body';
import { createBodyCylinder } from './cylinder-factory';
import { emptyBodyDocument, BodyDocument } from './body-document';
import { AttachmentId, BodyId, WORLD } from './body-id';
import { localToWorld } from './body-frame';
import { nativeEditableBar } from '../../../test-utils/verification/native-geometry-fixture';
import {
  nativeThreeLeaves,
  NATIVE_EDIT_CONTEXT,
} from '../../../test-utils/verification/native-lifecycle-fixtures';

const state = NATIVE_EDIT_CONTEXT.state;
function commit(a: BodyDocumentAuthority, operations: readonly BodyEditOperation[]) {
  const result = a.commit({ id: 'point-move', operations }, state);
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result;
}
function world(d: BodyDocument, id: AttachmentId) {
  const p = d.attachments.find((p) => p.id === id)!;
  return localToWorld(d.bodies.find((b) => b.id === p.bodyId)!.pose, p.point);
}
function body(d: BodyDocument, id: BodyId) {
  return d.bodies.find((b) => b.id === id)! as MaterialBody;
}

describe('native connected point proposals', () => {
  it('changes a bound bar endpoint while leaving an unbound witness and the other endpoint alone', () => {
    const f = nativeEditableBar(),
      a = new BodyDocumentAuthority(f.document);
    commit(a, [{ kind: 'move-point', attachmentId: f.b, target: { x: 12, y: 3 } }]);
    expect(world(a.document, f.b).x).toBeCloseTo(12, 12);
    expect(world(a.document, f.b).y).toBeCloseTo(3, 12);
    expect(world(a.document, f.a)).toEqual({ x: 0, y: 0 });
    expect(world(a.document, f.witness)).toEqual({ x: 3, y: 2 });
    expect(body(a.document, f.body.id).geometry).toMatchObject({
      vertices: [
        { x: 0, y: 0 },
        { x: 12, y: 3 },
      ],
    });
  });
  it('tows the other end of a length-held free bar without changing its length', () => {
    const f = nativeEditableBar(),
      a = new BodyDocumentAuthority(f.document);
    commit(a, [{ kind: 'hold', bodyId: f.body.id, from: f.a, to: f.b, dimension: 'length' }]);
    commit(a, [{ kind: 'move-point', attachmentId: f.b, target: { x: 12, y: 0 } }]);
    expect(world(a.document, f.a).x).toBeCloseTo(2, 12);
    expect(world(a.document, f.b).x).toBeCloseTo(12, 12);
    expect(a.document.holds[0].length).toBe(10);
  });
  it('reaches an exact point on a held arc and carries the bar witness rigidly', () => {
    const f = nativeEditableBar(true),
      a = new BodyDocumentAuthority(f.document);
    commit(a, [{ kind: 'hold', bodyId: f.body.id, from: f.a, to: f.b, dimension: 'length' }]);
    commit(a, [{ kind: 'move-point', attachmentId: f.b, target: { x: 6, y: 8 } }]);
    expect(world(a.document, f.b).x).toBeCloseTo(6, 12);
    expect(world(a.document, f.b).y).toBeCloseTo(8, 12);
    // cos=3/5 and sin=4/5: the original witness (3,2) turns with the whole material.
    expect(world(a.document, f.witness).x).toBeCloseTo(0.2, 12);
    expect(world(a.document, f.witness).y).toBeCloseTo(3.6, 12);
    expect(a.document.attachments).toEqual(f.document.attachments);
    expect(body(a.document, f.body.id).geometry).toEqual(f.body.geometry);
  });
  it('projects a pointer goal onto a held arc while the same typed coordinate refuses', () => {
    const f = nativeEditableBar(true),
      a = new BodyDocumentAuthority(f.document);
    commit(a, [{ kind: 'hold', bodyId: f.body.id, from: f.a, to: f.b, dimension: 'length' }]);
    const before = a.document;
    const op = { kind: 'move-point' as const, attachmentId: f.b, target: { x: 9, y: 12 } };
    expect(a.commit({ id: 'typed-outside', operations: [op] }, state)).toMatchObject({ ok: false });
    expect(a.document).toBe(before);
    commit(a, [{ ...op, mode: 'project' }]);
    expect(world(a.document, f.b).x).toBeCloseTo(6, 8);
    expect(world(a.document, f.b).y).toBeCloseTo(8, 8);
    expect(world(a.document, f.witness).x).toBeCloseTo(0.2, 8);
    expect(world(a.document, f.witness).y).toBeCloseTo(3.6, 8);
  });
  it('does not mistake the farthest point on a held circle for the nearest projected pose', () => {
    const f = nativeEditableBar(true),
      a = new BodyDocumentAuthority(f.document);
    commit(a, [{ kind: 'hold', bodyId: f.body.id, from: f.a, to: f.b, dimension: 'length' }]);
    commit(a, [
      { kind: 'move-point', attachmentId: f.b, target: { x: -15, y: 0 }, mode: 'project' },
    ]);
    expect(world(a.document, f.b).x).toBeCloseTo(-10, 8);
    expect(world(a.document, f.b).y).toBeCloseTo(0, 8);
    expect(world(a.document, f.witness).x).toBeCloseTo(-3, 8);
    expect(world(a.document, f.witness).y).toBeCloseTo(-2, 8);
    a.undo(state);
    commit(a, [{ kind: 'move-point', attachmentId: f.b, target: { x: -10, y: 0 } }]);
    expect(world(a.document, f.b).x).toBeCloseTo(-10, 12);
    expect(world(a.document, f.b).y).toBeCloseTo(0, 12);
  });
  it('refuses an impossible held length with its unrequested ground pin fixed, without leaking the partial solve', () => {
    const f = nativeEditableBar(true),
      a = new BodyDocumentAuthority(f.document);
    commit(a, [{ kind: 'hold', bodyId: f.body.id, from: f.a, to: f.b, dimension: 'length' }]);
    const original = a.document;
    expect(
      a.commit(
        {
          id: 'impossible',
          operations: [{ kind: 'move-point', attachmentId: f.b, target: { x: 12, y: 0 } }],
        },
        state
      )
    ).toMatchObject({ ok: false });
    expect(a.document).toBe(original);
    expect(a.undoDepth).toBe(1);
  });
  it('moves an explicitly requested ground attachment while keeping WORLD itself immutable', () => {
    const f = nativeEditableBar(true),
      a = new BodyDocumentAuthority(f.document);
    commit(a, [{ kind: 'move-point', attachmentId: f.a, target: { x: 2, y: 1 } }]);
    for (const p of a.document.attachments.filter((p) => p.id !== f.b && p.id !== f.witness)) {
      expect(world(a.document, p.id).x).toBeCloseTo(2, 12);
      expect(world(a.document, p.id).y).toBeCloseTo(1, 12);
    }
    expect(a.document.bodies.find((b) => b.kind === 'world')).toEqual(
      f.document.bodies.find((b) => b.kind === 'world')
    );
  });
  it('collects a three-way R pin through its binary connections instead of relying on one selected body', () => {
    const f = nativeEditableBar(),
      factory = new BodyFactory(f.document);
    const ids = [
      f.body.id,
      ...[1, 2].map((i) =>
        factory.body(`Neighbor ${i}`, { x: 10, y: 0, angle: i * 0.2 }, [
          { x: 0, y: 0 },
          { x: 2, y: 0 },
        ])
      ),
    ];
    const pin = factory.junction(ids, { x: 10, y: 0 });
    const a = new BodyDocumentAuthority(factory.document);
    commit(a, [{ kind: 'move-point', attachmentId: pin.attachments[1], target: { x: 11, y: 2 } }]);
    for (const id of pin.attachments) {
      expect(world(a.document, id).x).toBeCloseTo(11, 12);
      expect(world(a.document, id).y).toBeCloseTo(2, 12);
    }
    expect(a.undoDepth).toBe(1);
    a.undo(state);
    expect(a.document).toEqual(factory.document);
  });
  it('moves an unbound tracer on welded material without moving the bodies', () => {
    const f = nativeThreeLeaves(),
      factory = new BodyFactory(f.document);
    const tracer = factory.attachment(f.members[0], { x: 0.2, y: 0.7 });
    const a = new BodyDocumentAuthority(factory.document);
    commit(a, [{ kind: 'move-point', attachmentId: tracer, target: { x: 0.8, y: 1.2 } }]);
    expect(a.document.bodies).toEqual(factory.document.bodies);
    expect(world(a.document, tracer).x).toBeCloseTo(0.8, 12);
    expect(world(a.document, tracer).y).toBeCloseTo(1.2, 12);
  });
  it('moves a cylinder outer point on its internal P and refuses travel beyond the stop atomically', () => {
    const f = createBodyCylinder(
      emptyBodyDocument(),
      { x: 0, y: 0, angle: 0 },
      { barrelLength: 3, rodLength: 2, bore: 0.4, rodDiameter: 0.2, stroke: 1.5 },
      0.4
    );
    const factory = new BodyFactory(f.document);
    factory.joint('weld', factory.attachment(WORLD, { x: 0, y: 0 }), f.assembly.barrelMount);
    const a = new BodyDocumentAuthority(factory.document),
      mount = f.assembly.rodMount;
    commit(a, [{ kind: 'move-point', attachmentId: mount, target: { x: 4, y: 0 } }]);
    expect(world(a.document, mount).x).toBeCloseTo(4, 12);
    expect(a.document.attachments).toEqual(factory.document.attachments);
    const before = a.document,
      depth = a.undoDepth;
    expect(
      a.commit(
        {
          id: 'past-stop',
          operations: [{ kind: 'move-point', attachmentId: mount, target: { x: 5, y: 0 } }],
        },
        state
      )
    ).toMatchObject({ ok: false });
    expect(a.document).toBe(before);
    expect(a.undoDepth).toBe(depth);
  });
  it('replans a stale point preview after a new welded neighbor is attached', () => {
    const f = nativeEditableBar(),
      a = new BodyDocumentAuthority(f.document);
    const preview = a.preview(
      {
        id: 'preview-before-weld',
        operations: [{ kind: 'move-point', attachmentId: f.b, target: { x: 12, y: 0 } }],
      },
      state
    );
    expect(preview.ok).toBe(true);
    if (!preview.ok) throw new Error(preview.message);
    const factory = new BodyFactory(a.document);
    const neighbor = factory.body('New neighbor', { x: 10, y: 0, angle: 0 }, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    const anchor = factory.attachment(neighbor, { x: 0, y: 0 });
    const weld = factory.joint('weld', f.b, anchor);
    commit(a, [
      {
        kind: 'insert',
        records: {
          bodies: [factory.document.bodies.find((b) => b.id === neighbor)!],
          attachments: [factory.document.attachments.find((p) => p.id === anchor)!],
          joints: [weld],
        },
      },
    ]);
    expect(a.commit(preview, state).ok).toBe(true);
    expect(body(a.document, f.body.id).geometry).toEqual(f.body.geometry);
    expect(world(a.document, f.b).x).toBeCloseTo(12, 12);
    expect(world(a.document, anchor).x).toBeCloseTo(12, 12);
    expect(world(a.document, anchor).y).toBeCloseTo(0, 12);
    expect(a.document.joints).toContainEqual(weld);
    expect(a.undoDepth).toBe(2);
  });
  it('carries welded material and off-axis witnesses rigidly rather than changing local points', () => {
    const f = nativeThreeLeaves(),
      a = new BodyDocumentAuthority(f.document);
    const selected = f.document.attachments.find((p) => p.bodyId === f.members[0])!;
    commit(a, [{ kind: 'move-point', attachmentId: selected.id, target: { x: 0.5, y: 0.4 } }]);
    expect(world(a.document, selected.id).x).toBeCloseTo(0.5, 12);
    expect(world(a.document, selected.id).y).toBeCloseTo(0.4, 12);
    expect(a.document.attachments).toEqual(f.document.attachments);
    expect(a.document.joints).toEqual(f.document.joints);
    for (const id of f.members)
      expect(body(a.document, id).geometry).toEqual(body(f.document, id).geometry);
  });
});
