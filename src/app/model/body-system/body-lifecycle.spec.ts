import {
  nativeThreeCylinders,
  nativeThreeLeaves,
  executeNativeEdit,
  NATIVE_EDIT_CONTEXT,
} from '../../../test-utils/verification/native-lifecycle-fixtures';
import { planBodyEdit } from './body-edit-plan';
import { compileWeldFrames } from './weld-frames';
import {
  decodeBodyDocument,
  encodeBodyDocument,
} from '../../services/transcoding/body-document-codec';
import { BodyDocument } from './body-document';

const ORDERS = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];
function reopen(document: BodyDocument): BodyDocument {
  const saved = encodeBodyDocument(document);
  if (!saved.ok) throw new Error(JSON.stringify(saved));
  const read = decodeBodyDocument(saved.payload);
  if (!read.ok) throw new Error(JSON.stringify(read));
  return read.document;
}
describe('native compound lifecycle through editing commands', () => {
  it('deletes any one of three shared-mount cylinders while the other materials stay connected, in every construction order', () => {
    for (const order of ORDERS)
      for (const selected of [0, 1, 2]) {
        const fixture = nativeThreeCylinders(order),
          doomed = fixture.cylinders[selected];
        const result = reopen(
          executeNativeEdit(fixture.document, [
            { kind: 'delete', targets: [{ kind: 'assembly', id: doomed.id }] },
          ])
        );
        expect(result.assemblies.length).toBe(2);
        expect(result.bodies.length).toBe(5);
        expect(
          result.bodies.some((body) => body.id === doomed.barrel || body.id === doomed.rod)
        ).toBe(false);
        for (const assembly of fixture.cylinders.filter((assembly) => assembly !== doomed)) {
          expect(result.bodies.find((body) => body.id === assembly.barrel)).toEqual(
            fixture.document.bodies.find((body) => body.id === assembly.barrel)
          );
          expect(result.bodies.find((body) => body.id === assembly.rod)).toEqual(
            fixture.document.bodies.find((body) => body.id === assembly.rod)
          );
        }
        expect(result.junctions.length).toBe(1);
        expect(result.junctions[0].attachments.length).toBe(2);
        expect(result.junctions[0].joints.length).toBe(1);
        expect(result.joints.length).toBe(3);
      }
  });
  it('deleting a shared junction disconnects its mounts but preserves all three cylinders', () => {
    for (const order of ORDERS) {
      const fixture = nativeThreeCylinders(order);
      const result = reopen(
        executeNativeEdit(fixture.document, [
          { kind: 'delete', targets: [{ kind: 'junction', id: fixture.pin.id }] },
        ])
      );
      expect(result.assemblies).toHaveLength(3);
      expect(result.bodies).toHaveLength(7);
      expect(result.junctions).toHaveLength(0);
      expect(result.joints).toHaveLength(3);
      expect(result.attachments).toHaveLength(fixture.document.attachments.length);
    }
  });
  it('does not rebuild a deliberately removed pin edge while deleting the hub material in the same batch', () => {
    const fixture = nativeThreeCylinders(),
      hub = fixture.document.attachments.find((point) => point.id === fixture.pin.hub)!.bodyId;
    const assembly = fixture.cylinders.find((item) => item.barrel === hub)!;
    const result = reopen(
      executeNativeEdit(fixture.document, [
        {
          kind: 'delete',
          targets: [
            { kind: 'assembly', id: assembly.id },
            { kind: 'joint', id: fixture.pin.joints[0] },
          ],
        },
      ])
    );
    expect(result.junctions).toEqual([]);
    expect(result.joints).toHaveLength(2);
    expect(result.joints.every((joint) => joint.kind === 'prismatic')).toBe(true);
    expect(result.assemblies).toHaveLength(2);
  });

  it('retains group paint when one leaf is deleted and restores member paint on a true split', () => {
    for (const order of ORDERS) {
      const fixture = nativeThreeLeaves(order);
      const retained = reopen(
        executeNativeEdit(fixture.document, [
          { kind: 'delete', targets: [{ kind: 'body', id: fixture.members[2] }] },
        ])
      );
      expect(retained.groups[0].presentation?.fill).toBe('#26a69a');
      expect(retained.groups[0].label).toBe('Custom group');
      const split = reopen(
        executeNativeEdit(fixture.document, [
          { kind: 'delete', targets: [{ kind: 'joint', id: fixture.links[0].id }] },
        ])
      );
      expect(split.groups).toEqual([]);
      expect(split.bodies).toHaveLength(fixture.document.bodies.length);
      for (const id of fixture.members)
        expect(split.bodies.find((body) => body.id === id)).toEqual(
          fixture.document.bodies.find((body) => body.id === id)
        );
      const frames = compileWeldFrames(split);
      if (!frames.ok) throw new Error(frames.code);
      expect(frames.groupOf.get(fixture.members[0])).not.toBe(
        frames.groupOf.get(fixture.members[1])
      );
    }
  });
  it('refuses splitting an aggregate override until its reset is included in the same atomic edit', () => {
    const fixture = nativeThreeLeaves();
    const document = {
      ...fixture.document,
      groups: fixture.document.groups.map((group) => ({
        ...group,
        mass: { mass: 12, inertia: 4 },
      })),
    };
    const deletion = {
      kind: 'delete' as const,
      targets: [{ kind: 'joint' as const, id: fixture.links[0].id }],
    };
    expect(
      planBodyEdit(document, 0, { id: 'split', operations: [deletion] }, NATIVE_EDIT_CONTEXT)
    ).toMatchObject({ ok: false, code: 'aggregate-properties' });
    const result = reopen(
      executeNativeEdit(document, [
        { kind: 'reset-group-mass', member: fixture.members[0] },
        deletion,
      ])
    );
    expect(result.groups).toEqual([]);
    expect(result.bodies).toHaveLength(4);
  });
});
