import { BodyDocumentAuthority } from './body-document-authority';
import { BodyEditOperation } from './body-edit-types';
import { BodyDocument, BodyLoad } from './body-document';
import { newRecordId } from './body-id';
import { bodyForceEnds } from './body-force-edit';
import {
  decodeBodyDocument,
  encodeBodyDocument,
} from '../../services/transcoding/body-document-codec';
import {
  nativeThreeLeaves,
  NATIVE_EDIT_CONTEXT,
} from '../../../test-utils/verification/native-lifecycle-fixtures';
import { nativeFourBar } from '../../../test-utils/verification/native-body-fixtures';

const state = NATIVE_EDIT_CONTEXT.state;
function reopen(document: BodyDocument): BodyDocument {
  const encoded = encodeBodyDocument(document);
  if (!encoded.ok) throw new Error(JSON.stringify(encoded));
  const decoded = decodeBodyDocument(encoded.payload);
  if (!decoded.ok) throw new Error(JSON.stringify(decoded));
  return decoded.document;
}
function commit(authority: BodyDocumentAuthority, operations: readonly BodyEditOperation[]) {
  const result = authority.commit({ id: 'properties', operations }, state);
  if (!result.ok) throw new Error(result.message);
  return result;
}
function fixture() {
  const f = nativeThreeLeaves();
  const body = f.members[0],
    second = f.members[1];
  const anchors = f.document.attachments.filter((point) => point.bodyId === body);
  const force: BodyLoad = {
    id: newRecordId<'force'>(),
    bodyId: body,
    label: 'Load',
    point: { x: 0.2, y: 0.1 },
    frame: 'body',
    vector: { x: 3, y: 4 },
    couple: 2,
    presentation: { color: '#008577', length: 2.5 },
  };
  const document = { ...f.document, forces: [force] };
  return { ...f, body, second, anchors, force, authority: new BodyDocumentAuthority(document) };
}

