import { BodyDocument, BodyDriver } from './body-document';

/** Carry only the same physical coordinate, including the explicit sign change of an ordered P pair. */
export function bodyAnchorCoordinateSign(
  before: BodyDocument,
  after: BodyDocument,
  old: BodyDriver,
  next: BodyDriver
): 1 | -1 | undefined {
  if (old.coordinate.coordinate !== next.coordinate.coordinate) return undefined;
  const a = before.joints.find((joint) => joint.id === old.coordinate.jointId);
  const b = after.joints.find((joint) => joint.id === next.coordinate.jointId);
  if (!a || !b || a.kind === 'weld' || b.kind === 'weld') return undefined;
  const sign =
    a.bodyA === b.bodyA && a.bodyB === b.bodyB
      ? 1
      : a.bodyA === b.bodyB && a.bodyB === b.bodyA
        ? -1
        : undefined;
  if (!sign) return undefined;
  if (old.coordinate.coordinate === 'angle')
    return b.angleZero === sign * a.angleZero ? sign : undefined;
  if (a.kind === 'revolute' || b.kind === 'revolute' || b.travelZero !== sign * a.travelZero)
    return undefined;
  const oldCarrier = sign === 1 ? a.bodyA : a.bodyB;
  const axis = sign === 1 ? a.frameA.angle : a.frameA.angle - a.angleZero;
  const first = sign === 1 ? a.frameA.attachmentId : a.frameB.attachmentId;
  const second = sign === 1 ? a.frameB.attachmentId : a.frameA.attachmentId;
  return oldCarrier === b.bodyA &&
    b.frameA.angle === axis &&
    b.frameA.attachmentId === first &&
    b.frameB.attachmentId === second
    ? sign
    : undefined;
}
