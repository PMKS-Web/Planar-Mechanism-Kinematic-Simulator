import { BodyDocument } from '../../app/model/body-system/body-document';
import { BodyFactory } from '../../app/model/body-system/body-factory';
import { WORLD, newRecordId } from '../../app/model/body-system/body-id';
import { relativePose } from '../../app/model/body-system/body-frame';
import { GuidedJoint } from '../../app/model/body-system/joint-record';
import { nativeLinearCarriage } from './native-linear-carriage-fixture';

/** A long sketch separates the local member length from the extent of the connected drawing. */
export function nativeLongChain(count = 12) {
  const f = new BodyFactory();
  let end = f.attachment(WORLD, { x: 0, y: 0 });
  let x = 0,
    y = 0;
  const holds: BodyDocument['holds'][number][] = [];
  for (let i = 0; i < count; i++) {
    const angle = i % 2 ? -0.2 : 0.2;
    const id = f.body(`Bar ${i + 1}`, { x, y, angle }, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    const body = f.document.bodies.find((b) => b.id === id)!;
    if (body.kind !== 'material' || body.geometry.kind !== 'bar') throw new Error('Expected bar');
    const a = f.vertexAttachment(id, body.geometry.vertices[0].id);
    const b = f.vertexAttachment(id, body.geometry.vertices[1].id);
    f.joint('revolute', end, a);
    holds.push({ bodyId: id, from: a, to: b, length: 1 });
    end = b;
    x += Math.cos(angle);
    y += Math.sin(angle);
  }
  return { document: { ...f.document, holds }, end, at: { x, y } };
}

/** Artwork can name a witness that is neither physical anchor of the relationship. */
export function nativeGuideWitness(kind: 'prismatic' | 'pin-in-slot' = 'prismatic', onB = false) {
  const f = nativeLinearCarriage();
  const factory = new BodyFactory(f.document);
  const bodyId = onB ? f.body : WORLD;
  const witness = factory.attachment(bodyId, onB ? { x: 1.3, y: 0.7 } : { x: 3.3, y: -0.3 });
  const guide: GuidedJoint = {
    ...(f.guide as GuidedJoint),
    kind,
    guideDisplay: {
      bodyId,
      frame: { attachmentId: witness, angle: 0.7 },
      station: 0.3,
      normalOffset: 0.2,
      from: -0.5,
      to: 0.8,
    },
  };
  const document: BodyDocument = {
    ...factory.document,
    attachments: factory.document.attachments.map((a) =>
      a.id === witness ? { ...a, trace: true } : a
    ),
    joints: [guide],
    limits: [{ id: newRecordId<'limit'>(), coordinate: f.driver.coordinate, lower: -2, upper: 2 }],
  };
  return { ...f, document, guide, witness };
}

/** WORLD stays canonical; translating the drawing moves its attachments, not the world frame. */
export function translateNativeDrawing(document: BodyDocument, x: number, y: number): BodyDocument {
  const bodies = document.bodies.map((b) =>
    b.kind === 'world' ? b : { ...b, pose: { ...b.pose, x: b.pose.x + x, y: b.pose.y + y } }
  );
  return {
    ...document,
    bodies,
    joints: document.joints.map((j) =>
      j.kind !== 'weld'
        ? j
        : {
            ...j,
            rest: relativePose(
              bodies.find((b) => b.id === j.bodyA)!.pose,
              bodies.find((b) => b.id === j.bodyB)!.pose
            ),
          }
    ),
    attachments: document.attachments.map((a) =>
      a.bodyId !== WORLD ? a : { ...a, point: { x: a.point.x + x, y: a.point.y + y } }
    ),
  };
}

/** A held polygon keeps editable vertices; unlike a held bar, its frame alone cannot enforce length. */
export function nativeHeldTriangleChain(size: number, angle?: number) {
  const chain = nativeLongChain();
  let f = new BodyFactory(chain.document);
  const id = f.body('Triangle', { ...chain.at, angle: 0.3 }, [
    { x: 0, y: 0 },
    { x: size, y: 0 },
  ]);
  const body = f.document.bodies.find((b) => b.id === id)!;
  if (body.kind !== 'material' || body.geometry.kind !== 'bar') throw new Error('Expected bar');
  const vertices = body.geometry.vertices;
  f = new BodyFactory({
    ...f.document,
    bodies: f.document.bodies.map((b) =>
      b.id !== id
        ? b
        : {
            ...body,
            geometry: {
              kind: 'polygon',
              vertices: [...vertices, { id: newRecordId<'vertex'>(), x: 0, y: size }],
            },
          }
    ),
  });
  const from = f.vertexAttachment(id, body.geometry.vertices[0].id),
    to = f.vertexAttachment(id, body.geometry.vertices[1].id);
  f.joint('revolute', chain.end, from);
  const document = {
    ...f.document,
    holds: [...chain.document.holds, { bodyId: id, from, to, length: size, angle }],
  };
  return { document, body: id, from, to };
}
