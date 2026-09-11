import { BodyDocument } from './body-document';
import { CompiledBodyPartition } from './compiled-body-system';
import { BodyId, compareRecordIds } from './body-id';
import { bodyMotionRecord } from './body-motion-record';
import { sameBodyRecord } from './body-edit-effects';

/** Adding material to a fixed group invalidates analysis, but cannot change an untouched machine's clock. */
export function unchangedBodyMotion(
  before: BodyDocument,
  after: BodyDocument,
  oldPartition: CompiledBodyPartition | undefined,
  partition: CompiledBodyPartition
): boolean {
  if (
    !oldPartition ||
    !sameBodyRecord(
      [...oldPartition.materialIds].sort(compareRecordIds),
      [...partition.materialIds].sort(compareRecordIds)
    )
  )
    return false;
  const members = new Set(partition.materialIds);
  const records = (document: BodyDocument) => {
    const joints = document.joints.filter(
      (joint) => members.has(joint.bodyA) || members.has(joint.bodyB)
    );
    const jointIds = new Set(joints.map((joint) => joint.id));
    const bodies = new Set<BodyId>([
      ...members,
      ...joints.flatMap((joint) => [joint.bodyA, joint.bodyB]),
    ]);
    const anchors = new Set(
      joints.flatMap((joint) => [joint.frameA.attachmentId, joint.frameB.attachmentId])
    );
    const sorted = <T extends { readonly id: string }>(values: readonly T[]) =>
      [...values].sort((a, b) => compareRecordIds(a.id, b.id));
    return {
      units: document.units,
      bodies: sorted(document.bodies.filter((body) => bodies.has(body.id))).map((body) =>
        bodyMotionRecord({ kind: 'body', id: body.id }, body)
      ),
      joints: sorted(joints).map((joint) =>
        bodyMotionRecord({ kind: 'joint', id: joint.id }, joint)
      ),
      attachments: sorted(
        document.attachments.filter((point) => members.has(point.bodyId) || anchors.has(point.id))
      ).map((point) => bodyMotionRecord({ kind: 'attachment', id: point.id }, point)),
      drivers: sorted(document.drivers.filter((driver) => jointIds.has(driver.coordinate.jointId))),
      limits: sorted(document.limits.filter((limit) => jointIds.has(limit.coordinate.jointId))),
      holds: document.holds.filter((hold) => members.has(hold.bodyId)),
    };
  };
  return sameBodyRecord(records(before), records(after));
}
