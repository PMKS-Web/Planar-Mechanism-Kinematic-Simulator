import {
  nativeCrossedCylinders,
  nativeThreeLeaves,
  executeNativeEdit,
  insertNativeFixture,
  NATIVE_EDIT_CONTEXT,
} from '../../../test-utils/verification/native-lifecycle-fixtures';
import { planBodyEdit } from './body-edit-plan';
import { compileWeldFrames } from './weld-frames';
import { BodyFactory } from './body-factory';
import { localToWorld } from './body-frame';
import {
  decodeBodyDocument,
  encodeBodyDocument,
} from '../../services/transcoding/body-document-codec';
import { BodyDocument } from './body-document';
import { newRecordId } from './body-id';

function reopen(document: BodyDocument) {
  const encoded = encodeBodyDocument(document);
  if (!encoded.ok) throw new Error(JSON.stringify(encoded));
  const decoded = decodeBodyDocument(encoded.payload);
  if (!decoded.ok) throw new Error(JSON.stringify(decoded));
  return decoded.document;
}
describe('native deletion ownership across welded groups', () => {
  it('takes both members of an assembly across groups without taking either surviving bracket', () => {
    for (const reverse of [false, true]) {
      const fixture = nativeCrossedCylinders(),
        source = reverse
          ? {
              ...fixture.document,
              bodies: [...fixture.document.bodies].reverse(),
              joints: [...fixture.document.joints].reverse(),
            }
          : fixture.document;
      const result = reopen(
        executeNativeEdit(source, [
          { kind: 'delete', targets: [{ kind: 'assembly', id: fixture.first.id }] },
        ])
      );
      expect(result.assemblies.map((assembly) => assembly.id)).toEqual([fixture.second.id]);
      expect(result.bodies).toHaveLength(6);
      expect(result.joints).toHaveLength(3);
      for (const id of fixture.brackets)
        expect(result.bodies.find((body) => body.id === id)).toEqual(
          source.bodies.find((body) => body.id === id)
        );
    }
  });
  it('previews and deletes every assembly owned by the selected group, keeping brackets in other groups', () => {
    const fixture = nativeCrossedCylinders(),
      frames = compileWeldFrames(fixture.document);
    if (!frames.ok) throw new Error(frames.code);
    const members = [...frames.groupOf.get(fixture.brackets[1])!.members.keys()];
    const plan = planBodyEdit(
      fixture.document,
      5,
      {
        id: 'delete-group',
        operations: [{ kind: 'delete', targets: [{ kind: 'group', members }] }],
      },
      {
        ...NATIVE_EDIT_CONTEXT,
        selection: [
          { kind: 'group', members },
          { kind: 'body', id: fixture.brackets[2] },
        ],
      }
    );
    if (!plan.ok) throw new Error(plan.message);
    expect(
      plan.effects.removed
        .filter((ref) => ref.kind === 'assembly')
        .map((ref) => ('id' in ref ? ref.id : ''))
        .sort()
    ).toEqual([fixture.first.id, fixture.second.id].sort());
    const result = reopen(plan.document);
    expect(result.assemblies).toEqual([]);
    expect(result.joints).toEqual([]);
    expect(result.bodies).toHaveLength(3);
    expect(plan.selection).toEqual([{ kind: 'body', id: fixture.brackets[2] }]);
  });
  it('never transfers a deleted carrier slot to another body that shares both of its points', () => {
    const f = new BodyFactory();
    const carrier = f.body('carrier', { x: 0, y: 0, angle: 0 }, [
      { x: 0, y: 0 },
      { x: 3, y: 0 },
    ]);
    const neighbor = f.body('same endpoints', { x: 0, y: 0, angle: 0 }, [
      { x: 0, y: 0 },
      { x: 3, y: 0 },
    ]);
    const rider = f.body('rider', { x: 1, y: 0, angle: 0 }, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    for (const x of [0, 3])
      f.joint('revolute', f.attachment(carrier, { x, y: 0 }), f.attachment(neighbor, { x, y: 0 }));
    const slot = f.joint(
      'prismatic',
      f.attachment(carrier, { x: 0, y: 0 }),
      f.attachment(rider, { x: 0, y: 0 })
    );
    const force = {
      id: newRecordId<'force'>(),
      bodyId: neighbor,
      label: 'shared pin load',
      point: { x: 0, y: 0 },
      vector: { x: 0, y: -5 },
      couple: 1,
      frame: 'world' as const,
    };
    const source = insertNativeFixture({ ...f.document, forces: [force] });
    const result = reopen(
      executeNativeEdit(source, [{ kind: 'delete', targets: [{ kind: 'body', id: carrier }] }])
    );
    expect(result.joints.some((joint) => joint.id === slot.id)).toBe(false);
    expect(result.joints).toEqual([]);
    expect(result.bodies.find((body) => body.id === neighbor)).toEqual(
      source.bodies.find((body) => body.id === neighbor)
    );
    expect(result.bodies.find((body) => body.id === rider)).toEqual(
      source.bodies.find((body) => body.id === rider)
    );
    expect(result.forces).toEqual([force]);
  });
  it('preserves an override after a zero-inertia leaf is removed and re-expresses its custom center if that leaf owned the frame', () => {
    const fixture = nativeThreeLeaves(),
      frame = fixture.members[2];
    const source: BodyDocument = {
      ...fixture.document,
      bodies: fixture.document.bodies.map((body) =>
        body.kind === 'material' && body.id === frame
          ? { ...body, mass: { ...body.mass, mass: { mode: 'explicit', value: 0 } } }
          : body
      ),
      groups: [
        {
          members: fixture.members,
          frameBody: frame,
          label: 'custom',
          presentation: { fill: '#26a69a', hidden: false, showCenter: true },
          mass: { mass: 12, inertia: 4, center: { point: { x: 0.2, y: 0.3 }, editAnchor: 'grid' } },
        },
      ],
    };
    const result = reopen(
      executeNativeEdit(source, [{ kind: 'delete', targets: [{ kind: 'body', id: frame }] }])
    );
    const group = result.groups[0],
      pose = result.bodies.find((body) => body.id === group.frameBody)!.pose;
    expect(group.mass?.mass).toBe(12);
    expect(group.mass?.inertia).toBe(4);
    expect(group.mass?.center?.editAnchor).toBe('grid');
    const world = localToWorld(pose, group.mass!.center!.point);
    expect(world.x).toBeCloseTo(2 + 0.2 * Math.cos(0.4) - 0.3 * Math.sin(0.4), 12);
    expect(world.y).toBeCloseTo(0.2 * Math.sin(0.4) + 0.3 * Math.cos(0.4), 12);
    const massive = {
      ...source,
      bodies: source.bodies.map((body) =>
        body.kind === 'material' && body.id === frame
          ? { ...body, mass: { ...body.mass, inertia: { mode: 'explicit' as const, value: 1 } } }
          : body
      ),
    };
    expect(
      planBodyEdit(
        massive,
        0,
        { id: 'delete', operations: [{ kind: 'delete', targets: [{ kind: 'body', id: frame }] }] },
        NATIVE_EDIT_CONTEXT
      )
    ).toMatchObject({ ok: false, code: 'aggregate-properties' });
  });
});
