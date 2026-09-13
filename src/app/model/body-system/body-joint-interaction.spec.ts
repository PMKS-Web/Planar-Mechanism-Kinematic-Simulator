import { BodyDocumentAuthority } from './body-document-authority';
import { emptyBodyDocument } from './body-document';
import {
  createNativeMember,
  nativeCommand,
  selectionBodies,
  weldedSelection,
} from './body-joint-interaction';
import { nativeMultiwayPin } from '../../../test-utils/verification/native-editor-fixtures';
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
