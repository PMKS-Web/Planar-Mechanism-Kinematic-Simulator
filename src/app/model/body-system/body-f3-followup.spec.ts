import { BodyDocument, emptyBodyDocument } from './body-document';
import { BodyDocumentAuthority } from './body-document-authority';
import { BodyFactory } from './body-factory';
import { BodyEditFrame, withBodyEditFrame } from './body-edit-frame';
import { bodyEditEffects } from './body-edit-effects';
import { reanchorBodyEdit } from './body-reanchor-edit';
import { localToWorld } from './body-frame';
import { WORLD } from './body-id';
import { MaterialBody } from './material-body';
import { NATIVE_EDIT_CONTEXT } from '../../../test-utils/verification/native-lifecycle-fixtures';
import { nativeEditableBar } from '../../../test-utils/verification/native-geometry-fixture';
import { nativeUnitFixture } from '../../../test-utils/verification/native-unit-fixture';
import { nativeLoadedRod } from '../../../test-utils/verification/native-force-fixtures';
import { buildSimulationSnapshot } from './build-simulation-snapshot';
import { selectSimulationView } from './simulation-view';
import { encodeBodyDocument } from '../../services/transcoding/body-document-codec';
const state = NATIVE_EDIT_CONTEXT.state;

describe('F3 follow-up lifecycle counterexamples', () => {
  it('uses the last placement of a deleted material center anchor before falling back to the body', () => {
    const f = nativeEditableBar();
    const source: BodyDocument = {
      ...f.document,
      bodies: f.document.bodies.map((b) =>
        b.kind === 'material'
          ? {
              ...b,
              mass: {
                ...b.mass,
                center: {
                  mode: 'explicit',
                  point: { x: 4, y: 3 },
                  editAnchor: { attachmentId: f.a },
                },
              },
            }
          : b
      ),
    };
    const a = new BodyDocumentAuthority(source);
    const r = a.commit(
      {
        id: 'move-delete',
        operations: [
          { kind: 'delete', targets: [{ kind: 'attachment', id: f.a }] },
          {
            kind: 'body-poses',
            poses: [{ bodyId: f.body.id, pose: { x: 5, y: 2, angle: Math.PI / 2 } }],
          },
        ],
      },
      state
    );
    if (!r.ok) throw new Error(JSON.stringify(r));
    const b = a.document.bodies.find((b) => b.id === f.body.id)! as MaterialBody;
    if (b.mass.center.mode !== 'explicit') throw new Error('Expected center');
    const p = localToWorld(b.pose, b.mass.center.point);
    expect(p.x).toBeCloseTo(9, 12);
    expect(p.y).toBeCloseTo(5, 12);
    expect(b.mass.center.editAnchor).toBe('body');
    a.undo(state);
    expect(a.document).toEqual(source);
    a.redo(state);
    expect(a.document.bodies).toContainEqual(b);
  });
  it('refuses copying either side of an ambiguous scope, independent of its reference member', () => {
    const f = nativeUnitFixture();
    for (const body of [f.body, f.bracket])
      for (const reverse of [false, true]) {
        const source = {
          ...f.document,
          groups: [],
          bodies: reverse ? [...f.document.bodies].reverse() : f.document.bodies,
        };
        const a = new BodyDocumentAuthority(source);
        expect(
          a.commit(
            {
              id: 'partial',
              operations: [
                {
                  kind: 'copy-bodies',
                  bodyIds: [body],
                  includeGround: false,
                  offset: { x: 3, y: 1 },
                },
              ],
            },
            state
          )
        ).toMatchObject({ ok: false, code: 'ambiguous-load-owner' });
        expect(a.document).toEqual(source);
        expect(a.undoDepth).toBe(0);
      }
  });
  it('reports the new authored start when removing a drive from a displaced machine', () => {
    const f = nativeLoadedRod(),
      a = new BodyDocumentAuthority(f.document);
    const built = buildSimulationSnapshot(a.document, 0, {
      mode: 'static',
      gravity: { x: 0, y: 0 },
      path: { duration: 1, commandStep: 0.1 },
    });
    if (!built.ok) throw new Error(built.reason);
    const key = built.snapshot.bodyPartition.get(f.body)!;
    const view = selectSimulationView(built.snapshot, {
      revision: 0,
      indices: new Map([[key, 3]]),
    });
    if (!view.ok) throw new Error(view.reason);
    expect(a.setSimulationView(view.value)).toBe(true);
    const shown = a.display!.poses.get(f.body)!;
    expect(shown).not.toEqual(f.document.bodies.find((b) => b.id === f.body)!.pose);
    const clock = a.local.clocks[0];
    const r = a.commit(
      { id: 'remove', operations: [{ kind: 'remove-driver', driverId: f.driver.id }] },
      { ...state, atStart: false }
    );
    if (!r.ok || !r.changed) throw new Error(JSON.stringify(r));
    const notice = r.event!.plan!.anchors!.find((item) => item.driverId === f.driver.id)!;
    expect(notice).toMatchObject({ status: 'drive-removed', previous: clock.anchor });
    // The new anchor is evaluated from the accepted pose, independently of the old command row.
    expect(notice.anchor).toBeCloseTo(clock.command, 12);
    expect(a.document.bodies.find((b) => b.id === f.body)!.pose).toEqual(shown);
    expect(a.local.clocks).toEqual([]);
    a.undo(state);
    expect(a.document).toEqual(f.document);
    expect(a.display!.poses.get(f.body)).toEqual(shown);
  });
  it('restores an untouched hold exactly through the constrained re-anchoring path', () => {
    const f = new BodyFactory();
    const first = f.body('edited', { x: 4, y: 0, angle: 0 }, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    const other = f.body('held', { x: 0, y: 0, angle: 0.4 }, [
      { x: 0, y: 0 },
      { x: Math.cos(0.3), y: Math.sin(0.3) },
    ]);
    const from = f.attachment(other, { x: 0, y: 0 }),
      to = f.attachment(other, { x: Math.cos(0.3), y: Math.sin(0.3) });
    const source: BodyDocument = {
      ...f.document,
      holds: [{ bodyId: other, from, to, angle: 0.7 }],
    };
    const frame: BodyEditFrame = {
      revision: 0,
      clocks: [],
      paths: new Map(),
      poses: new Map(
        source.bodies.map((b) => [b.id, b.id === other ? { ...b.pose, angle: 2.3 } : b.pose])
      ),
    };
    const displayed = withBodyEditFrame(source, frame);
    const proposed = {
      ...displayed,
      bodies: displayed.bodies.map((b) =>
        b.id === first ? { ...b, pose: { ...b.pose, x: 5 } } : b
      ),
    };
    const result = reanchorBodyEdit(source, displayed, proposed, frame);
    expect(result).toBeDefined();
    expect(result!.document.holds).toEqual(source.holds);
    expect(bodyEditEffects(source, result!.document).invalidatedBodies).not.toContain(other);
  });
  it('keeps exact stored group center coordinates when only its editing attachment disappears', () => {
    const f = nativeEditableBar(false, 1, { x: 5, y: 2, angle: 0.4 });
    const center = { point: { x: 0.1, y: 0.4 }, editAnchor: { attachmentId: f.witness } };
    const source = {
      ...f.document,
      groups: [{ members: [f.body.id], frameBody: f.body.id, mass: { center } }],
    };
    const a = new BodyDocumentAuthority(source);
    const r = a.commit(
      {
        id: 'delete-point',
        operations: [{ kind: 'delete', targets: [{ kind: 'attachment', id: f.witness }] }],
      },
      state
    );
    if (!r.ok) throw new Error(JSON.stringify(r));
    expect(a.document.groups[0].mass!.center).toEqual({ ...center, editAnchor: 'body' });
  });
  it('pastes grounded material into annotated singleton WORLD without duplicating annotations', () => {
    const f = new BodyFactory(),
      body = f.body('fixed', { x: 2, y: 1, angle: 0.4 }, [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ]);
    f.joint('weld', f.attachment(WORLD, { x: 2, y: 1 }), f.attachment(body, { x: 0, y: 0 }));
    const incoming: BodyDocument = {
      ...f.document,
      groups: [
        {
          members: [WORLD, body],
          frameBody: body,
          label: 'incoming',
          mass: { mass: 3, inertia: 2, center: { point: { x: 0.2, y: 0.1 }, editAnchor: 'body' } },
        },
      ],
    };
    const source: BodyDocument = {
      ...emptyBodyDocument(),
      groups: [
        {
          members: [WORLD],
          frameBody: WORLD,
          label: 'existing ground',
          presentation: { fill: '#123456', hidden: false, showCenter: false },
        },
      ],
    };
    expect(encodeBodyDocument(source).ok).toBe(true);
    const a = new BodyDocumentAuthority(source);
    const r = a.commit(
      {
        id: 'paste',
        operations: [{ kind: 'paste-bodies', source: incoming, offset: { x: 3, y: 2 } }],
      },
      state
    );
    if (!r.ok) throw new Error(JSON.stringify(r));
    expect(a.document.groups).toHaveLength(1);
    expect(a.document.groups[0]).toMatchObject({
      label: 'existing ground',
      presentation: { fill: '#123456' },
      mass: { mass: 3, inertia: 2 },
    });
    const p = localToWorld({ x: 5, y: 3, angle: 0.4 }, { x: 0.2, y: 0.1 });
    expect(a.document.groups[0].mass!.center!.point.x).toBeCloseTo(p.x, 12);
    expect(a.document.groups[0].mass!.center!.point.y).toBeCloseTo(p.y, 12);
    a.undo(state);
    expect(a.document).toEqual(source);
    a.redo(state);
    expect(encodeBodyDocument(a.document).ok).toBe(true);
  });
});
