import { BodyFactory } from './body-factory';
import { BodyDocumentAuthority } from './body-document-authority';
import { BodyDocument } from './body-document';
import { newRecordId } from './body-id';
import { compileWeldFrames } from './weld-frames';
import { relativePose } from './body-frame';
import { NATIVE_EDIT_CONTEXT } from '../../../test-utils/verification/native-lifecycle-fixtures';
import {
  encodeBodyDocument,
  decodeBodyDocument,
} from '../../services/transcoding/body-document-codec';
const state = NATIVE_EDIT_CONTEXT.state;
function reopen(d: BodyDocument) {
  const e = encodeBodyDocument(d);
  if (!e.ok) throw new Error('encode');
  const r = decodeBodyDocument(e.payload);
  if (!r.ok) throw new Error('decode');
  return r.document;
}
describe('native lifecycle integration regression ports', () => {
  it('keeps the real guide, force, hold, lock, trace, color and selected material across merge and release, in independent array orders', () => {
    const f = new BodyFactory(),
      ids = [0, 1, 2, 3].map((i) =>
        f.body(`Material ${i}`, { x: i, y: 0, angle: 0 }, [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ])
      );
    const anchors = ids.map((id) => f.attachment(id, { x: 0, y: 0 }));
    f.joint('weld', anchors[0], anchors[1]);
    f.joint('weld', anchors[2], anchors[3]);
    const rail = f.body('carrier', { x: 0, y: 0, angle: 0 }, [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
    ]);
    const slot = f.joint('pin-in-slot', f.attachment(rail, { x: 0, y: 0 }), anchors[0]);
    const end = f.attachment(ids[0], { x: 1, y: 0 });
    const force = {
      id: newRecordId<'force'>(),
      bodyId: ids[0],
      point: { x: 0, y: 0 },
      label: 'shared pin',
      frame: 'body' as const,
      vector: { x: 3, y: -2 },
      couple: 1,
      locked: true,
    };
    const baseline: BodyDocument = {
      ...f.document,
      forces: [force],
      holds: [{ bodyId: ids[0], from: anchors[0], to: end, length: 1 }],
      locks: [end],
      attachments: f.document.attachments.map((p) =>
        p.id === anchors[0] ? { ...p, trace: true, color: '#aabbcc' } : p
      ),
    };
    for (let mask = 0; mask < 8; mask++) {
      const source = {
        ...baseline,
        bodies: mask & 1 ? [...baseline.bodies].reverse() : baseline.bodies,
        joints: mask & 2 ? [...baseline.joints].reverse() : baseline.joints,
        attachments: mask & 4 ? [...baseline.attachments].reverse() : baseline.attachments,
      };
      const a = new BodyDocumentAuthority(source);
      a.setLocalState({ clocks: [], selection: [{ kind: 'body', id: ids[0] }] });
      const join = {
        kind: 'weld' as const,
        id: newRecordId<'joint'>(),
        label: 'merge',
        bodyA: ids[1],
        bodyB: ids[2],
        frameA: { attachmentId: anchors[1], angle: 0 },
        frameB: { attachmentId: anchors[2], angle: 0 },
        rest: relativePose(
          source.bodies.find((b) => b.id === ids[1])!.pose,
          source.bodies.find((b) => b.id === ids[2])!.pose
        ),
      };
      expect(
        a.commit(
          { id: 'merge', operations: [{ kind: 'insert', records: { joints: [join] } }] },
          state
        ).ok
      ).toBe(true);
      const compiled = compileWeldFrames(a.document);
      if (!compiled.ok) throw new Error('weld');
      expect(compiled.groupOf.get(ids[0])!.members.size).toBe(4);
      expect(
        a.commit(
          {
            id: 'release',
            operations: [{ kind: 'delete', targets: [{ kind: 'joint', id: join.id }] }],
          },
          state
        ).ok
      ).toBe(true);
      const result = reopen(a.document);
      for (const body of baseline.bodies)
        expect(result.bodies.find((b) => b.id === body.id)).toEqual(body);
      expect(result.joints.find((j) => j.id === slot.id)).toEqual(slot);
      expect(result.forces).toEqual([force]);
      expect(result.holds).toEqual(baseline.holds);
      expect(result.locks).toEqual([end]);
      expect(result.attachments.find((p) => p.id === anchors[0])).toEqual(
        baseline.attachments.find((p) => p.id === anchors[0])
      );
      expect(a.local.selection).toEqual([{ kind: 'body', id: ids[0] }]);
      expect(a.undoDepth).toBe(2);
      a.undo(state);
      a.redo(state);
      expect(encodeBodyDocument(a.document)).toEqual(encodeBodyDocument(result));
    }
  });
  it('removes the last R without deleting its material, free attachment or owned load; deleting material then removes the load', () => {
    const f = new BodyFactory(),
      a = f.body('a', { x: 0, y: 0, angle: 0 }, [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ]),
      b = f.body('b', { x: 0, y: 0, angle: 0 }, [
        { x: 0, y: 0 },
        { x: 0, y: 1 },
      ]);
    const joint = f.joint(
      'revolute',
      f.attachment(a, { x: 0, y: 0 }),
      f.attachment(b, { x: 0, y: 0 })
    );
    const force = {
      id: newRecordId<'force'>(),
      bodyId: b,
      point: { x: 0, y: 0 },
      label: 'load',
      frame: 'world' as const,
      vector: { x: 0, y: -2 },
      couple: 0,
    };
    const authority = new BodyDocumentAuthority({ ...f.document, forces: [force] });
    expect(
      authority.commit(
        {
          id: 'disconnect',
          operations: [{ kind: 'delete', targets: [{ kind: 'joint', id: joint.id }] }],
        },
        state
      ).ok
    ).toBe(true);
    expect(authority.document.bodies).toEqual(f.document.bodies);
    expect(authority.document.attachments).toEqual(f.document.attachments);
    expect(authority.document.forces).toEqual([force]);
    expect(
      authority.commit(
        { id: 'remove', operations: [{ kind: 'delete', targets: [{ kind: 'body', id: b }] }] },
        state
      ).ok
    ).toBe(true);
    expect(authority.document.forces).toEqual([]);
    expect(authority.document.attachments.some((p) => p.bodyId === b)).toBe(false);
  });
});
