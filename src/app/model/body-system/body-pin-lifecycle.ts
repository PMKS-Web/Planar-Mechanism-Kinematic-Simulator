import { BodyDocument } from './body-document';
import { AttachmentId, compareRecordIds, JointId, JunctionId } from './body-id';
import { BodyJoint, PinJunction } from './joint-record';

/** Material deletion can preserve coincidence through a lost hub; explicit edge deletion cannot. */
export function retainPinConnections(
  before: BodyDocument,
  candidate: BodyDocument,
  removedJunctions: ReadonlySet<JunctionId>,
  commandId: string,
  disconnected: ReadonlySet<JointId> = new Set()
): Pick<BodyDocument, 'joints' | 'junctions'> {
  const anchors = new Map(candidate.attachments.map((point) => [point.id, point]));
  const bodies = new Map(candidate.bodies.map((body) => [body.id, body]));
  const current = new Map(candidate.joints.map((joint) => [joint.id, joint]));
  const joints = [...candidate.joints],
    junctions: PinJunction[] = [];
  let serial = 0;
  for (const pin of [...before.junctions].sort((a, b) => compareRecordIds(a.id, b.id))) {
    if (removedJunctions.has(pin.id)) continue;
    const belongs = (joint: BodyJoint) =>
      ['revolute', 'weld'].includes(joint.kind) &&
      pin.attachments.includes(joint.frameA.attachmentId) &&
      pin.attachments.includes(joint.frameB.attachmentId);
    const oldEdges = before.joints.filter(
      (joint) =>
        pin.joints.includes(joint.id) &&
        !disconnected.has(joint.id) &&
        (!current.has(joint.id) || belongs(current.get(joint.id)!))
    );
    const components: Set<AttachmentId>[] = [],
      remaining = new Set([...pin.attachments].sort(compareRecordIds));
    while (remaining.size) {
      const component = new Set([[...remaining][0]]);
      flood(component, oldEdges);
      component.forEach((id) => remaining.delete(id));
      components.push(component);
    }
    const survivors = components
      .map((original) => ({
        original,
        members: [...original].filter((id) => anchors.has(id)).sort(compareRecordIds),
      }))
      .filter((part) => part.members.length >= 2)
      .sort(
        (a, b) =>
          Number(b.original.has(pin.hub)) - Number(a.original.has(pin.hub)) ||
          b.members.length - a.members.length ||
          compareRecordIds(a.members[0], b.members[0])
      );
    for (const [index, part] of survivors.entries()) {
      const members = part.members,
        hub = members.includes(pin.hub) ? pin.hub : members[0];
      const retained = joints.filter(
        (joint) =>
          pin.joints.includes(joint.id) &&
          belongs(joint) &&
          members.includes(joint.frameA.attachmentId) &&
          members.includes(joint.frameB.attachmentId)
      );
      const connected = new Set<AttachmentId>([hub]);
      for (const member of members) {
        flood(connected, retained);
        if (connected.has(member)) continue;
        const a = anchors.get(hub)!,
          b = anchors.get(member)!;
        const joint: BodyJoint = {
          kind: 'revolute',
          id: `${commandId}:pin:${serial++}` as JointId,
          label: '',
          bodyA: a.bodyId,
          bodyB: b.bodyId,
          frameA: { attachmentId: hub, angle: 0 },
          frameB: { attachmentId: member, angle: 0 },
          angleZero: bodies.get(b.bodyId)!.pose.angle - bodies.get(a.bodyId)!.pose.angle,
        };
        retained.push(joint);
        joints.push(joint);
        connected.add(member);
      }
      junctions.push({
        ...pin,
        id: index === 0 ? pin.id : (`${commandId}:junction:${serial++}` as JunctionId),
        hub,
        attachments: members,
        joints: retained.map((joint) => joint.id),
      });
    }
  }
  return { joints, junctions };
}
function flood(connected: Set<AttachmentId>, joints: readonly BodyJoint[]): void {
  let previous = -1;
  while (previous !== connected.size) {
    previous = connected.size;
    for (const joint of joints) {
      if (connected.has(joint.frameA.attachmentId)) connected.add(joint.frameB.attachmentId);
      if (connected.has(joint.frameB.attachmentId)) connected.add(joint.frameA.attachmentId);
    }
  }
}
