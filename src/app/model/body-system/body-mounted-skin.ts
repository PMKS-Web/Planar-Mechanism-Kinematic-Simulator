import { BodyDocument } from './body-document';
import { MaterialBody } from './material-body';
import { worldToLocal, add, rotate } from './body-frame';
import { bodyJointMarks } from './body-joint-marks';
import { WORLD } from './body-id';
import { blockPath, motorBodyPath, channelPath, MARK } from '../joint-marks';
import { buildCompoundPath, transformRigidPath, mergedChannels } from '../compound-link-path';

/** Cases belong to their rigid rider; channels belong to their guide, independent of joint order. */
export function mountedBodySkin(
  document: BodyDocument,
  body: MaterialBody,
  outline: string
): string {
  const r = document.settings.objectScale * 0.15;
  const extras: string[] = [];
  const internal = new Set(document.assemblies.map((assembly) => assembly.internalJoint));
  for (const joint of document.joints) {
    if (internal.has(joint.id)) continue;
    const guide =
      joint.kind === 'prismatic' ? (joint.guideDisplay?.bodyId ?? joint.bodyA) : undefined;
    const rider = guide === joint.bodyB ? joint.bodyA : joint.bodyB;
    const frame = body.id === joint.bodyA ? joint.frameA : joint.frameB;
    const point = document.attachments.find((point) => point.id === frame.attachmentId)!;
    if (joint.kind === 'prismatic' && rider === body.id)
      extras.push(at(blockPath(r), point.point, frame.angle));
    if (
      joint.kind === 'revolute' &&
      joint.bodyA === body.id &&
      joint.bodyB !== WORLD &&
      document.drivers.some((driver) => driver.coordinate.jointId === joint.id)
    )
      extras.push(at(motorBodyPath(r), point.point, frame.angle));
  }
  return extras.length
    ? buildCompoundPath([outline, ...extras], MARK.plateFillet * r).path
    : outline;
}

export function bodySlotChannels(document: BodyDocument, body: MaterialBody): string {
  const paths = bodyJointMarks(document).flatMap((mark) => {
    const joint = document.joints.find((joint) => joint.id === mark.key);
    if (
      !mark.guide ||
      !joint ||
      joint.kind === 'revolute' ||
      joint.kind === 'weld' ||
      (joint.guideDisplay?.bodyId ?? joint.bodyA) !== body.id
    )
      return [];
    const center = worldToLocal(body.pose, {
      x: (mark.guide[0].x + mark.guide[1].x) / 2,
      y: (mark.guide[0].y + mark.guide[1].y) / 2,
    });
    const half =
      Math.hypot(mark.guide[1].x - mark.guide[0].x, mark.guide[1].y - mark.guide[0].y) / 2;
    return [
      at(
        channelPath(document.settings.objectScale * 0.15, half),
        center,
        mark.angle - body.pose.angle
      ),
    ];
  });
  return mergedChannels(paths);
}
function at(path: string, point: { x: number; y: number }, angle: number) {
  return transformRigidPath(
    path,
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    point,
    add(point, rotate({ x: 1, y: 0 }, angle))
  );
}
