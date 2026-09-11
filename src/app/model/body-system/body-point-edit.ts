import { projectBodyEdit } from './body-edit-projection';
import { bodyNullSpace, factorBodyRows } from './body-linear-algebra';
import { BodyDocument } from './body-document';
import { AttachmentId } from './body-id';
import { finitePoint, Point } from './body-frame';
import { BodyEditRefusal } from './body-edit-types';
import { BodyGeometryOperation, editBodyGeometry } from './body-geometry-edit';
import { compileWeldFrames } from './weld-frames';
import { createPointEditModel } from './body-point-model';
import { pointEditRows } from './body-point-rows';
import { relaxBodyEdit } from './body-edit-relaxation';
import { bodyEditRefusal } from './joint-permission';

export interface BodyPointMove {
  readonly kind: 'move-point';
  readonly attachmentId: AttachmentId;
  /** Typed placement is exact; pointer motion may project onto the allowed local motion. */
  readonly target: Point;
  readonly mode?: 'exact' | 'project';
}
type PointEditResult =
  | {
      readonly ok: true;
      readonly document: BodyDocument;
      readonly operations: readonly BodyGeometryOperation[];
    }
  | BodyEditRefusal;
export function editBodyPoint(document: BodyDocument, operation: BodyPointMove): PointEditResult {
  try {
    return pointCandidate(document, operation);
  } catch {
    return bodyEditRefusal('invalid-document');
  }
}
function pointCandidate(document: BodyDocument, operation: BodyPointMove): PointEditResult {
  if (operation.mode !== undefined && !['exact', 'project'].includes(operation.mode))
    return bodyEditRefusal('invalid-command');
  if (!finitePoint(operation.target)) return bodyEditRefusal('invalid-command');
  if (!document.attachments.some((p) => p.id === operation.attachmentId))
    return bodyEditRefusal('missing-target');
  for (const assembly of document.assemblies) {
    const joint = document.joints.find((j) => j.id === assembly.internalJoint)!;
    if ([joint.frameA.attachmentId, joint.frameB.attachmentId].includes(operation.attachmentId))
      return bodyEditRefusal('assembly-interior', [{ kind: 'assembly', id: assembly.id }]);
  }
  const compiled = compileWeldFrames(document);
  if (!compiled.ok) return bodyEditRefusal('invalid-document');
  const model = createPointEditModel(
    document,
    operation.attachmentId,
    compiled.groups,
    compiled.groupOf
  );
  const distance = Math.hypot(
    operation.target.x - model.origin.x,
    operation.target.y - model.origin.y
  );
  if (distance === 0) return { ok: true, document, operations: [] };
  const owner = document.attachments.find((p) => p.id === operation.attachmentId)!.bodyId;
  const locked = [...compiled.groupOf.get(owner)!.members.keys()].filter((id) => {
    const body = document.bodies.find((b) => b.id === id)!;
    return body.kind === 'material' && body.locked;
  });
  if (locked.length)
    return bodyEditRefusal(
      'locked-position',
      locked.map((id) => ({ kind: 'body', id }))
    );
  if (document.locks.includes(operation.attachmentId))
    return bodyEditRefusal('locked-position', [{ kind: 'attachment', id: operation.attachmentId }]);
  const seed = Array(model.width).fill(0);
  const initial = pointEditRows(model, seed, model.origin);
  const factor = factorBodyRows(
    initial.slice(0, -2).map((row) => row.gradient),
    model.width
  );
  const freedom = factor && bodyNullSpace(factor);
  if (
    !freedom?.some((direction) =>
      initial
        .slice(-2)
        .some(
          (row) => Math.abs(row.gradient.reduce((sum, v, i) => sum + v * direction[i], 0)) > 1e-10
        )
    )
  )
    return bodyEditRefusal('unsolved-edit');
  // A straight interpolation of cursor goals is not a valid path on a held arc. Correct the actual target.
  const rowsAt = (candidate: readonly number[]) =>
    pointEditRows(model, candidate, operation.target);
  let values =
    operation.mode === 'project'
      ? projectBodyEdit(seed, rowsAt, model.angularColumns)
      : relaxBodyEdit(seed, rowsAt, model.angularColumns);
  if (!values && operation.mode !== 'project') {
    const projected = projectBodyEdit(seed, rowsAt, model.angularColumns);
    if (projected) values = relaxBodyEdit(projected, rowsAt, model.angularColumns);
  }
  if (!values) return bodyEditRefusal('unsolved-edit');
  const operations = model.operations(values);
  let candidate = document;
  for (const op of operations) {
    const result = editBodyGeometry(candidate, op);
    if (!result.ok) return result;
    candidate = result.document;
  }
  return { ok: true, document: candidate, operations };
}
