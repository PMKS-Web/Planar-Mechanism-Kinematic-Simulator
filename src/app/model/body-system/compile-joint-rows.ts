import { BodyDocument } from './body-document';
import { BodyId, compareRecordIds } from './body-id';
import { unitFactors } from './body-units';
import {
  BodyConstraintRow,
  CompiledAttachment,
  CompiledBodyGroup,
  CompiledBodyDriver,
  CompiledBodyLimit,
  CompiledCoordinate,
  ConstraintPair,
} from './compiled-body-system';
import { AttachmentId } from './body-id';
import { hasCoordinate } from './joint-record';

/** Local anchor geometry is compiled once; no solver depends on drawing mark scale or hull order. */
export function compileJointRows(
  document: BodyDocument,
  groups: ReadonlyMap<BodyId, CompiledBodyGroup>,
  groupOf: ReadonlyMap<BodyId, BodyId>,
  attachments: ReadonlyMap<AttachmentId, CompiledAttachment>
) {
  const length = unitFactors(document.units).length;
  const rows: BodyConstraintRow[] = [];
  const coordinates: CompiledCoordinate[] = [];
  for (const joint of [...document.joints].sort((a, b) => compareRecordIds(a.id, b.id))) {
    if (joint.kind === 'weld') continue;
    const groupA = groupOf.get(joint.bodyA)!;
    const groupB = groupOf.get(joint.bodyB)!;
    const memberA = groups.get(groupA)!.members.get(joint.bodyA)!;
    const memberB = groups.get(groupB)!.members.get(joint.bodyB)!;
    const pair: ConstraintPair = {
      groupA,
      groupB,
      anchorA: attachments.get(joint.frameA.attachmentId)!.point,
      anchorB: attachments.get(joint.frameB.attachmentId)!.point,
      axisA: memberA.angle + joint.frameA.angle,
      memberAngleA: memberA.angle,
      memberAngleB: memberB.angle,
    };
    const row = (kind: BodyConstraintRow['kind'], zero = 0): BodyConstraintRow => ({
      key: `${joint.id}:${kind}`,
      jointId: joint.id,
      kind,
      pair,
      zero,
    });
    if (joint.kind === 'revolute') rows.push(row('coincidence-x'), row('coincidence-y'));
    else rows.push(row('lateral'));
    if (joint.kind === 'prismatic') rows.push(row('angle', joint.angleZero));
    for (const coordinate of ['angle', 'travel'] as const) {
      if (!hasCoordinate(joint, coordinate)) continue;
      const zero =
        coordinate === 'angle'
          ? joint.angleZero
          : joint.kind !== 'revolute'
            ? joint.travelZero * length
            : 0;
      coordinates.push({ jointId: joint.id, coordinate, row: row(coordinate, zero) });
    }
  }
  const getCoordinate = (ref: { jointId: string; coordinate: string }) =>
    coordinates.find(
      (entry) => entry.jointId === ref.jointId && entry.coordinate === ref.coordinate
    )!.row;
  const drivers: CompiledBodyDriver[] = [...document.drivers]
    .sort((a, b) => compareRecordIds(a.id, b.id))
    .map((driver) => {
      const factor = driver.coordinate.coordinate === 'angle' ? 1 : length;
      const row = {
        ...getCoordinate(driver.coordinate),
        key: `drive:${driver.id}`,
        commandId: driver.id,
      };
      rows.push(row);
      return {
        id: driver.id,
        row,
        initial: driver.profile.initial * factor,
        speed: driver.profile.speed * factor,
      };
    });
  const limits: CompiledBodyLimit[] = [...document.limits]
    .sort((a, b) => compareRecordIds(a.id, b.id))
    .map((limit) => {
      const factor = limit.coordinate.coordinate === 'angle' ? 1 : length;
      return {
        id: limit.id,
        row: getCoordinate(limit.coordinate),
        lower: limit.lower * factor,
        upper: limit.upper * factor,
      };
    });
  return { rows, coordinates, drivers, limits };
}
