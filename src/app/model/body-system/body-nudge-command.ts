import { BodyDocument } from './body-document';
import { BodySelectionRef, BodyEditOperation } from './body-edit-types';
import {
  attachmentWorld,
  nativeCommand,
  selectionBodies,
  selectionJoints,
} from './body-joint-interaction';
import { add, localToWorld, Point, worldToLocal } from './body-frame';

/** Arrow keys move the same object a pointer would grab: a pin is a position, not its whole link. */
export function bodyNudgeCommand(
  document: BodyDocument,
  targets: readonly BodySelectionRef[],
  delta: Point
) {
  const operations: BodyEditOperation[] = [];
  for (const target of targets) {
    const point =
      target.kind === 'attachment'
        ? target.id
        : selectionJoints(document, target)[0]?.frameB.attachmentId;
    if (point) {
      operations.push({
        kind: 'move-point',
        attachmentId: point,
        target: add(attachmentWorld(document, point), delta),
        mode: 'project',
      });
      continue;
    }
    if (target.kind === 'force') {
      const force = document.forces.find((f) => f.id === target.id);
      if (!force) continue;
      const body = document.bodies.find((b) => b.id === force.bodyId)!;
      operations.push({
        kind: 'force-properties',
        forceId: force.id,
        change: {
          point: worldToLocal(body.pose, add(localToWorld(body.pose, force.point), delta)),
        },
      });
      continue;
    }
    for (const id of selectionBodies(document, [target])) {
      const body = document.bodies.find((b) => b.id === id)!;
      operations.push({
        kind: 'move-body',
        bodyId: id,
        grab: { x: 0, y: 0 },
        target: add(body.pose, delta),
      });
    }
  }
  return nativeCommand(...operations);
}
