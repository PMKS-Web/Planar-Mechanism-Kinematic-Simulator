import { clearBodyEditInterval } from './body-edit-interval';
import { coordinatePathIsClear } from './body-coordinate-path';
import { BodyDocument } from './body-document';
import { BodyEditRefusal } from './body-edit-types';
import { createBodyEditModel } from './body-edit-model';
import { bodyEditCoordinate, bodyEditRows } from './body-edit-rows';
import { editSubtract } from './body-edit-scalar';
import { editBodyGeometry } from './body-geometry-edit';
import { relaxBodyEdit } from './body-edit-relaxation';
import { JointCoordinateRef, hasCoordinate } from './joint-record';
import { jointCoordinate } from './joint-coordinate';
import { WORLD } from './body-id';
import { compileWeldFrames } from './weld-frames';
import { bodyEditRefusal } from './joint-permission';

export interface BodyCoordinateMove {
  readonly kind: 'move-coordinate';
  readonly coordinate: JointCoordinateRef;
  /** An exact physical coordinate, in radians or document length units, never a new datum. */
  readonly target: number;
}

/** Coordinate motion carries rigid material; it cannot resize a bar to satisfy the requested travel. */
export function editBodyCoordinate(
  document: BodyDocument,
  operation: BodyCoordinateMove
): { readonly ok: true; readonly document: BodyDocument } | BodyEditRefusal {
  const joint = document.joints.find((item) => item.id === operation.coordinate.jointId);
  if (!joint) return bodyEditRefusal('missing-target');
  if (
    !Number.isFinite(operation.target) ||
    !['angle', 'travel'].includes(operation.coordinate.coordinate) ||
    !hasCoordinate(joint, operation.coordinate.coordinate)
  )
    return bodyEditRefusal('invalid-command');
  const selected = (coordinate: JointCoordinateRef) =>
    coordinate.jointId === joint.id && coordinate.coordinate === operation.coordinate.coordinate;
  if (
    document.limits.some(
      (limit) =>
        selected(limit.coordinate) &&
        (operation.target < limit.lower || operation.target > limit.upper)
    )
  )
    return bodyEditRefusal('unsolved-edit', [{ kind: 'joint', id: joint.id }]);
  const initial = jointCoordinate(
    joint,
    operation.coordinate.coordinate,
    new Map(document.bodies.map((body) => [body.id, body.pose])),
    new Map(document.attachments.map((point) => [point.id, point]))
  );
  if (initial === operation.target) return { ok: true, document };
  const frames = compileWeldFrames(document);
  if (!frames.ok) return bodyEditRefusal('invalid-document');
  const model = createBodyEditModel(
    { ...document, drivers: document.drivers.filter((driver) => !selected(driver.coordinate)) },
    joint.bodyB === WORLD ? joint.frameA.attachmentId : joint.frameB.attachmentId,
    frames.groups,
    frames.groupOf,
    { rigid: true }
  );
  const factor = operation.coordinate.coordinate === 'travel' ? model.length : 1;
  const distance = (operation.target - initial) / factor;
  let values: readonly number[] = Array(model.width).fill(0),
    progress = 0;
  let step = Math.min(1, 0.1 / Math.abs(distance));
  for (let round = 0; progress < 1 && round < 4096; round++) {
    const next = Math.min(1, progress + step);
    const goal = (initial + (operation.target - initial) * next) / factor;
    const solved = relaxBodyEdit(
      values,
      (candidate) => [
        ...bodyEditRows(model, candidate),
        editSubtract(
          bodyEditCoordinate(model, candidate, joint, operation.coordinate.coordinate),
          model.at(candidate).constant(goal)
        ),
      ],
      model.angularColumns
    );
    // An exact endpoint on another branch is not a continuation of the displayed material.
    if (!solved || solved.some((value, i) => Math.abs(value - values[i]) > 0.2)) {
      step /= 2;
      if (step < 2 ** -24 || next === progress) return bodyEditRefusal('unsolved-edit');
      continue;
    }
    if (!clearBodyEditInterval(model, joint, operation.coordinate.coordinate, values, solved))
      return bodyEditRefusal('unsolved-edit');
    values = solved;
    progress = next;
  }
  if (progress !== 1) return bodyEditRefusal('unsolved-edit');
  let candidate = document;
  for (const op of model.operations(values)) {
    const result = editBodyGeometry(candidate, op);
    if (!result.ok) return result;
    candidate = result.document;
  }
  if (!coordinatePathIsClear(document, candidate, operation, initial))
    return bodyEditRefusal('unsolved-edit');
  return {
    ok: true,
    document: {
      ...candidate,
      drivers: candidate.drivers.map((driver) =>
        selected(driver.coordinate)
          ? { ...driver, profile: { ...driver.profile, initial: operation.target } }
          : driver
      ),
    },
  };
}
