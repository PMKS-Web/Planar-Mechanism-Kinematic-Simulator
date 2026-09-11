import { reverseJoint } from './reverse-joint';
import { BodyDocument } from './body-document';
import { BodyEditOperation, BodyEditRefusal } from './body-edit-types';
import { AttachmentId } from './body-id';
import { dot, localToWorld, relativePose, rotate, subtract, worldToLocal } from './body-frame';
import { Attachment, BodyJoint, hasCoordinate } from './joint-record';
import { bodyEditRefusal, refuseNativeJointChange } from './joint-permission';

export function changeBodyJointKind(
  document: BodyDocument,
  operation: Extract<BodyEditOperation, { kind: 'joint-kind' }>,
  commandId: string
): { readonly ok: true; readonly document: BodyDocument } | BodyEditRefusal {
  const refused = refuseNativeJointChange(document, operation.jointId);
  if (refused) return refused;
  const joint = document.joints.find((item) => item.id === operation.jointId)!;
  if (joint.kind === operation.jointKind) return { ok: true, document };
  const target = { kind: 'joint' as const, id: joint.id };
  if (
    joint.kind === 'prismatic' &&
    operation.jointKind === 'pin-in-slot' &&
    joint.guideDisplay?.bodyId === joint.bodyB
  ) {
    const reversed = {
      ...document,
      joints: document.joints.map((item) => (item.id === joint.id ? reverseJoint(item) : item)),
      drivers: document.drivers.map((driver) =>
        driver.coordinate.jointId === joint.id
          ? {
              ...driver,
              profile: {
                ...driver.profile,
                initial: -driver.profile.initial,
                speed: -driver.profile.speed,
              },
            }
          : driver
      ),
      limits: document.limits.map((limit) =>
        limit.coordinate.jointId === joint.id
          ? { ...limit, lower: -limit.upper, upper: -limit.lower }
          : limit
      ),
    };
    return changeBodyJointKind(reversed, operation, commandId);
  }
  const a = document.bodies.find((body) => body.id === joint.bodyA)!,
    b = document.bodies.find((body) => body.id === joint.bodyB)!;
  let anchorA = document.attachments.find((point) => point.id === joint.frameA.attachmentId)!;
  let anchorB = document.attachments.find((point) => point.id === joint.frameB.attachmentId)!;
  const added: Attachment[] = [];
  if (joint.kind === 'weld' && operation.jointKind !== 'weld' && !operation.worldPoint)
    return bodyEditRefusal('connection-point', [target]);
  const guided = joint.kind === 'prismatic' || joint.kind === 'pin-in-slot';
  const staysGuided =
    guided && (operation.jointKind === 'prismatic' || operation.jointKind === 'pin-in-slot');
  if (staysGuided && (operation.worldPoint !== undefined || operation.worldAxis !== undefined))
    return bodyEditRefusal('invalid-command', [target]);
  if (operation.worldPoint) {
    const capture = (anchor: Attachment, pose: typeof a.pose, suffix: string): Attachment => {
      const shown = localToWorld(pose, anchor.point),
        point = operation.worldPoint!;
      const tolerance =
        64 *
        Number.EPSILON *
        Math.max(
          Math.hypot(pose.x, pose.y),
          Math.hypot(anchor.point.x, anchor.point.y),
          Math.hypot(point.x, point.y)
        );
      if (Math.hypot(shown.x - point.x, shown.y - point.y) <= tolerance) return anchor;
      const replacement = {
        ...anchor,
        id: `${commandId}:${suffix}` as AttachmentId,
        point: worldToLocal(pose, point),
        label: '',
        trace: false,
        vertexId: undefined,
      };
      added.push(replacement);
      return replacement;
    };
    anchorA = capture(anchorA, a.pose, 'a');
    anchorB = capture(anchorB, b.pose, 'b');
  }
  const worldAxis = operation.worldAxis ?? a.pose.angle + joint.frameA.angle;
  const frameA = staysGuided
    ? joint.frameA
    : { attachmentId: anchorA.id, angle: worldAxis - a.pose.angle };
  const frameB =
    staysGuided && operation.jointKind !== 'prismatic'
      ? joint.frameB
      : { attachmentId: anchorB.id, angle: worldAxis - b.pose.angle };
  const pair = { id: joint.id, label: joint.label, bodyA: a.id, bodyB: b.id, frameA, frameB };
  const angleZero =
    joint.kind !== 'weld' && operation.jointKind !== 'prismatic'
      ? joint.angleZero
      : b.pose.angle - a.pose.angle;
  const travelZero = guided
    ? joint.travelZero
    : dot(
        rotate({ x: 1, y: 0 }, worldAxis),
        subtract(localToWorld(b.pose, anchorB.point), localToWorld(a.pose, anchorA.point))
      );
  const replacement: BodyJoint =
    operation.jointKind === 'weld'
      ? { ...pair, kind: 'weld', rest: relativePose(a.pose, b.pose) }
      : operation.jointKind === 'revolute'
        ? { ...pair, kind: 'revolute', angleZero }
        : {
            ...pair,
            kind: operation.jointKind,
            angleZero,
            travelZero,
            ...(guided && joint.guideDisplay ? { guideDisplay: joint.guideDisplay } : {}),
          };
  const retained = (ref: {
    readonly jointId: BodyJoint['id'];
    readonly coordinate: 'angle' | 'travel';
  }) => ref.jointId !== joint.id || hasCoordinate(replacement, ref.coordinate);
  if (
    !operation.removeCoordinates &&
    (document.drivers.some((driver) => !retained(driver.coordinate)) ||
      document.limits.some((limit) => !retained(limit.coordinate)))
  )
    return bodyEditRefusal('coordinate-in-use', [target]);
  return {
    ok: true,
    document: {
      ...document,
      attachments: [...document.attachments, ...added],
      joints: document.joints.map((item) => (item.id === joint.id ? replacement : item)),
      drivers: document.drivers.filter((driver) => retained(driver.coordinate)),
      limits: document.limits.filter((limit) => retained(limit.coordinate)),
    },
  };
}
