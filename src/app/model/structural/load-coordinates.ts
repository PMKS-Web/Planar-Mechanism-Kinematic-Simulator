import type { StructuralBody, StructuralJoint } from './configuration';
import type { ApplicationPoint, AppliedLoad, Vector2 } from './loads';

export function bodyFrame(body: StructuralBody, joints: ReadonlyMap<string, StructuralJoint>) {
  const origin = joints.get(body.frameJointIds[0])!.positionM;
  const end = joints.get(body.frameJointIds[1])!.positionM;
  const length = Math.hypot(end.x - origin.x, end.y - origin.y);
  return { origin, axis: { x: (end.x - origin.x) / length, y: (end.y - origin.y) / length } };
}
export function rotateVector(p: Vector2, axis: Vector2): Vector2 {
  return { x: axis.x * p.x - axis.y * p.y, y: axis.y * p.x + axis.x * p.y };
}
export function resolveApplicationPoint(
  at: ApplicationPoint,
  frame: ReturnType<typeof bodyFrame>
): Vector2 {
  if (at.frame === 'global') return { ...at.positionM };
  const offset = rotateVector(at.positionM, frame.axis);
  return { x: frame.origin.x + offset.x, y: frame.origin.y + offset.y };
}
/** Shared by body equilibrium and member recovery, after configuration/load validation. */
export function resolvePointForce(
  load: Extract<AppliedLoad, { kind: 'point-force' }>,
  frame: ReturnType<typeof bodyFrame>
) {
  return {
    point: resolveApplicationPoint(load.at, frame),
    force:
      load.directionFrame === 'link' ? rotateVector(load.forceN, frame.axis) : { ...load.forceN },
  };
}
