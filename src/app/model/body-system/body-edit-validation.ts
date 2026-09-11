import { BodyDocument } from './body-document';
import { BodyEditRefusal } from './body-edit-types';
import { bodyRowValue } from './body-constraint-rows';
import { bodyPositionScale } from './body-position-scale';
import { createBodySolveFrame } from './body-solve-frame';
import { compileBodyDocument } from './constraint-compiler';
import { fixedBodyAdmission } from './body-admission';
import { checkBodyLimits } from './body-limits';
import { bodyEditRefusal } from './joint-permission';

/** An underconstrained drawing is editable; a connection with conflicting anchors is not a repair request. */
export function validateBodyEditDocument(document: BodyDocument): BodyEditRefusal | undefined {
  try {
    const compiled = compileBodyDocument(document);
    if (!compiled.ok) {
      const scope = compiled.issues.some(
        (issue) => issue.code === 'split-load-scope' || issue.code === 'load-scope-changed'
      );
      return {
        ...bodyEditRefusal(scope ? 'ambiguous-load-owner' : 'invalid-document'),
        issues: compiled.issues,
      };
    }
    const system = compiled.system;
    const lockedDrive = [
      ...system.fixedDrivers,
      ...system.partitions.flatMap((partition) => partition.drivers),
    ].find((driver) => driver.speed !== 0 && driver.row.pair.groupA === driver.row.pair.groupB);
    if (lockedDrive)
      return bodyEditRefusal('drive-in-rigid-group', [
        { kind: 'joint', id: lockedDrive.row.jointId },
      ]);
    if (fixedBodyAdmission(system)) return bodyEditRefusal('invalid-document');
    const poses = new Map([...system.groups].map(([id, group]) => [id, group.pose]));
    for (const partition of system.partitions) {
      const frame = createBodySolveFrame(partition, poses),
        local = frame.partition;
      const commands = new Map(local.drivers.map((driver) => [driver.id, driver.initial]));
      const scale = bodyPositionScale(local, frame.initialPoses, commands);
      if (
        local.rows.some(
          (row, i) =>
            Math.abs(bodyRowValue(row, frame.initialPoses, commands) * scale.rows[i]) >
            1e-9 + (row.kind === 'angle' ? 0 : frame.inputPrecision * scale.rows[i])
        ) ||
        checkBodyLimits(local, frame.initialPoses, scale)
      )
        return bodyEditRefusal('invalid-document');
    }
    return undefined;
  } catch {
    return bodyEditRefusal('invalid-document');
  }
}
