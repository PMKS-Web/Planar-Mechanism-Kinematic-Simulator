import { BodyFactory } from './body-factory';
import {
  add,
  compose,
  inverse,
  localToWorld,
  relativePose,
  rotate,
  worldToLocal,
} from './body-frame';
import { BodyDocument } from './body-document';
import { newRecordId } from './body-id';
import { jointCoordinate } from './joint-coordinate';
import { rebaseBody } from './rebase-body';

describe('native body frames', () => {
  it('composes rigid transforms without dropping complete turns', () => {
    const a = { x: 3, y: -7, angle: 8 * Math.PI + 0.7 };
    const b = { x: -2, y: 4, angle: -0.4 };
    const p = { x: 1.2, y: -0.3 };
    const composed = localToWorld(compose(a, b), p);
    const expected = localToWorld(a, localToWorld(b, p));
    expect(composed.x).toBeCloseTo(expected.x, 12);
    expect(composed.y).toBeCloseTo(expected.y, 12);
    expect(compose(a, b).angle).toBe(a.angle + b.angle);
    expect(relativePose(a, compose(a, b)).angle).toBeCloseTo(b.angle, 12);
    const restored = localToWorld(inverse(a), localToWorld(a, p));
    expect(restored.x).toBeCloseTo(p.x, 12);
    expect(restored.y).toBeCloseTo(p.y, 12);
  });

  it('rebases geometry, anchors, CoM, loads, welds and coordinate frames together', () => {
    const f = new BodyFactory();
    const a = f.body('one', { x: 2, y: 3, angle: 0.6 }, [
      { x: -1, y: 0 },
      { x: 2, y: 1 },
    ]);
    const b = f.body('two', { x: -4, y: 8, angle: 1.1 }, [
      { x: 0, y: 0 },
      { x: 1, y: 2 },
    ]);
    const aa = f.attachment(a, { x: 0.3, y: 0.8 });
    const ab = f.attachment(
      b,
      worldToLocal(
        f.document.bodies.find((body) => body.id === b)!.pose,
        add(
          localToWorld(f.document.bodies.find((body) => body.id === a)!.pose, { x: 0.3, y: 0.8 }),
          rotate({ x: 2, y: 0 }, 1.4)
        )
      )
    );
    const slot = f.joint('pin-in-slot', aa, ab, 1.4);
    const weld = f.joint('weld', aa, ab);
    const force = {
      id: newRecordId<'force'>(),
      bodyId: a,
      point: { x: 0.1, y: 0.7 },
      label: 'load',
      frame: 'body' as const,
      vector: { x: 3, y: -5 },
      couple: 2,
    };
    const original: BodyDocument = {
      ...f.document,
      forces: [force],
      bodies: f.document.bodies.map((body) =>
        body.id !== a || body.kind === 'world'
          ? body
          : {
              ...body,
              mass: {
                ...body.mass,
                center: { mode: 'explicit', point: { x: 0.2, y: -0.6 }, editAnchor: 'grid' },
              },
            }
      ),
    };
    const rebased = rebaseBody(original, a, { x: -3, y: 2, angle: 0.9 });
    const poses = (doc: BodyDocument) => new Map(doc.bodies.map((body) => [body.id, body.pose]));
    const oldPose = poses(original).get(a)!;
    const newPose = poses(rebased).get(a)!;
    const near = (actual: { x: number; y: number }, expected: { x: number; y: number }) => {
      expect(actual.x).toBeCloseTo(expected.x, 12);
      expect(actual.y).toBeCloseTo(expected.y, 12);
    };
    const originalBody = original.bodies.find((body) => body.id === a)!;
    const rebasedBody = rebased.bodies.find((body) => body.id === a)!;
    if (
      originalBody.kind !== 'material' ||
      rebasedBody.kind !== 'material' ||
      originalBody.geometry.kind !== 'bar' ||
      rebasedBody.geometry.kind !== 'bar' ||
      originalBody.mass.center.mode !== 'explicit' ||
      rebasedBody.mass.center.mode !== 'explicit'
    )
      throw new Error('Expected authored bar');
    for (let i = 0; i < 2; i++) {
      near(
        localToWorld(newPose, rebasedBody.geometry.vertices[i]),
        localToWorld(oldPose, originalBody.geometry.vertices[i])
      );
      expect(rebasedBody.geometry.vertices[i].id).toBe(originalBody.geometry.vertices[i].id);
    }
    near(
      localToWorld(newPose, rebasedBody.mass.center.point),
      localToWorld(oldPose, originalBody.mass.center.point)
    );
    expect(rebasedBody.mass.center.editAnchor).toBe('grid');
    for (const anchor of original.attachments.filter((anchor) => anchor.bodyId === a)) {
      near(
        localToWorld(newPose, rebased.attachments.find((item) => item.id === anchor.id)!.point),
        localToWorld(oldPose, anchor.point)
      );
    }
    near(localToWorld(newPose, rebased.forces[0].point), localToWorld(oldPose, force.point));
    near(rotate(rebased.forces[0].vector, newPose.angle), rotate(force.vector, oldPose.angle));
    for (const coordinate of ['angle', 'travel'] as const) {
      const before = jointCoordinate(
        slot,
        coordinate,
        poses(original),
        new Map(original.attachments.map((p) => [p.id, p]))
      );
      const after = jointCoordinate(
        rebased.joints.find((j) => j.id === slot.id)!,
        coordinate,
        poses(rebased),
        new Map(rebased.attachments.map((p) => [p.id, p]))
      );
      expect(after).toBeCloseTo(before, 12);
    }
    const newWeld = rebased.joints.find((joint) => joint.id === weld.id)!;
    if (newWeld.kind !== 'weld') throw new Error('Expected weld');
    near(compose(newPose, newWeld.rest), poses(original).get(b)!);
    expect(original.bodies.find((body) => body.id === a)!.pose).toBe(oldPose);
  });
});
