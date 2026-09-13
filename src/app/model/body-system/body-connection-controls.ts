import { BodyDocument } from './body-document';
import { BodySelectionRef } from './body-edit-types';
import { AttachmentId } from './body-id';
import { BodyJoint } from './joint-record';
import {
  attachmentWorld,
  nativeCommand,
  selectionJoints,
  selectionBodies,
} from './body-joint-interaction';

export interface BodyConnectionPair {
  readonly key: string;
  readonly a: AttachmentId;
  readonly b: AttachmentId;
}

/** A multiway pin offers material pairs, including those not used by its stored spanning tree. */
export function bodyConnectionPairs(
  document: BodyDocument,
  target?: BodySelectionRef
): BodyConnectionPair[] {
  if (target?.kind !== 'junction') {
    const members = new Set(selectionBodies(document, target ? [target] : []));
    const assembly =
      target?.kind === 'assembly' ? document.assemblies.find((c) => c.id === target.id) : undefined;
    const joints =
      target && ['body', 'group', 'assembly'].includes(target.kind)
        ? document.joints.filter(
            (j) =>
              (members.has(j.bodyA) || members.has(j.bodyB)) && j.id !== assembly?.internalJoint
          )
        : selectionJoints(document, target);
    return joints.map((j) => ({
      key: j.id,
      a: j.frameA.attachmentId,
      b: j.frameB.attachmentId,
    }));
  }
  const pin = document.junctions.find((p) => p.id === target.id);
  return (
    pin?.attachments.flatMap((a, i) =>
      pin.attachments.slice(i + 1).map((b) => ({ key: `${a}|${b}`, a, b }))
    ) ?? []
  );
}
export function bodyConnectionCommand(
  document: BodyDocument,
  target: BodySelectionRef | undefined,
  pair: BodyConnectionPair | undefined,
  kind: BodyJoint['kind']
) {
  if (!pair) return;
  if (target?.kind === 'junction')
    return nativeCommand({
      kind: 'pin-pair-kind',
      junctionId: target.id,
      a: pair.a,
      b: pair.b,
      jointKind: kind,
    });
  const joint = document.joints.find((j) => j.id === pair.key);
  if (!joint) return;
  return nativeCommand({
    kind: 'joint-kind',
    jointId: joint.id,
    jointKind: kind,
    ...(joint.kind === 'weld' || kind === 'revolute'
      ? { worldPoint: attachmentWorld(document, pair.b) }
      : {}),
  });
}
