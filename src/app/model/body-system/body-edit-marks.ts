import { WORLD } from './body-id';
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
      const bodies = new Set<string>();
      for (const target of operation.targets) {
        if (target.kind === 'attachment') {
          if (!document.attachments.some((item) => item.id === target.id))
            return bodyEditRefusal('missing-target');
          if (operation.locked) points.add(target.id);
          else points.delete(target.id);
        } else if (target.kind === 'body') {
          if (target.id === WORLD) return bodyEditRefusal('immutable-world', [target]);
          if (!document.bodies.some((item) => item.id === target.id))
            return bodyEditRefusal('missing-target', [target]);
          bodies.add(target.id);
        } else {
          if (!document.forces.some((item) => item.id === target.id))
            return bodyEditRefusal('missing-target');
          forces.add(target.id);
        }
      }
      next = {
        ...document,
        locks: [...points],
        bodies: document.bodies.map((body) => {
          if (body.kind === 'world' || !bodies.has(body.id)) return body;
          const { locked, ...rest } = body;
          return operation.locked ? { ...rest, locked: true } : rest;
        }),
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
      const samePair = (item: BodyDocument['holds'][number]) =>
        item.bodyId === operation.bodyId &&
        ((item.from === from.id && item.to === to.id) ||
          (item.from === to.id && item.to === from.id));
      // Existing commands replace the pair's hold; explicit toggles preserve the other dimension.
      const old = operation.enabled === undefined ? undefined : document.holds.find(samePair);
      const hold = {
        bodyId: operation.bodyId,
        from: from.id,
        to: to.id,
        ...(old?.length !== undefined ? { length: old.length } : {}),
        ...(old?.angle !== undefined
          ? {
              angle: old.from === from.id ? old.angle : old.angle + Math.PI,
            }
          : {}),
      };
      if (operation.dimension !== null) {
        if (operation.enabled === false) delete hold[operation.dimension];
        else if (operation.dimension === 'length') hold.length = Math.hypot(delta.x, delta.y);
        else hold.angle = pose.angle + Math.atan2(delta.y, delta.x);
      }
      const holds = document.holds.filter((item) => !samePair(item));
      next = {
        ...document,
        holds:
          operation.dimension !== null && (hold.length !== undefined || hold.angle !== undefined)
            ? [...holds, hold]
            : holds,
      };
      break;
    }
  }
  return { ok: true, document: next };
}
