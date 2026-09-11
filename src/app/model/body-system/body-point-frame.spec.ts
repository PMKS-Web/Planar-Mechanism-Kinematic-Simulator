import { bodyForceEnds } from './body-force-edit';
import { newRecordId } from './body-id';
import { BodyLoad } from './body-document';
import { BodyDocumentAuthority } from './body-document-authority';
import { localToWorld } from './body-frame';
import { rebaseBody } from './rebase-body';
import { nativeEditableBar } from '../../../test-utils/verification/native-geometry-fixture';
import { NATIVE_EDIT_CONTEXT } from '../../../test-utils/verification/native-lifecycle-fixtures';

describe('native edit coordinates', () => {
  it('preserves a zero force arrow when its owner frame changes, including a position lock', () => {
    const f = nativeEditableBar();
    for (const frame of ['body', 'world'] as const) {
      const force: BodyLoad = {
        id: newRecordId<'force'>(),
        bodyId: f.body.id,
        label: 'Load',
        point: { x: 3, y: 2 },
        vector: { x: 0, y: 0 },
        frame,
        couple: 0,
        locked: true,
        presentation: { length: 1.8, zeroAngle: 0.7 },
      };
      const source = { ...f.document, forces: [force] };
      const rebased = rebaseBody(source, f.body.id, { x: 0.4, y: -0.7, angle: 0.8 });
      const expected = bodyForceEnds(source, force),
        actual = bodyForceEnds(rebased, rebased.forces[0]);
      for (let i = 0; i < 2; i++) {
        expect(actual[i].x).toBeCloseTo(expected[i].x, 12);
        expect(actual[i].y).toBeCloseTo(expected[i].y, 12);
      }
      expect(rebased.forces[0].locked).toBe(true);
    }
  });
  it('preserves a held arc and witness under scale, oblique world placement and material-frame changes', () => {
    for (const scale of [1e-5, 1, 1e5])
      for (const changedFrame of [false, true]) {
        const pose = { x: 3 * scale, y: -2 * scale, angle: 0.35 };
        const f = nativeEditableBar(true, scale, pose);
        const doc = {
          ...f.document,
          holds: [{ bodyId: f.body.id, from: f.a, to: f.b, length: 10 * scale }],
        };
        const source = changedFrame
          ? rebaseBody(doc, f.body.id, { x: 0.4 * scale, y: -0.7 * scale, angle: 0.8 })
          : doc;
        const authority = new BodyDocumentAuthority(source);
        const result = authority.commit(
          {
            id: 'framed',
            operations: [
              {
                kind: 'move-point',
                attachmentId: f.b,
                target: localToWorld(pose, { x: 6 * scale, y: 8 * scale }),
              },
            ],
          },
          NATIVE_EDIT_CONTEXT.state
        );
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error(JSON.stringify(result));
        const after = authority.document;
        const point = after.attachments.find((p) => p.id === f.witness)!;
        const at = localToWorld(after.bodies.find((b) => b.id === f.body.id)!.pose, point.point);
        const expected = localToWorld(pose, { x: 0.2 * scale, y: 3.6 * scale });
        expect(at.x / scale).toBeCloseTo(expected.x / scale, 10);
        expect(at.y / scale).toBeCloseTo(expected.y / scale, 10);
        expect(after.attachments).toEqual(source.attachments);
      }
  });
});
