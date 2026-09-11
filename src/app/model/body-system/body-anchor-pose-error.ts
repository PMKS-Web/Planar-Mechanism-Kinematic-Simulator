import { AdmittedBodySystem } from './body-continuation';
import { BodyDocument } from './body-document';
import { BodyId } from './body-id';
import { localToWorld, Pose } from './body-frame';
import { geometryCenter } from './body-center-geometry';

/** A remote world origin affects position precision, never the tolerance for a wrong assembly angle. */
export function bodyAnchorPoseError(
  admitted: AdmittedBodySystem,
  source: BodyDocument,
  material: ReadonlyMap<BodyId, Pose>,
  length: number
): number {
  let error = 0;
  for (const [id, pose] of material) {
    const body = source.bodies.find((item) => item.id === id);
    if (!body || body.kind === 'world') continue;
    const center = geometryCenter(body.geometry);
    const first = localToWorld(pose, center),
      second = localToWorld(body.pose, center);
    const distance = Math.max(
      0,
      Math.hypot(first.x - second.x, first.y - second.y) * length - admitted.frame.inputPrecision
    );
    error = Math.max(
      error,
      distance / admitted.scale.length,
      Math.abs(Math.sin((pose.angle - body.pose.angle) / 2))
    );
  }
  return error;
}