describe('native property transactions', () => {
  it('edits material and group values without overwriting members, then retains them through undo and save/reopen', () => {
    const { authority, body, force, members, anchors } = fixture();
    const original = authority.document;
    commit(authority, [
      {
        kind: 'body-properties',
        bodyId: body,
        change: {
          label: 'Bracket',
          presentation: { fill: '#ef6c00', outline: 'circle' },
          mass: {
            mass: { mode: 'explicit', value: 3 },
            inertia: { mode: 'explicit', value: 7 },
            center: {
              mode: 'explicit',
              point: { x: 0.4, y: -0.2 },
              editAnchor: { attachmentId: anchors[0].id },
            },
          },
        },
      },
      {
        kind: 'group-properties',
        members,
        change: {
          label: 'Welded bracket',
          presentation: { fill: '#7b1fa2' },
          mass: {
            mass: 12,
            center: { point: { x: 0.3, y: 0.2 }, editAnchor: { attachmentId: anchors[0].id } },
          },
        },
      },
      {
        kind: 'force-properties',
        forceId: force.id,
        change: { presentation: { color: '#1565c0' } },
      },
      {
        kind: 'attachment-properties',
        attachmentId: anchors[0].id,
        change: { color: '#008577', trace: true, label: 'Witness' },
      },
    ]);
    const saved = reopen(authority.document);
    expect(saved.bodies.find((item) => item.id === body)).toMatchObject({
      label: 'Bracket',
      presentation: { fill: '#ef6c00' },
      mass: { inertia: { value: 7 } },
    });
    expect(saved.groups[0]).toMatchObject({
      label: 'Welded bracket',
      presentation: { fill: '#7b1fa2' },
      mass: { mass: 12 },
    });
    expect(saved.forces[0].presentation).toEqual({ color: '#1565c0', length: 2.5 });
    expect(saved.attachments.find((item) => item.id === anchors[0].id)).toMatchObject({
      trace: true,
      color: '#008577',
    });
    expect(authority.undoDepth).toBe(1);
    authority.undo(state);
    expect(authority.document).toEqual(original);
    authority.redo(state);
    expect(reopen(authority.document)).toEqual(saved);
  });
  it('keeps no-ops and refused bulk properties out of history', () => {
    const { authority, body, second } = fixture();
    const source = authority.document;
    expect(
      commit(authority, [{ kind: 'body-properties', bodyId: body, change: { label: 'Member 0' } }])
        .changed
    ).toBe(false);
    const result = authority.commit(
      {
        id: 'bad-batch',
        operations: [
          { kind: 'body-properties', bodyId: body, change: { label: 'Would change' } },
          {
            kind: 'body-properties',
            bodyId: second,
            change: { mass: { mass: { mode: 'explicit', value: -1 } } },
          },
        ],
      },
      state
    );
    expect(result).toMatchObject({ ok: false, code: 'invalid-document' });
    expect(authority.document).toEqual(source);
    expect(authority.undoDepth).toBe(0);
    const change = { label: 'Not a rename', id: newRecordId<'body'>() };
    expect(
      authority.commit(
        { id: 'bad-id', operations: [{ kind: 'body-properties', bodyId: body, change }] },
        state
      )
    ).toMatchObject({ ok: false, code: 'invalid-command' });
  });
  it('retains material force ownership and visual/lock state when its weld is released', () => {
    const { authority, body, force, anchors, members, links } = fixture();
    commit(authority, [
      {
        kind: 'body-properties',
        bodyId: body,
        change: {
          mass: {
            center: {
              mode: 'explicit',
              point: { x: 0.4, y: -0.2 },
              editAnchor: { attachmentId: anchors[0].id },
            },
          },
        },
      },
      { kind: 'lock', targets: [{ kind: 'force', id: force.id }], locked: true },
      {
        kind: 'group-properties',
        members,
        change: { label: 'Assembly paint', presentation: { fill: '#7b1fa2' } },
      },
    ]);
    const before = authority.document;
    commit(
      authority,
      links.map((joint) => ({
        kind: 'joint-kind' as const,
        jointId: joint.id,
        jointKind: 'revolute' as const,
        worldPoint: { x: 0, y: 0 },
      }))
    );
    const after = reopen(authority.document);
    expect(after.forces).toEqual(before.forces);
    expect(after.forces[0].bodyId).toBe(body);
    expect(after.bodies.find((item) => item.id === body)).toEqual(
      before.bodies.find((item) => item.id === body)
    );
    expect(after.groups.every((group) => group.label !== 'Assembly paint')).toBe(true);
  });
  it('preserves a force in world coordinates when switching axes or assigning its material owner', () => {
    const { authority, force, second } = fixture();
    const start = bodyForceEnds(authority.document, force);
    commit(authority, [
      { kind: 'force-properties', forceId: force.id, change: { frame: 'world' } },
    ]);
    expect(authority.document.forces[0].vector).toEqual({ x: 3, y: 4 });
    commit(authority, [
      { kind: 'force-properties', forceId: force.id, change: { frame: 'body' } },
      { kind: 'force-owner', forceId: force.id, bodyId: second },
    ]);
    const changed = authority.document.forces[0];
    const expected = {
      x: 3 * Math.cos(0.2) + 4 * Math.sin(0.2),
      y: -3 * Math.sin(0.2) + 4 * Math.cos(0.2),
    };
    expect(changed.vector.x).toBeCloseTo(expected.x, 12);
    expect(changed.vector.y).toBeCloseTo(expected.y, 12);
    const end = bodyForceEnds(authority.document, changed);
    for (let i = 0; i < 2; i++) {
      expect(end[i].x).toBeCloseTo(start[i].x, 12);
      expect(end[i].y).toBeCloseTo(start[i].y, 12);
    }
    expect(changed.presentation).toEqual(force.presentation);
    expect(changed.couple).toBe(2);
    commit(authority, [
      { kind: 'force-properties', forceId: force.id, change: { frame: 'world' } },
    ]);
    expect(authority.document.forces[0].vector.x).toBeCloseTo(3, 12);
    expect(authority.document.forces[0].vector.y).toBeCloseTo(4, 12);
  });
  it('allows a locked force to change magnitude or color but refuses moving either handle', () => {
    const { authority, force } = fixture();
    commit(authority, [{ kind: 'lock', targets: [{ kind: 'force', id: force.id }], locked: true }]);
    commit(authority, [
      {
        kind: 'force-properties',
        forceId: force.id,
        change: { vector: { x: 6, y: 8 }, presentation: { color: '#f44336' } },
      },
    ]);
    const original = authority.document,
      depth = authority.undoDepth;
    for (const change of [
      { point: { x: 0.3, y: 0.1 } },
      { vector: { x: -6, y: -8 } },
      { presentation: { length: 3 } },
    ]) {
      expect(
        authority.commit(
          { id: 'locked', operations: [{ kind: 'force-properties', forceId: force.id, change }] },
          state
        )
      ).toMatchObject({ ok: false, code: 'locked-position' });
      expect(authority.document).toBe(original);
      expect(authority.undoDepth).toBe(depth);
    }
    commit(authority, [
      { kind: 'force-properties', forceId: force.id, change: { vector: { x: 0, y: 0 } } },
    ]);
    expect(reopen(authority.document).forces[0].presentation?.zeroAngle).toBeCloseTo(
      Math.atan2(4, 3),
      12
    );
    commit(authority, [{ kind: 'delete', targets: [{ kind: 'force', id: force.id }] }]);
    expect(authority.document.forces).toEqual([]);
  });
  it('keeps the custom center in place when its editing attachment is removed and restores that anchor on Undo', () => {
    const { authority, body, anchors } = fixture();
    const point = { x: 0.4, y: -0.2 };
    commit(authority, [
      {
        kind: 'body-properties',
        bodyId: body,
        change: {
          mass: {
            center: { mode: 'explicit', point, editAnchor: { attachmentId: anchors[0].id } },
          },
        },
      },
    ]);
    commit(authority, [{ kind: 'delete', targets: [{ kind: 'attachment', id: anchors[0].id }] }]);
    expect(authority.document.bodies.find((item) => item.id === body)).toMatchObject({
      mass: { center: { mode: 'explicit', point, editAnchor: 'body' } },
    });
    authority.undo(state);
    expect(authority.document.bodies.find((item) => item.id === body)).toMatchObject({
      mass: { center: { editAnchor: { attachmentId: anchors[0].id } } },
    });
  });
  it('does not repair a newly assigned invalid center anchor out of a deletion batch', () => {
    const { authority, body, second } = fixture();
    const foreign = authority.document.attachments.find((point) => point.bodyId === second)!;
    const original = authority.document;
    expect(
      authority.commit(
        {
          id: 'bad-anchor',
          operations: [
            {
              kind: 'body-properties',
              bodyId: body,
              change: {
                mass: {
                  center: {
                    mode: 'explicit',
                    point: { x: 0.4, y: 0.2 },
                    editAnchor: { attachmentId: foreign.id },
                  },
                },
              },
            },
            { kind: 'delete', targets: [{ kind: 'attachment', id: foreign.id }] },
          ],
        },
        state
      )
    ).toMatchObject({ ok: false, code: 'invalid-document' });
    expect(authority.document).toBe(original);
  });
  it('retains an aggregate center when its independent editing reference is deleted', () => {
    const { authority, body, members } = fixture();
    const id = newRecordId<'attachment'>(),
      point = { x: 0.7, y: -0.4 };
    commit(authority, [
      {
        kind: 'insert',
        records: {
          attachments: [
            { id, bodyId: body, point: { x: 0.1, y: 0.2 }, label: 'Anchor', trace: false },
          ],
        },
      },
      {
        kind: 'group-properties',
        members,
        change: { mass: { mass: 12, center: { point, editAnchor: { attachmentId: id } } } },
      },
    ]);
    commit(authority, [{ kind: 'delete', targets: [{ kind: 'attachment', id }] }]);
    expect(reopen(authority.document).groups[0].mass).toEqual({
      mass: 12,
      center: { point, editAnchor: 'body' },
    });
    authority.undo(state);
    expect(authority.document.groups[0].mass?.center?.editAnchor).toEqual({ attachmentId: id });
  });
  it('keeps world-axis conversions closed at a displaced pose until their displayed frames are supplied', () => {
    const { authority, force, second } = fixture(),
      source = authority.document;
    const posed = { ...state, atStart: false, sharedStepZero: false };
    for (const operation of [
      { kind: 'force-properties' as const, forceId: force.id, change: { frame: 'world' as const } },
      { kind: 'force-owner' as const, forceId: force.id, bodyId: second },
    ])
      expect(authority.commit({ id: 'needs-pose', operations: [operation] }, posed)).toMatchObject({
        ok: false,
        code: 'permission',
      });
    expect(authority.document).toBe(source);
  });
  it('preserves a paused crank clock through physical properties, trace, and hold edits', () => {
    const f = nativeFourBar({ ground: 3, crank: 1, coupler: 3, rocker: 2 });
    const authority = new BodyDocumentAuthority(f.document);
    const body = f.document.joints.find((joint) => joint.id === f.driver.coordinate.jointId)!.bodyB;
    const points = f.document.attachments.filter((point) => point.bodyId === body);
    const clocks = authority.local.clocks.map((clock) => ({
      ...clock,
      command: 0.5,
      time: 0.5,
      synced: false,
    }));
    authority.setLocalState({ selection: [], clocks });
    const result = authority.commit(
      {
        id: 'posed-properties',
        operations: [
          {
            kind: 'body-properties',
            bodyId: body,
            change: { mass: { mass: { mode: 'explicit', value: 5 } } },
          },
          { kind: 'attachment-properties', attachmentId: points[0].id, change: { trace: true } },
          { kind: 'hold', bodyId: body, from: points[0].id, to: points[1].id, dimension: 'length' },
        ],
      },
      { ...state, atStart: false, sharedStepZero: false, mode: 'analysis' }
    );
    expect(result).toMatchObject({ ok: true, changed: true });
    expect(authority.local.clocks).toEqual(clocks);
    expect(reopen(authority.document).holds[0].length).toBeCloseTo(1, 12);
  });
});
