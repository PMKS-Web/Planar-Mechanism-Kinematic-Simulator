import { BodyDocument } from './body-document';
import { BodyEditRefusal } from './body-edit-types';
import { AttachmentId, JointId, JunctionId, compareRecordIds } from './body-id';
import { bodyEditRefusal } from './joint-permission';
import { localToWorld } from './body-frame';
import { PinJunction, RevoluteJoint } from './joint-record';

export interface BodyConnectOperation {
  readonly kind: 'connect-attachments';
  readonly a: AttachmentId;
  readonly b: AttachmentId;
}

/** Joining a pin extends its relationship graph; existing weld edges never absorb the new member. */
export function connectBodyAttachments(
  document: BodyDocument,
  operation: BodyConnectOperation,
  id: string
): { ok: true; document: BodyDocument } | BodyEditRefusal {
  const a = document.attachments.find((p) => p.id === operation.a),
    b = document.attachments.find((p) => p.id === operation.b);
  if (!a || !b) return bodyEditRefusal('missing-target');
  if (a.bodyId === b.bodyId) return bodyEditRefusal('invalid-command');
  const internal = new Set(
    document.assemblies.flatMap((c) => {
      const joint = document.joints.find((j) => j.id === c.internalJoint)!;
      return [joint.frameA.attachmentId, joint.frameB.attachmentId];
    })
  );
  if (internal.has(a.id) || internal.has(b.id)) return bodyEditRefusal('assembly-interior');
  const bodyA = document.bodies.find((body) => body.id === a.bodyId)!,
    bodyB = document.bodies.find((body) => body.id === b.bodyId)!;
  const atA = localToWorld(bodyA.pose, a.point),
    atB = localToWorld(bodyB.pose, b.point);
  const tolerance =
    64 * Number.EPSILON * Math.max(1, Math.hypot(atA.x, atA.y), Math.hypot(atB.x, atB.y));
  if (Math.hypot(atA.x - atB.x, atA.y - atB.y) > tolerance)
    return bodyEditRefusal('connection-point');
  const pins = document.junctions
    .filter((pin) => pin.attachments.includes(a.id) || pin.attachments.includes(b.id))
    .sort((a, b) => compareRecordIds(a.id, b.id));
  if (pins.some((pin) => pin.attachments.includes(a.id) && pin.attachments.includes(b.id)))
    return { ok: true, document };
  const attachments = [...new Set([...pins.flatMap((pin) => pin.attachments), a.id, b.id])];
  const owners = attachments.map((id) => document.attachments.find((p) => p.id === id)!.bodyId);
  if (new Set(owners).size !== owners.length) return bodyEditRefusal('invalid-command');
  const joint: RevoluteJoint = {
    id: `${id}:edge` as JointId,
    kind: 'revolute',
    label: '',
    bodyA: a.bodyId,
    bodyB: b.bodyId,
    frameA: { attachmentId: a.id, angle: 0 },
    frameB: { attachmentId: b.id, angle: 0 },
    angleZero: bodyB.pose.angle - bodyA.pose.angle,
  };
  const pin: PinJunction = {
    id: pins[0]?.id ?? (`${id}:pin` as JunctionId),
    hub: pins[0]?.hub ?? a.id,
    attachments,
    joints: [...pins.flatMap((pin) => pin.joints), joint.id],
  };
  return {
    ok: true,
    document: {
      ...document,
      joints: [...document.joints, joint],
      junctions: [...document.junctions.filter((pin) => !pins.includes(pin)), pin],
    },
  };
}
