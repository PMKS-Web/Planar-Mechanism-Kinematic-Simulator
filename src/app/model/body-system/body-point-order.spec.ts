import { BodyDocument } from './body-document';
import { BodyDocumentAuthority } from './body-document-authority';
import { AttachmentId } from './body-id';
import { localToWorld } from './body-frame';
import {
  nativeThreeCylinders,
  NATIVE_EDIT_CONTEXT,
} from '../../../test-utils/verification/native-lifecycle-fixtures';

function placed(document: BodyDocument, target: AttachmentId) {
  const authority = new BodyDocumentAuthority(document);
  const result = authority.commit(
    {
      id: 'order',
      operations: [{ kind: 'move-point', attachmentId: target, target: { x: 0.2, y: 0.3 } }],
    },
    NATIVE_EDIT_CONTEXT.state
  );
  if (!result.ok) throw new Error(JSON.stringify(result));
  return authority.document;
}
describe('native point edit enumeration', () => {
  it('retains the same physical answer under independent body, joint, attachment and opaque-ID permutations', () => {
    const f = nativeThreeCylinders(),
      target = f.cylinders[0].barrelMount;
    const expected = placed(f.document, target);
    const ids = new Set<string>();
    JSON.stringify(f.document, (key, value) => {
      if (key === 'id' && value !== 'WORLD') ids.add(value);
      return value;
    });
    const renamed = new Map(
      [...ids]
        .sort()
        .reverse()
        .map((id, i) => [id, `opaque-${i.toString().padStart(3, '0')}`])
    );
    for (let mask = 0; mask < 16; mask++) {
      const map = (id: string) => (mask & 8 ? (renamed.get(id) ?? id) : id);
      const candidate = JSON.parse(
        JSON.stringify(f.document, (_key, value) =>
          typeof value === 'string' ? map(value) : value
        )
      ) as BodyDocument;
      const permuted = {
        ...candidate,
        bodies: mask & 1 ? [...candidate.bodies].reverse() : candidate.bodies,
        joints: mask & 2 ? [...candidate.joints].reverse() : candidate.joints,
        attachments: mask & 4 ? [...candidate.attachments].reverse() : candidate.attachments,
      };
      const actual = placed(permuted, map(target) as AttachmentId);
      for (const point of expected.attachments) {
        const p = actual.attachments.find((item) => item.id === map(point.id))!;
        const a = localToWorld(
          expected.bodies.find((b) => b.id === point.bodyId)!.pose,
          point.point
        );
        const b = localToWorld(actual.bodies.find((body) => body.id === p.bodyId)!.pose, p.point);
        expect(b.x).toBeCloseTo(a.x, 8);
        expect(b.y).toBeCloseTo(a.y, 8);
      }
    }
  });
});
