import { BodyDocumentAuthority } from './body-document-authority';
import { emptyBodyDocument } from './body-document';
import {
  createNativeMember,
  insertNativeGround,
  attachmentWorld,
  nativeCommand,
  selectionBodies,
  weldedSelection,
} from './body-joint-interaction';
import { nativeMultiwayPin } from '../../../test-utils/verification/native-editor-fixtures';
import { bodyJointMarks } from './body-joint-marks';
import { WORLD } from './body-id';
import { EditState } from '../edit-permission';
const state: EditState = {
  mode: 'edit',
  playing: false,
  atStart: true,
  sharedStepZero: true,
  solveDeferred: false,
  empty: true,
  runnable: false,
};
it.each(['link', 'cylinder'] as const)(
  'creates a %s with one transaction and removes it with one undo',
  (kind) => {
    const authority = new BodyDocumentAuthority(emptyBodyDocument());
    const command = createNativeMember(authority.document, kind, { x: 1, y: 2 }, { x: 5, y: 5 });
    const preview = authority.preview(command, state);
    expect(preview.ok).toBe(true);
    expect(authority.document.bodies).toHaveLength(1);
    expect(authority.commit(command, state).ok).toBe(true);
    expect(authority.document.bodies).toHaveLength(kind === 'link' ? 2 : 3);
    expect(authority.undoDepth).toBe(1);
    expect(authority.undo(state).ok).toBe(true);
    expect(authority.document.bodies).toHaveLength(1);
  }
);
it('selects only the welded pair at a three-way pin regardless of the material array order', () => {
  const f = nativeMultiwayPin(),
    authority = new BodyDocumentAuthority(f.document);
  expect(
    authority.commit(
      nativeCommand({ kind: 'joint-kind', jointId: f.junction.joints[0], jointKind: 'weld' }),
      state
    ).ok
  ).toBe(true);
  const document = authority.document;
  const target = weldedSelection(document, f.members[0]);
  expect(new Set(selectionBodies(document, [target]))).toEqual(new Set(f.members.slice(0, 2)));
  expect(
    weldedSelection({ ...document, bodies: [...document.bodies].reverse() }, f.members[0])
  ).toEqual(target);
});
it('attaches a fourth link at a welded pair without absorbing it or duplicating the pin', () => {
  const f = nativeMultiwayPin(),
    authority = new BodyDocumentAuthority(f.document);
  expect(
    authority.commit(
      nativeCommand({ kind: 'joint-kind', jointId: f.junction.joints[0], jointKind: 'weld' }),
      state
    ).ok
  ).toBe(true);
  const command = createNativeMember(
    authority.document,
    'link',
    { x: 0, y: 0 },
    { x: -2, y: 1 },
    f.members[0]
  );
  const result = authority.commit(command, state);
  expect(result.ok).toBe(true);
  expect(authority.document.junctions).toHaveLength(1);
  expect(authority.document.junctions[0].attachments).toHaveLength(4);
  expect(
    selectionBodies(authority.document, [weldedSelection(authority.document, f.members[0])])
  ).toHaveLength(2);
  expect(authority.document.joints.filter((j) => j.kind === 'weld')).toHaveLength(1);
});
it('can weld the two non-hub members without turning the hub into their rigid group', () => {
  const f = nativeMultiwayPin(),
    authority = new BodyDocumentAuthority(f.document);
  const result = authority.commit(
    nativeCommand({
      kind: 'pin-pair-kind',
      junctionId: f.junction.id,
      a: f.junction.attachments[1],
      b: f.junction.attachments[2],
      jointKind: 'weld',
    }),
    state
  );
  expect(result.ok).toBe(true);
  expect(
    new Set(
      selectionBodies(authority.document, [weldedSelection(authority.document, f.members[1])])
    )
  ).toEqual(new Set(f.members.slice(1)));
  expect(weldedSelection(authority.document, f.members[0])).toEqual({
    kind: 'body',
    id: f.members[0],
  });
  expect(authority.document.junctions).toHaveLength(1);
  expect(authority.document.bodies).toEqual(f.document.bodies);
  expect(authority.undo(state).ok).toBe(true);
  expect(authority.document).toEqual(f.document);
});

