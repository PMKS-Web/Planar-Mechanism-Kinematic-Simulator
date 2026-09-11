import { BodyDocument, BodyLoad } from './body-document';
import { BodyPropertyOperation } from './body-property-types';
import { BodyEditRefusal } from './body-edit-types';
import { localToWorld, worldToLocal, rotate, Point } from './body-frame';
import { bodyEditRefusal } from './joint-permission';

export function bodyForceHeading(force: BodyLoad): number {
  return force.vector.x !== 0 || force.vector.y !== 0
    ? Math.atan2(force.vector.y, force.vector.x)
    : (force.presentation?.zeroAngle ?? 0);
}
export function bodyForceEnds(document: BodyDocument, force: BodyLoad): readonly [Point, Point] {
  const pose = document.bodies.find((body) => body.id === force.bodyId)!.pose;
  const start = localToWorld(pose, force.point);
  const angle = bodyForceHeading(force) + (force.frame === 'body' ? pose.angle : 0);
  const length = force.presentation?.length ?? 1;
  return [start, { x: start.x + length * Math.cos(angle), y: start.y + length * Math.sin(angle) }];
}

export function editBodyForce(
  document: BodyDocument,
  operation: Extract<BodyPropertyOperation, { kind: 'force-properties' | 'force-owner' }>
): { readonly ok: true; readonly document: BodyDocument } | BodyEditRefusal {
  const force = document.forces.find((item) => item.id === operation.forceId);
  if (!force) return bodyEditRefusal('missing-target', [{ kind: 'force', id: operation.forceId }]);
  const oldPose = document.bodies.find((body) => body.id === force.bodyId)!.pose;
  let next: BodyLoad;
  if (operation.kind === 'force-owner') {
    const owner = document.bodies.find((body) => body.id === operation.bodyId);
    if (!owner || owner.kind !== 'material')
      return bodyEditRefusal('missing-target', [{ kind: 'body', id: operation.bodyId }]);
    if (owner.id === force.bodyId && !force.legacyGroupScope) return { ok: true, document };
    const { legacyGroupScope, ...retained } = force;
    const angle = force.frame === 'body' ? oldPose.angle - owner.pose.angle : 0;
    next = {
      ...retained,
      bodyId: owner.id,
      point: worldToLocal(owner.pose, localToWorld(oldPose, force.point)),
      vector: rotate(force.vector, angle),
      ...(force.vector.x === 0 && force.vector.y === 0
        ? { presentation: { ...force.presentation, zeroAngle: bodyForceHeading(force) + angle } }
        : {}),
    };
  } else {
    const change = Object.fromEntries(
      Object.entries(operation.change).filter(([, value]) => value !== undefined)
    ) as typeof operation.change;
    const frame = change.frame ?? force.frame;
    // Changing reference axes must not change the physical load the reader was looking at.
    const angle = frame === force.frame ? 0 : frame === 'world' ? oldPose.angle : -oldPose.angle;
    const vector = change.vector ?? rotate(force.vector, angle);
    next = {
      ...force,
      ...change,
      vector,
      ...(change.presentation
        ? { presentation: { ...force.presentation, ...change.presentation } }
        : {}),
    };
    if (
      (change.vector !== undefined || change.frame !== undefined) &&
      vector.x === 0 &&
      vector.y === 0 &&
      change.presentation?.zeroAngle === undefined
    )
      next = {
        ...next,
        presentation: { ...next.presentation, zeroAngle: bodyForceHeading(force) + angle },
      };
  }
  return {
    ok: true,
    document: {
      ...document,
      forces: document.forces.map((item) => (item.id === force.id ? next : item)),
    },
  };
}
