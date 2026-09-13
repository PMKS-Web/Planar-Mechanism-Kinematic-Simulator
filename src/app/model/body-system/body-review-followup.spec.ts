import {
  nativeLongChain,
  nativeGuideWitness,
  nativeHeldTriangleChain,
  translateNativeDrawing,
} from '../../../test-utils/verification/native-review-fixtures';
import { nativeFourBar } from '../../../test-utils/verification/native-body-fixtures';
import { NATIVE_EDIT_CONTEXT } from '../../../test-utils/verification/native-lifecycle-fixtures';
import { BodyDocumentAuthority } from './body-document-authority';
import { compileBodyDocument } from './constraint-compiler';
import { admitBodyPartition } from './body-admission';
import { localToWorld } from './body-frame';

for (const size of [0.1, 0.01, 0.001])
  for (const angle of [undefined, 0.3])
    it(`preserves a small held triangle ${size}, angle ${angle}, across a long chain edit`, () => {
      const { document: source, body: id, from, to } = nativeHeldTriangleChain(size, angle);
      const a = new BodyDocumentAuthority(source);
      const first = source.attachments.find(
        (p) => p.bodyId === source.bodies[1].id && p.point.x === 1
      )!;
      const result = a.commit(
        {
          id: 'triangle',
          operations: [
            {
              kind: 'move-point',
              attachmentId: first.id,
              target: { x: Math.cos(0.25), y: Math.sin(0.25) },
            },
          ],
        },
        NATIVE_EDIT_CONTEXT.state
      );
      if (!result.ok) throw new Error(JSON.stringify(result));
      const p = a.document.attachments.find((p) => p.id === from)!.point,
        q = a.document.attachments.find((p) => p.id === to)!.point;
      expect(Math.hypot(q.x - p.x, q.y - p.y)).toBeCloseTo(size, 13);
      if (angle !== undefined)
        expect(
          a.document.bodies.find((b) => b.id === id)!.pose.angle + Math.atan2(q.y - p.y, q.x - p.x)
        ).toBeCloseTo(angle, 12);
    });

for (const dx of [-0.2, -0.3, -0.1])
  it(`retains a small-world-coordinate lock while the far chain end moves ${dx}`, () => {
    const chain = nativeLongChain();
    const source = translateNativeDrawing(chain.document, 0.5 - Math.cos(0.2), 0.5 - Math.sin(0.2));
    const first = source.attachments.find(
      (p) => p.bodyId === source.bodies[1].id && p.point.x === 1
    )!;
    const a = new BodyDocumentAuthority({ ...source, locks: [first.id] });
    const end = source.attachments.find((p) => p.id === chain.end)!;
    const at = localToWorld(source.bodies.find((b) => b.id === end.bodyId)!.pose, end.point);
    const result = a.commit(
      {
        id: 'lock',
        operations: [
          { kind: 'move-point', attachmentId: chain.end, target: { x: at.x + dx, y: at.y + 0.2 } },
        ],
      },
      NATIVE_EDIT_CONTEXT.state
    );
    if (!result.ok) throw new Error(JSON.stringify(result));
    const p = a.document.attachments.find((p) => p.id === first.id)!;
    const position = localToWorld(a.document.bodies.find((b) => b.id === p.bodyId)!.pose, p.point);
    expect(position.x).toBeCloseTo(0.5, 14);
    expect(position.y).toBeCloseTo(0.5, 14);
  });

for (const rounding of [0, 1e-10])
  it(`refuses a change-point four-bar with rounding ${rounding}`, () => {
    const f = nativeFourBar({ ground: 4, crank: 1, coupler: 2, rocker: 1 }, 0);
    const source = {
      ...f.document,
      bodies: f.document.bodies.map((b, i) =>
        i === 2 ? { ...b, pose: { ...b.pose, y: b.pose.y + rounding } } : b
      ),
    };
    const compiled = compileBodyDocument(source);
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues));
    const result = admitBodyPartition(compiled.system, compiled.system.partitions[0]);
    expect(result).toMatchObject({ ok: false, reason: 'singular-start' });
  });

it('requires and then uses a chosen connection point when a slot becomes a revolute', () => {
  const f = nativeGuideWitness('pin-in-slot');
  const source = {
    ...f.document,
    bodies: f.document.bodies.map((b) =>
      b.id !== f.body
        ? b
        : {
            ...b,
            pose: { ...b.pose, x: b.pose.x + Math.cos(f.angle), y: b.pose.y + Math.sin(f.angle) },
          }
    ),
    drivers: [],
    limits: [],
  };
  const a = new BodyDocumentAuthority(source);
  const operation = {
    kind: 'joint-kind' as const,
    jointId: f.guide.id,
    jointKind: 'revolute' as const,
  };
  expect(
    a.commit({ id: 'missing-point', operations: [operation] }, NATIVE_EDIT_CONTEXT.state)
  ).toMatchObject({ ok: false, code: 'connection-point' });
  expect(a.document).toEqual(source);
  expect(a.undoDepth).toBe(0);
  const anchor = source.attachments.find((p) => p.id === f.guide.frameB.attachmentId)!;
  const worldPoint = localToWorld(
    source.bodies.find((b) => b.id === anchor.bodyId)!.pose,
    anchor.point
  );
  const result = a.commit(
    { id: 'chosen-point', operations: [{ ...operation, worldPoint }] },
    NATIVE_EDIT_CONTEXT.state
  );
  if (!result.ok) throw new Error(JSON.stringify(result));
  const joint = a.document.joints.find((j) => j.id === f.guide.id)!;
  expect(joint.kind).toBe('revolute');
  expect(a.document.bodies).toEqual(source.bodies);
  for (const id of [joint.frameA.attachmentId, joint.frameB.attachmentId]) {
    const p = a.document.attachments.find((p) => p.id === id)!;
    const at = localToWorld(a.document.bodies.find((b) => b.id === p.bodyId)!.pose, p.point);
    expect(at.x).toBeCloseTo(worldPoint.x, 13);
    expect(at.y).toBeCloseTo(worldPoint.y, 13);
  }
  a.undo(NATIVE_EDIT_CONTEXT.state);
  expect(a.document).toEqual(source);
});
