import { BodyDocument } from './body-document';
import { CenterEditAnchor } from './material-body';
import { BodyId } from './body-id';

export function validCenterEditAnchor(
  document: BodyDocument,
  anchor: CenterEditAnchor,
  members: readonly BodyId[]
): boolean {
  if (anchor === 'body' || anchor === 'grid') return true;
  return (
    !!anchor &&
    typeof anchor === 'object' &&
    document.attachments.some(
      (point) => point.id === anchor.attachmentId && members.includes(point.bodyId)
    )
  );
}

/** Deleting an editing reference retains the physical center instead of binding it to a different pin. */
export function retainCenterEditAnchors(before: BodyDocument, after: BodyDocument): BodyDocument {
  const lost = new Set(
    before.attachments
      .filter((point) => !after.attachments.some((next) => next.id === point.id))
      .map((point) => point.id)
  );
  const wasLost = (current: CenterEditAnchor, original: CenterEditAnchor | undefined): boolean =>
    typeof current === 'object' &&
    typeof original === 'object' &&
    original !== null &&
    current.attachmentId === original.attachmentId &&
    lost.has(current.attachmentId);
  return {
    ...after,
    bodies: after.bodies.map((body) => {
      const previous = before.bodies.find((item) => item.id === body.id);
      const original =
        previous?.kind === 'material' && previous.mass.center.mode === 'explicit'
          ? previous.mass.center.editAnchor
          : undefined;
      return body.kind === 'material' &&
        body.mass.center.mode === 'explicit' &&
        wasLost(body.mass.center.editAnchor, original)
        ? { ...body, mass: { ...body.mass, center: { ...body.mass.center, editAnchor: 'body' } } }
        : body;
    }),
    groups: after.groups.map((group) =>
      group.mass?.center &&
      before.groups.some(
        (previous) =>
          previous.members.some((id) => group.members.includes(id)) &&
          wasLost(group.mass!.center!.editAnchor, previous.mass?.center?.editAnchor)
      )
        ? {
            ...group,
            mass: { ...group.mass, center: { ...group.mass.center, editAnchor: 'body' } },
          }
        : group
    ),
  };
}
