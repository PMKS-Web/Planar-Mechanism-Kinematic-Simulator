import { BodyDocument } from './body-document';
import { AttachmentId, JunctionId, compareRecordIds } from './body-id';

/** A restored R joins the same visual pin as its incident R/weld tree, without changing an equation. */
export function bundlePinAt(
  document: BodyDocument,
  anchor: AttachmentId,
  commandId: string
): BodyDocument {
  const bundled = new Set(document.junctions.flatMap((pin) => pin.joints));
  const eligible = document.joints.filter(
    (j) => j.kind === 'revolute' || (j.kind === 'weld' && bundled.has(j.id))
  );
  const members = new Set([anchor]);
  let size = -1;
  while (size !== members.size) {
    size = members.size;
    for (const j of eligible) {
      if (members.has(j.frameA.attachmentId)) members.add(j.frameB.attachmentId);
      if (members.has(j.frameB.attachmentId)) members.add(j.frameA.attachmentId);
    }
  }
  const edges = eligible.filter(
    (j) => members.has(j.frameA.attachmentId) && members.has(j.frameB.attachmentId)
  );
  const owners = new Set(
    document.attachments.filter((a) => members.has(a.id)).map((a) => a.bodyId)
  );
  // A visual tree cannot claim a redundant cycle or two different points on one material body.
  if (members.size < 2 || edges.length !== members.size - 1 || owners.size !== members.size)
    return document;
  const pins = document.junctions
    .filter((p) => p.attachments.some((a) => members.has(a)))
    .sort((a, b) => compareRecordIds(a.id, b.id));
  const attachments = [...members].sort(compareRecordIds);
  return {
    ...document,
    junctions: [
      ...document.junctions.filter((p) => !pins.includes(p)),
      {
        id: pins[0]?.id ?? (`${commandId}:restored-pin` as JunctionId),
        hub: pins[0]?.hub ?? anchor,
        attachments,
        joints: edges.map((j) => j.id),
      },
    ],
  };
}