it('grounds an existing multiway pin at its anchor and removes only the ground connection', () => {
  const f = nativeMultiwayPin(),
    authority = new BodyDocumentAuthority(f.document);
  const anchor = f.junction.attachments[0];
  const result = authority.commit(
    insertNativeGround(
      authority.document,
      f.members[0],
      { x: 0.02, y: 0.03 },
      'revolute',
      0,
      anchor
    ),
    state
  );
  expect(result.ok).toBe(true);
  const d = authority.document,
    pin = d.junctions[0];
  expect(d.junctions).toHaveLength(1);
  expect(pin.attachments).toHaveLength(4);
  const ground = d.attachments.find((a) => a.bodyId === WORLD)!;
  expect(ground.point).toEqual(attachmentWorld(f.document, anchor));
  expect(d.attachments.filter((a) => a.bodyId === f.members[0])).toEqual(
    f.document.attachments.filter((a) => a.bodyId === f.members[0])
  );
  const joint = d.joints.find((j) => j.bodyA === WORLD || j.bodyB === WORLD)!;
  expect(
    authority.commit(
      nativeCommand({ kind: 'delete', targets: [{ kind: 'joint', id: joint.id }] }),
      state
    ).ok
  ).toBe(true);
  expect(new Set(authority.document.junctions[0].attachments)).toEqual(
    new Set(f.junction.attachments)
  );
  expect(new Set(authority.document.joints)).toEqual(new Set(f.document.joints));
  expect(authority.document.attachments).toHaveLength(f.document.attachments.length);
});
it('keeps the complete grounded weld membership for group edits, selection and deletion', () => {
  const f = nativeMultiwayPin(),
    authority = new BodyDocumentAuthority(f.document);
  expect(
    authority.commit(
      nativeCommand({ kind: 'joint-kind', jointId: f.junction.joints[0], jointKind: 'weld' }),
      state
    ).ok
  ).toBe(true);
  expect(
    authority.commit(
      insertNativeGround(authority.document, f.members[0], { x: 0, y: 0 }, 'weld'),
      state
    ).ok
  ).toBe(true);
  const target = weldedSelection(authority.document, f.members[0]);
  expect(target.kind).toBe('group');
  if (target.kind !== 'group') return;
  expect(target.members).toContain(WORLD);
  expect(selectionBodies(authority.document, [target])).toHaveLength(2);
  authority.setLocalState({ ...authority.local, selection: [target] });
  expect(
    authority.commit(
      nativeCommand({
        kind: 'group-properties',
        members: target.members,
        change: { label: 'Grounded Bracket', presentation: { fill: '#123456' } },
      }),
      state
    ).ok
  ).toBe(true);
  expect(authority.document.groups[0].label).toBe('Grounded Bracket');
  expect(authority.local.selection).toEqual([target]);
  expect(authority.commit(nativeCommand({ kind: 'delete', targets: [target] }), state).ok).toBe(
    true
  );
  expect(authority.document.bodies.map((b) => b.id)).toEqual([WORLD, f.members[2]]);
  expect(authority.undo(state).ok).toBe(true);
  expect(authority.document.groups[0].label).toBe('Grounded Bracket');
});

it.each(['prismatic', 'pin-in-slot'] as const)(
  'releases only the selected pin edge when converting to %s',
  (kind) => {
    const f = nativeMultiwayPin(),
      authority = new BodyDocumentAuthority(f.document);
    const original = f.document.joints[0];
    expect(
      authority.commit(
        nativeCommand({
          kind: 'pin-pair-kind',
          junctionId: f.junction.id,
          a: original.frameA.attachmentId,
          b: original.frameB.attachmentId,
          jointKind: kind,
        }),
        state
      ).ok
    ).toBe(true);
    const d = authority.document;
    expect(d.joints.find((j) => j.id === original.id)?.kind).toBe(kind);
    expect(d.junctions).toHaveLength(1);
    expect(d.junctions[0].attachments).toHaveLength(2);
    expect(d.junctions[0].joints).not.toContain(original.id);
    expect(d.bodies).toEqual(f.document.bodies);
    expect(authority.undoDepth).toBe(1);
    expect(authority.undo(state).ok).toBe(true);
    expect(authority.document).toEqual(f.document);
  }
);
it.each(['prismatic', 'pin-in-slot'] as const)(
  'reunites a multiway pin after %s returns to R',
  (kind) => {
    const f = nativeMultiwayPin(),
      authority = new BodyDocumentAuthority(f.document);
    const edge = f.document.joints[0];
    expect(
      authority.commit(
        nativeCommand({
          kind: 'pin-pair-kind',
          junctionId: f.junction.id,
          a: edge.frameA.attachmentId,
          b: edge.frameB.attachmentId,
          jointKind: kind,
        }),
        state
      ).ok
    ).toBe(true);
    expect(
      authority.commit(
        nativeCommand({
          kind: 'joint-kind',
          jointId: edge.id,
          jointKind: 'revolute',
          worldPoint: attachmentWorld(authority.document, edge.frameB.attachmentId),
        }),
        state
      ).ok
    ).toBe(true);
    const d = authority.document;
    expect(d.junctions).toHaveLength(1);
    expect(new Set(d.junctions[0].attachments)).toEqual(new Set(f.junction.attachments));
    expect(d.junctions[0].joints).toHaveLength(2);
    expect(d.joints.map((j) => j.id).sort()).toEqual(f.document.joints.map((j) => j.id).sort());
    expect(bodyJointMarks(d).filter((m) => m.kind === 'revolute')).toHaveLength(1);
    expect(authority.undo(state).ok).toBe(true);
    expect(authority.document.joints.find((j) => j.id === edge.id)?.kind).toBe(kind);
  }
);
it('attaches to a bare binary R without leaving it outside the three-member pin', () => {
  const f = nativeMultiwayPin();
  const edge = f.document.joints[0];
  const d = {
    ...f.document,
    bodies: f.document.bodies.filter((b) => !f.members.slice(2).includes(b.id)),
    attachments: f.document.attachments.filter((a) => !f.members.slice(2).includes(a.bodyId)),
    joints: [edge],
    junctions: [],
  };
  const authority = new BodyDocumentAuthority(d);
  expect(
    authority.commit(
      createNativeMember(d, 'link', { x: 0, y: 0 }, { x: 2, y: -1 }, f.members[0]),
      state
    ).ok
  ).toBe(true);
  expect(authority.document.junctions).toHaveLength(1);
  expect(authority.document.junctions[0].attachments).toHaveLength(3);
  expect(authority.document.junctions[0].joints).toContain(edge.id);
  expect(bodyJointMarks(authority.document).filter((m) => m.kind === 'revolute')).toHaveLength(1);
});
