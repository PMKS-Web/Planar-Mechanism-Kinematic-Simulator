import { BodyDocument } from './body-document';
import { BodyPropertyOperation } from './body-property-types';
import { BodyEditRefusal } from './body-edit-types';
import { bodyEditRefusal } from './joint-permission';

export function editBodyMarks(
  document: BodyDocument,
  operation: Extract<BodyPropertyOperation, { kind: 'lock' | 'hold' }>
): { readonly ok: true; readonly document: BodyDocument } | BodyEditRefusal {
  let next = document;
  switch (operation.kind) {
    case 'lock': {
      const points = new Set(document.locks);
      const forces = new Set<string>();
      for (const target of operation.targets) {
        if (target.kind === 'attachment') {
          if (!document.attachments.some((item) => item.id === target.id))
            return bodyEditRefusal('missing-target');
          if (operation.locked) points.add(target.id);
          else points.delete(target.id);
        } else {
          if (!document.forces.some((item) => item.id === target.id))
            return bodyEditRefusal('missing-target');
          forces.add(target.id);
        }
      }
      next = {
        ...document,
        locks: [...points],
        forces: document.forces.map((force) => {
          if (!forces.has(force.id)) return force;
          const { locked, ...rest } = force;
          return operation.locked ? { ...rest, locked: true } : rest;
        }),
      };
      break;
    }
    case 'hold': {
      const from = document.attachments.find((item) => item.id === operation.from),
        to = document.attachments.find((item) => item.id === operation.to);
      if (
        !from ||
        !to ||
        from.bodyId !== operation.bodyId ||
        to.bodyId !== operation.bodyId ||
        from === to
      )
        return bodyEditRefusal('invalid-command');
      const pose = document.bodies.find((body) => body.id === operation.bodyId)!.pose;
      const delta = { x: to.point.x - from.point.x, y: to.point.y - from.point.y };
      if (delta.x === 0 && delta.y === 0) return bodyEditRefusal('invalid-command');
      const hold = {
        bodyId: operation.bodyId,
        from: from.id,
        to: to.id,
        ...(operation.dimension === 'length'
          ? { length: Math.hypot(delta.x, delta.y) }
          : { angle: pose.angle + Math.atan2(delta.y, delta.x) }),
      };
      const holds = document.holds.filter(
        (item) =>
          item.bodyId !== operation.bodyId ||
          !(
            (item.from === from.id && item.to === to.id) ||
            (item.from === to.id && item.to === from.id)
          )
      );
      next = { ...document, holds: operation.dimension === null ? holds : [...holds, hold] };
      break;
    }
  }
  return { ok: true, document: next };
}
