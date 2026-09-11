import { BodyFactory } from '../../app/model/body-system/body-factory';
import { IDENTITY_POSE, Pose } from '../../app/model/body-system/body-frame';
import { WORLD } from '../../app/model/body-system/body-id';
import { MaterialBody } from '../../app/model/body-system/material-body';
import { insertNativeFixture } from './native-lifecycle-fixtures';

/** Separate bound endpoints and an unbound tracer distinguish geometry edits from connection edits. */
export function nativeEditableBar(grounded = false, scale = 1, pose: Pose = IDENTITY_POSE) {
  const f = new BodyFactory();
  const id = f.body(
    'Editable bar',
    pose,
    [
      { x: 0, y: 0 },
      { x: 10 * scale, y: 0 },
    ],
    0.1 * scale
  );
  const body = f.document.bodies.find((item) => item.id === id)! as MaterialBody;
  if (body.geometry.kind !== 'bar') throw new Error('Expected bar');
  const a = f.vertexAttachment(id, body.geometry.vertices[0].id, 'A');
  const b = f.vertexAttachment(id, body.geometry.vertices[1].id, 'B');
  const witness = f.attachment(id, { x: 3 * scale, y: 2 * scale }, 'Witness');
  if (grounded) f.joint('revolute', f.attachment(WORLD, { x: pose.x, y: pose.y }), a);
  return { document: insertNativeFixture(f.document), body, a, b, witness };
}
