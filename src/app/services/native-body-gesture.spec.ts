import { NativeBodyDocumentService } from './native-body-document.service';
import { nativeLinearCarriage } from '../../test-utils/verification/native-linear-carriage-fixture';
import {
  nativeThreeLeaves,
  NATIVE_EDIT_CONTEXT,
} from '../../test-utils/verification/native-lifecycle-fixtures';
import { encodeBodyDocument } from './transcoding/body-document-codec';
import { newRecordId } from '../model/body-system/body-id';
import { BodyDocument } from '../model/body-system/body-document';
import { jointCoordinate } from '../model/body-system/joint-coordinate';
const state = NATIVE_EDIT_CONTEXT.state;
function service(document: BodyDocument) {
  const s = new NativeBodyDocumentService(),
    encoded = encodeBodyDocument(document);
  if (!encoded.ok) throw new Error('encode');
  const result = s.load(encoded.payload, state);
  if (!result.ok) throw new Error(JSON.stringify(result));
  return s;
}
function travel(doc: BodyDocument) {
  const j = doc.joints.find((j) => j.kind === 'prismatic')!;
  return jointCoordinate(
    j,
    'travel',
    new Map(doc.bodies.map((b) => [b.id, b.pose])),
    new Map(doc.attachments.map((p) => [p.id, p]))
  );
}
describe('native pointer continuation and stop projection', () => {
  it('moves a requested WORLD attachment through a gesture without moving WORLD or losing stale-clock detection', () => {
    const f = nativeLinearCarriage(),
      s = service(f.document);
    const target = f.guide.frameA.attachmentId;
    const start = s.document.attachments.find((p) => p.id === target)!.point;
    const g = s.beginGesture({ kind: 'move-point', attachmentId: target }, state);
    expect(g.advance({ x: start.x + 0.1, y: start.y + 0.1 }, state).ok).toBe(true);
    expect(s.finishGesture(g, state).ok).toBe(true);
    expect(s.document.bodies.find((b) => b.kind === 'world')!.pose).toEqual({
      x: 0,
      y: 0,
      angle: 0,
    });
    const h = s.beginGesture({ kind: 'move-coordinate', coordinate: f.driver.coordinate }, state);
    s.setLocalState({
      ...s.local,
      clocks: s.local.clocks.map((c) => ({ ...c, time: 1, command: 0.3 })),
    });
    expect(h.advance(0.2, state)).toMatchObject({ ok: false, code: 'stale-pose' });
  });

  it('clamps a coordinate gesture at a physical stop, resumes inward, and commits all events once', () => {
    const f = nativeLinearCarriage(),
      s = service({
        ...f.document,
        limits: [
          { id: newRecordId<'limit'>(), coordinate: f.driver.coordinate, lower: -0.3, upper: 0.4 },
        ],
      });
    let events = 0;
    s.changes.subscribe(() => events++);
    const g = s.beginGesture({ kind: 'move-coordinate', coordinate: f.driver.coordinate }, state);
    const a = g.advance(0.8, state);
    if (!a.ok) throw new Error(JSON.stringify(a));
    expect(a.limited).toBe(true);
    expect(travel(a.plan.document)).toBeCloseTo(0.4, 6);
    expect(travel(s.document)).toBeCloseTo(0, 12);
    expect(s.undoDepth).toBe(0);
    expect(events).toBe(0);
    const b = g.advance(0.2, state);
    if (!b.ok) throw new Error(JSON.stringify(b));
    expect(travel(b.plan.document)).toBeCloseTo(0.2, 8);
    expect(s.finishGesture(g, state).ok).toBe(true);
    expect(s.undoDepth).toBe(1);
    expect(events).toBe(1);
    expect(travel(s.document)).toBeCloseTo(0.2, 8);
    s.undo(state);
    expect(travel(s.document)).toBeCloseTo(0, 8);
    s.redo(state);
    expect(travel(s.document)).toBeCloseTo(0.2, 8);
  });
  it('projects a rigid body drag onto an oblique guide and bound without reshaping material', () => {
    const f = nativeLinearCarriage(),
      source = {
        ...f.document,
        drivers: [],
        limits: [
          { id: newRecordId<'limit'>(), coordinate: f.driver.coordinate, lower: -0.3, upper: 0.4 },
        ],
      };
    const s = service(source),
      g = s.beginGesture({ kind: 'move-body', bodyId: f.body, grab: { x: 0, y: 0 } }, state);
    const result = g.advance({ x: 3, y: 0 }, state);
    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(travel(result.plan.document)).toBeCloseTo(0.4, 7);
    const body = result.plan.document.bodies.find((b) => b.id === f.body)!;
    expect(body.pose.x).toBeCloseTo(2 + 0.4 * Math.cos(f.angle), 7);
    expect(body.pose.y).toBeCloseTo(-1 + 0.4 * Math.sin(f.angle), 7);
    expect(body.pose.angle).toBeCloseTo(f.angle, 10);
    if (body.kind !== 'material') throw new Error('body');
    const original = source.bodies.find((b) => b.id === f.body)!;
    if (original.kind !== 'material') throw new Error('original');
    expect(body.geometry).toEqual(original.geometry);
    expect(result.plan.document.attachments).toHaveLength(source.attachments.length);
    g.cancel();
    expect(s.finishGesture(g, state).ok).toBe(false);
    expect(s.undoDepth).toBe(0);
  });
  it('carries every welded member and retains material properties during a multi-event body gesture', () => {
    const f = nativeThreeLeaves(),
      s = service(f.document),
      g = s.beginGesture({ kind: 'move-body', bodyId: f.members[0], grab: { x: 0, y: 0 } }, state);
    for (const target of [
      { x: 0.2, y: 0.1 },
      { x: 0.4, y: 0.2 },
      { x: 0.3, y: 0.1 },
    ])
      expect(g.advance(target, state).ok).toBe(true);
    expect(s.finishGesture(g, state).ok).toBe(true);
    for (const body of f.document.bodies.filter((b) => b.kind === 'material')) {
      const actual = s.document.bodies.find((b) => b.id === body.id)!;
      expect({ ...actual, pose: body.pose }).toEqual(body);
    }
    for (const joint of f.document.joints)
      expect(s.document.joints.find((j) => j.id === joint.id)).toEqual(joint);
    expect(s.undoDepth).toBe(1);
  });
  it('refuses a stale or foreign gesture and changed permissions without publishing a draft', () => {
    const f = nativeLinearCarriage(),
      s = service(f.document),
      other = service(f.document);
    const g = s.beginGesture({ kind: 'move-coordinate', coordinate: f.driver.coordinate }, state);
    expect(g.advance(0.1, state).ok).toBe(true);
    expect(other.finishGesture(g, state).ok).toBe(false);
    expect(s.finishGesture(g, { ...state, playing: true }).ok).toBe(false);
    expect(s.undoDepth).toBe(0);
    const h = s.beginGesture({ kind: 'move-coordinate', coordinate: f.driver.coordinate }, state);
    s.commit(
      {
        id: 'label',
        operations: [{ kind: 'body-properties', bodyId: f.body, change: { label: 'Changed' } }],
      },
      state
    );
    expect(h.advance(0.1, state)).toMatchObject({ ok: false, code: 'stale-pose' });
    expect(s.finishGesture(h, state).ok).toBe(false);
  });
});
