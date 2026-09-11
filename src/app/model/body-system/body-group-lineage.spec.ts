import { BodyFactory } from './body-factory';
import { planBodyEdit } from './body-edit-plan';
import {
  NATIVE_EDIT_CONTEXT,
  insertNativeFixture,
  executeNativeEdit,
  nativeThreeLeaves,
} from '../../../test-utils/verification/native-lifecycle-fixtures';
import { BodyDocument } from './body-document';
import { compileWeldFrames } from './weld-frames';
import { compareRecordIds } from './body-id';

describe('native group presentation lineage', () => {
  it('uses the selected merge target, otherwise the larger predecessor and then stable identity', () => {
    for (const reversed of [false, true]) {
      const f = new BodyFactory(),
        members = [0, 1, 2, 3].map((i) =>
          f.body(`Member ${i}`, { x: i, y: 0, angle: 0 }, [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
          ])
        );
      const anchors = members.map((id) => f.attachment(id, { x: 0, y: 0 }));
      f.joint('weld', anchors[0], anchors[1]);
      f.joint('weld', anchors[2], anchors[3]);
      const annotations = [
        {
          members: members.slice(0, 2),
          frameBody: members[0],
          label: 'First',
          presentation: { fill: '#26a69a', hidden: false, showCenter: false },
        },
        {
          members: members.slice(2),
          frameBody: members[2],
          label: 'Second',
          presentation: { fill: '#5c6bc0', hidden: false, showCenter: false },
        },
      ];
      const source = insertNativeFixture({
        ...f.document,
        groups: reversed ? [...annotations].reverse() : annotations,
        bodies: reversed ? [...f.document.bodies].reverse() : f.document.bodies,
      });
      const connector = new BodyFactory(source);
      const weld = connector.joint('weld', anchors[0], anchors[2]);
      for (const target of [undefined, members[0], members[2]]) {
        const plan = planBodyEdit(
          source,
          0,
          {
            id: 'merge',
            targetGroupMember: target,
            operations: [{ kind: 'insert', records: { joints: [weld] } }],
          },
          NATIVE_EDIT_CONTEXT
        );
        if (!plan.ok) throw new Error(plan.message);
        const roots = [
          members.slice(0, 2).sort(compareRecordIds)[0],
          members.slice(2).sort(compareRecordIds)[0],
        ];
        const expected =
          target === members[0]
            ? 0
            : target === members[2]
              ? 1
              : compareRecordIds(roots[0], roots[1]) < 0
                ? 0
                : 1;
        expect(plan.document.groups[0].label).toBe(annotations[expected].label);
        expect(plan.document.groups[0].presentation).toEqual(annotations[expected].presentation);
        expect(plan.document.bodies).toEqual(source.bodies);
      }
    }
  });
  it('keeps the target member paint when a singleton joins an explicitly painted group', () => {
    const fixture = nativeThreeLeaves(),
      f = new BodyFactory(fixture.document);
    const target = f.body('Target', { x: 4, y: 1, angle: 0.4 }, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    const source = insertNativeFixture(f.document),
      connector = new BodyFactory(source);
    const weld = connector.joint(
      'weld',
      connector.attachment(target, { x: 0, y: 0 }),
      connector.attachment(fixture.members[0], { x: 0, y: 0 })
    );
    const added = connector.document.attachments.filter(
      (point) => !source.attachments.some((old) => old.id === point.id)
    );
    const plan = planBodyEdit(
      source,
      0,
      {
        id: 'merge',
        targetGroupMember: target,
        operations: [{ kind: 'insert', records: { joints: [weld], attachments: added } }],
      },
      NATIVE_EDIT_CONTEXT
    );
    if (!plan.ok) throw new Error(plan.message);
    const body = source.bodies.find((item) => item.id === target)!;
    if (body.kind !== 'material') throw new Error('material');
    expect(plan.document.groups[0].label).toBe('Target');
    expect(plan.document.groups[0].presentation).toEqual(body.presentation);
  });
  it('does not repair away invalid inserted annotations or rewrite an untouched empty override', () => {
    const fixture = nativeThreeLeaves(),
      source: BodyDocument = {
        ...fixture.document,
        groups: fixture.document.groups.map((group) => ({ ...group, mass: {} })),
      };
    const noOp = planBodyEdit(source, 0, { id: 'noop', operations: [] }, NATIVE_EDIT_CONTEXT);
    expect(noOp).toMatchObject({ ok: true, changed: false });
    const invalid = planBodyEdit(
      source,
      0,
      {
        id: 'invalid',
        operations: [
          { kind: 'insert', records: { groups: [{ members: [], frameBody: fixture.members[0] }] } },
        ],
      },
      NATIVE_EDIT_CONTEXT
    );
    expect(invalid).toMatchObject({ ok: false, code: 'invalid-document' });
  });

  it('does not treat an empty override object as an aggregate mass that must be distributed', () => {
    const fixture = nativeThreeLeaves(),
      source: BodyDocument = {
        ...fixture.document,
        groups: fixture.document.groups.map((group) => ({ ...group, mass: {} })),
      };
    const result = executeNativeEdit(source, [
      { kind: 'delete', targets: [{ kind: 'joint', id: fixture.links[0].id }] },
    ]);
    expect(result.groups).toEqual([]);
    expect(compileWeldFrames(result).ok).toBe(true);
  });
});
