import { BodyFactory } from './body-factory';
import { BodyDocumentAuthority } from './body-document-authority';
import { BodyDocument } from './body-document';
import { compose, localToWorld } from './body-frame';
import { newRecordId } from './body-id';
import { NATIVE_EDIT_CONTEXT } from '../../../test-utils/verification/native-lifecycle-fixtures';
import { NativeBodyGesture } from '../../services/native-body-gesture';
import { nativeLinearCarriage } from '../../../test-utils/verification/native-linear-carriage-fixture';
import { encodeBodyDocument } from '../../services/transcoding/body-document-codec';
import { editBodyDrag } from './body-drag-edit';
const state = NATIVE_EDIT_CONTEXT.state;
function fixture(anchor: 'body' | 'grid' | 'point' | 'lost-point') {
  const f = new BodyFactory(),
    frame = f.body('massless frame', { x: 2, y: 0, angle: 0 }, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]),
    member = f.body('member', { x: 3, y: 1, angle: 0.4 }, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
  const framePoint = f.attachment(frame, { x: 0.2, y: 0.3 }),
    point = f.attachment(member, { x: 0.5, y: 0.2 });
  const weld = f.joint('weld', framePoint, point);
  const document: BodyDocument = {
    ...f.document,
    bodies: f.document.bodies.map((b) =>
      b.kind === 'material' && b.id === frame
        ? {
            ...b,
            mass: {
              ...b.mass,
              mass: { mode: 'explicit', value: 0 },
              inertia: { mode: 'explicit', value: 0 },
            },
          }
        : b
    ),
    groups: [
      {
        members: [frame, member],
        frameBody: frame,
        label: 'group',
        mass: {
          mass: 5,
          inertia: 2,
          center: {
            point: { x: 0.1, y: 0.4 },
            editAnchor:
              anchor === 'point'
                ? { attachmentId: point }
                : anchor === 'lost-point'
                  ? { attachmentId: framePoint }
                  : anchor,
          },
        },
      },
    ],
  };
  return { document, frame, member, weld, point, framePoint };
}
describe('F3 lifecycle review probes', () => {
  for (const anchor of ['body', 'grid', 'point', 'lost-point'] as const)
    it(`keeps ${anchor} aggregate center semantics through a move and frame deletion`, () => {
      for (const turn of [0, 0.6])
        for (const reverse of [false, true]) {
          const f = fixture(anchor),
            motion = { x: 1, y: 0.5, angle: turn };
          const source = reverse
            ? {
                ...f.document,
                bodies: [...f.document.bodies].reverse(),
                joints: [...f.document.joints].reverse(),
              }
            : f.document;
          const a = new BodyDocumentAuthority(source);
          const result = a.commit(
            {
              id: 'move-delete',
              operations: [
                {
                  kind: 'body-poses',
                  poses: source.bodies
                    .filter((b) => b.kind === 'material')
                    .map((b) => ({ bodyId: b.id, pose: compose(motion, b.pose) })),
                },
                { kind: 'delete', targets: [{ kind: 'body', id: f.frame }] },
              ],
            },
            state
          );
          if (!result.ok) throw new Error(JSON.stringify(result));
          const group = a.document.groups[0],
            body = a.document.bodies.find((b) => b.id === group.frameBody)!;
          const actual = localToWorld(body.pose, group.mass!.center!.point),
            oldWorld = { x: 2.1, y: 0.4 };
          let expected = anchor === 'body' ? localToWorld(motion, oldWorld) : oldWorld;
          if (anchor === 'point' || anchor === 'lost-point') {
            const p = source.attachments.find(
              (p) => p.id === (anchor === 'point' ? f.point : f.framePoint)
            )!;
            const old = localToWorld(source.bodies.find((b) => b.id === p.bodyId)!.pose, p.point),
              next = localToWorld(motion, old);
            expected = { x: oldWorld.x + next.x - old.x, y: oldWorld.y + next.y - old.y };
          }
          expect(actual.x).toBeCloseTo(expected.x, 10);
          expect(actual.y).toBeCloseTo(expected.y, 10);
          expect(group.mass!.mass).toBe(5);
          expect(group.mass!.inertia).toBe(2);
          expect(group.mass!.center!.editAnchor).toEqual(
            anchor === 'lost-point' ? 'body' : source.groups[0].mass!.center!.editAnchor
          );
          expect(a.undoDepth).toBe(1);
          a.undo(state);
          expect(a.document).toEqual(source);
          a.redo(state);
          expect(encodeBodyDocument(a.document).ok).toBe(true);
        }
    });
  it('reports a split ambiguous load as assignable ownership, not a generic document failure', () => {
    const f = fixture('body'),
      framePose = f.document.bodies.find((b) => b.id === f.frame)!.pose,
      memberPose = f.document.bodies.find((b) => b.id === f.member)!.pose;
    const force = {
      id: newRecordId<'force'>(),
      bodyId: f.frame,
      label: 'ambiguous',
      point: { x: 0, y: 0 },
      vector: { x: 0, y: 1 },
      couple: 0,
      frame: 'world' as const,
      legacyGroupScope: {
        members: [
          { bodyId: f.frame, poseInReference: { x: 0, y: 0, angle: 0 } },
          {
            bodyId: f.member,
            poseInReference: {
              x: memberPose.x - framePose.x,
              y: memberPose.y - framePose.y,
              angle: 0.4,
            },
          },
        ],
      },
    };
    const a = new BodyDocumentAuthority({ ...f.document, groups: [], forces: [force] });
    expect(
      a.commit(
        {
          id: 'split',
          operations: [{ kind: 'delete', targets: [{ kind: 'joint', id: f.weld.id }] }],
        },
        state
      )
    ).toMatchObject({ ok: false, code: 'ambiguous-load-owner' });
    expect(a.undoDepth).toBe(0);
  });
  it('retains one scaled aggregate annotation instead of appending the old-unit copy', () => {
    const f = fixture('body'),
      a = new BodyDocumentAuthority(f.document);
    const r = a.commit(
      {
        id: 'units',
        operations: [
          {
            kind: 'convert-units',
            units: { length: 'cm', mass: 'g', inertia: 'kg*cm2', force: 'N' },
          },
        ],
      },
      state
    );
    if (!r.ok) throw new Error(JSON.stringify(r));
    expect(a.document.groups).toHaveLength(1);
    expect(a.document.groups[0].mass).toMatchObject({
      mass: 5000,
      inertia: 20000,
      center: { point: { x: 10, y: 40 } },
    });
  });
  it('never returns a geometry operation referencing a temporary body-drag attachment', () => {
    const f = nativeLinearCarriage(),
      result = editBodyDrag(
        { ...f.document, drivers: [] },
        { kind: 'move-body', bodyId: f.body, grab: { x: 0.2, y: 0.1 }, target: { x: 2.3, y: -0.8 } }
      );
    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(result.operations.every((op) => op.kind === 'body-poses')).toBe(true);
    expect(JSON.stringify(result)).not.toContain('edit:temporary-grab');
  });
  it('rolls a refused event draft back even if an unexpected non-clamp refusal follows successful substeps', () => {
    const f = nativeLinearCarriage(),
      a = new BodyDocumentAuthority(f.document),
      g = new NativeBodyGesture(
        a,
        'gesture',
        { kind: 'move-coordinate', coordinate: f.driver.coordinate },
        state
      );
    const original = a.preview.bind(a);
    let calls = 0;
    const spy = vi
      .spyOn(a, 'preview')
      .mockImplementation((command, s) =>
        ++calls === 2
          ? { ok: false, code: 'locked-position', message: 'Synthetic late refusal', targets: [] }
          : original(command, s)
      );
    expect(g.advance(0.2, state)).toMatchObject({ ok: false, code: 'locked-position' });
    spy.mockRestore();
    expect(g.finish(a, state)).toMatchObject({ ok: true, changed: false });
    expect(a.undoDepth).toBe(0);
    expect(a.document).toEqual(f.document);
  });
});
