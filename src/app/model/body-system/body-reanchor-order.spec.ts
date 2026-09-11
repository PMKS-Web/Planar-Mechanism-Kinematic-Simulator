import { nativeEditableFourBar } from '../../../test-utils/verification/native-geometry-fixture';
import { nativeFourBarPoint } from '../../../test-utils/verification/native-body-fixtures';
import { NATIVE_EDIT_CONTEXT } from '../../../test-utils/verification/native-lifecycle-fixtures';
import { BodyDocument } from './body-document';
import { BodyDocumentAuthority } from './body-document-authority';
import { buildSimulationSnapshot } from './build-simulation-snapshot';
import { selectSimulationView } from './simulation-view';
import { AttachmentId, BodyId } from './body-id';
import { localToWorld } from './body-frame';

describe('native re-anchoring enumeration', () => {
  it('recovers the same hand-derived linkage after independent body, joint, attachment and ID permutations', () => {
    const f = nativeEditableFourBar();
    const target = { x: 1.1 * Math.cos(1.3), y: 1.1 * Math.sin(1.3) };
    const displayedC = nativeFourBarPoint(1.3);
    const expected = nativeFourBarPoint(0.7, {
      ground: 4,
      crank: 1.1,
      rocker: 2,
      coupler: Math.hypot(displayedC.x - target.x, displayedC.y - target.y),
    });
    const ids = new Set<string>();
    JSON.stringify(f.document, (key, value) => {
      if (key === 'id' && value !== 'WORLD') ids.add(value);
      return value;
    });
    const renamed = new Map(
      [...ids]
        .sort()
        .reverse()
        .map((id, i) => [id, `anchor-id-${i.toString().padStart(3, '0')}`])
    );
    for (let mask = 0; mask < 16; mask++) {
      const map = (id: string) => (mask & 8 ? (renamed.get(id) ?? id) : id);
      const clone = JSON.parse(
        JSON.stringify(f.document, (_key, value) =>
          typeof value === 'string' ? map(value) : value
        )
      ) as BodyDocument;
      const document = {
        ...clone,
        bodies: mask & 1 ? [...clone.bodies].reverse() : clone.bodies,
        joints: mask & 2 ? [...clone.joints].reverse() : clone.joints,
        attachments: mask & 4 ? [...clone.attachments].reverse() : clone.attachments,
      };
      const a = new BodyDocumentAuthority(document);
      const built = buildSimulationSnapshot(a.document, 0, {
        mode: 'static',
        gravity: { x: 0, y: 0 },
        path: { duration: 1, commandStep: 0.2 },
      });
      if (!built.ok) throw new Error(built.reason);
      const key = built.snapshot.bodyPartition.get(map(f.bJoint.bodyA) as BodyId)!;
      const view = selectSimulationView(built.snapshot, {
        revision: 0,
        indices: new Map([[key, 3]]),
      });
      if (!view.ok) throw new Error(view.reason);
      expect(a.setSimulationView(view.value)).toBe(true);
      const result = a.commit(
        {
          id: 'permuted-edit',
          operations: [
            {
              kind: 'move-point',
              attachmentId: map(f.bJoint.frameA.attachmentId) as AttachmentId,
              target,
            },
          ],
        },
        { ...NATIVE_EDIT_CONTEXT.state, atStart: false }
      );
      if (!result.ok) throw new Error(JSON.stringify(result));
      expect(result.event!.plan!.anchors![0].status).toBe('retained');
      const point = a.document.attachments.find((item) => item.id === map(f.witness))!;
      const placed = localToWorld(
        a.document.bodies.find((item) => item.id === point.bodyId)!.pose,
        point.point
      );
      expect(placed.x).toBeCloseTo(expected.x, 8);
      expect(placed.y).toBeCloseTo(expected.y, 8);
      expect(a.local.clocks[0].anchor).toBe(0);
      expect(a.local.clocks[0].command).toBeCloseTo(0.6, 10);
    }
  });
});
