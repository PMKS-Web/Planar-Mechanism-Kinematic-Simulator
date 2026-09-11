import { BodyDocument } from './body-document';
import {
  BodyEditCommand,
  BodyEditContext,
  BodyEditOperation,
  BodyEditResult,
} from './body-edit-types';
import { BodyEditFrame, withBodyEditFrame } from './body-edit-frame';
import { planBodyDesignEdit } from './body-design-edit-plan';
import { isBodyPropertyOperation } from './body-property-edit';
import { bodyEditEffects, sameBodyRecord } from './body-edit-effects';
import { validateBodyEditDocument } from './body-edit-validation';
import { validateBodyEditHolds } from './body-hold-validation';
import { bodyEditRefusal } from './joint-permission';
import { snapshotCopy } from './sample-results';

/** These edits preserve every physical frame; geometry that changes a constraint needs re-anchoring. */
export function directBodyFrameOperation(
  document: BodyDocument,
  operation: BodyEditOperation
): boolean {
  if (isBodyPropertyOperation(operation)) return true;
  if (operation.kind === 'move-point' || operation.kind === 'attachment-position') {
    const point = document.attachments.find((item) => item.id === operation.attachmentId);
    return (
      !!point &&
      !point.vertexId &&
      !document.joints.some(
        (joint) => joint.frameA.attachmentId === point.id || joint.frameB.attachmentId === point.id
      ) &&
      !document.assemblies.some(
        (assembly) => assembly.barrelMount === point.id || assembly.rodMount === point.id
      )
    );
  }
  return operation.kind === 'project';
}

export function planPosedBodyProperties(
  document: BodyDocument,
  revision: number,
  command: BodyEditCommand,
  context: BodyEditContext,
  frame: BodyEditFrame
): BodyEditResult {
  if (frame.revision !== revision) return bodyEditRefusal('stale-pose');
  const source = snapshotCopy(document);
  const invalid = validateBodyEditDocument(source);
  if (invalid) return invalid;
  if (
    frame.poses.size !== document.bodies.length ||
    document.bodies.some((body) => !frame.poses.has(body.id)) ||
    frame.clocks.length !== document.drivers.length ||
    new Set(frame.clocks.map((clock) => clock.driverId)).size !== frame.clocks.length ||
    frame.clocks.some(
      (clock) =>
        ![clock.anchor, clock.command, clock.time].every(Number.isFinite) ||
        clock.time < 0 ||
        typeof clock.synced !== 'boolean' ||
        (clock.direction !== undefined && clock.direction !== 1 && clock.direction !== -1)
    ) ||
    document.drivers.some((driver) => !frame.clocks.some((clock) => clock.driverId === driver.id))
  )
    return bodyEditRefusal('stale-pose');
  const displayed = withBodyEditFrame(source, frame);
  const changed = planBodyDesignEdit(displayed, revision, command, context);
  if (!changed.ok) return changed;
  const proposed = changed.document;
  // A directly mapped tracer must not carry a held neighbor's physical connection or resize its body.
  if (
    proposed.bodies.some((body) => {
      const old = displayed.bodies.find((item) => item.id === body.id);
      return (
        !old ||
        !sameBodyRecord(body.pose, old.pose) ||
        (body.kind === 'material' &&
          old.kind === 'material' &&
          !sameBodyRecord(body.geometry, old.geometry))
      );
    }) ||
    !sameBodyRecord(displayed.joints, proposed.joints) ||
    proposed.attachments.some((point) => {
      const old = displayed.attachments.find((item) => item.id === point.id);
      return (
        !sameBodyRecord(point.point, old?.point) &&
        displayed.joints.some(
          (joint) =>
            joint.frameA.attachmentId === point.id || joint.frameB.attachmentId === point.id
        )
      );
    })
  )
    return bodyEditRefusal('unsolved-edit');
  const candidate: BodyDocument = {
    ...proposed,
    bodies: proposed.bodies.map((body) => ({
      ...body,
      pose: source.bodies.find((old) => old.id === body.id)!.pose,
    })),
    drivers: source.drivers,
    holds: proposed.holds.map((hold) => {
      const old = displayed.holds.find(
        (item) => item.bodyId === hold.bodyId && item.from === hold.from && item.to === hold.to
      );
      if (old && sameBodyRecord(old, hold))
        return source.holds.find(
          (item) => item.bodyId === hold.bodyId && item.from === hold.from && item.to === hold.to
        )!;
      const body = source.bodies.find((item) => item.id === hold.bodyId)!;
      return hold.angle === undefined
        ? hold
        : {
            ...hold,
            angle: hold.angle - frame.poses.get(hold.bodyId)!.angle + body.pose.angle,
          };
    }),
  };
  const refused = validateBodyEditDocument(candidate) ?? validateBodyEditHolds(candidate);
  if (refused) return refused;
  const effects = bodyEditEffects(source, candidate);
  return snapshotCopy({
    ...changed,
    document: candidate,
    effects,
    changed: effects.added.length + effects.removed.length + effects.changed.length > 0,
    display: frame,
  });
}
