import { BodyDocument } from './body-document';
import { BodyId, AttachmentId, WORLD } from './body-id';
import { Point, finitePoint } from './body-frame';
import { bodyEditRefusal } from './joint-permission';
import { editBodyPoint } from './body-point-edit';

export interface BodyDragMove {
  readonly kind: 'move-body';
  readonly bodyId: BodyId;
  /** The material point grabbed at pointer-down is stable while the body turns. */
  readonly grab: Point;
  readonly target: Point;
}
export function editBodyDrag(document: BodyDocument, operation: BodyDragMove) {
  if (operation.bodyId === WORLD) return bodyEditRefusal('immutable-world');
  if (!document.bodies.some((b) => b.id === operation.bodyId))
    return bodyEditRefusal('missing-target');
  if (!finitePoint(operation.grab) || !finitePoint(operation.target))
    return bodyEditRefusal('invalid-command');
  const id = 'edit:temporary-grab' as AttachmentId;
  if (document.attachments.some((p) => p.id === id)) return bodyEditRefusal('invalid-command');
  const result = editBodyPoint(
    {
      ...document,
      attachments: [
        ...document.attachments,
        { id, bodyId: operation.bodyId, point: operation.grab, label: '', trace: false },
      ],
    },
    { kind: 'move-point', attachmentId: id, target: operation.target, mode: 'project', rigid: true }
  );
  if (!result.ok) return result;
  return {
    ...result,
    document: {
      ...result.document,
      attachments: result.document.attachments.filter((p) => p.id !== id),
    },
  };
}
