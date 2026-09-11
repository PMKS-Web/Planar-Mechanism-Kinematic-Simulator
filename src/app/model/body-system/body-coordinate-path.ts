import { BodyDocument } from './body-document';
import { BodyCoordinateMove } from './body-coordinate-edit';
import { compileBodyDocument } from './constraint-compiler';
import { admitBodyPartition } from './body-admission';
import { initialBodyContinuation } from './body-continuation';
import { inspectBodyInterval } from './body-interval';
import { bodyAnchorMaterialPoses } from './body-anchor-material-poses';
import { newRecordId } from './body-id';
import { unitFactors } from './body-units';

/** Reuse the motion kernel's fold and interior-stop search; endpoint edit residuals cannot prove a clear path. */
export function coordinatePathIsClear(
  source: BodyDocument,
  candidate: BodyDocument,
  operation: BodyCoordinateMove,
  initial: number
): boolean {
  const existing = source.drivers.find(
    (driver) =>
      driver.coordinate.jointId === operation.coordinate.jointId &&
      driver.coordinate.coordinate === operation.coordinate.coordinate
  );
  const id = existing?.id ?? newRecordId<'driver'>();
  const driven: BodyDocument = {
    ...source,
    drivers: existing
      ? source.drivers
      : [
          ...source.drivers,
          {
            id,
            coordinate: operation.coordinate,
            profile: { kind: 'constant-speed', initial, speed: 0 },
          },
        ],
  };
  const compiled = compileBodyDocument(driven);
  if (!compiled.ok) return false;
  const part = compiled.system.partitions.find((item) =>
    item.drivers.some((driver) => driver.id === id)
  );
  if (!part) return false;
  const admitted = admitBodyPartition(compiled.system, part);
  // A loose sketch has an edit metric, not a unique physical motion parameterized by this coordinate.
  if (!admitted.ok) return ['underconstrained', 'multiple-drives'].includes(admitted.reason);
  const length = unitFactors(source.units).length;
  const factor = operation.coordinate.coordinate === 'travel' ? length : 1;
  const scale = operation.coordinate.coordinate === 'travel' ? admitted.scale.length : 1;
  const target = operation.target * factor;
  const interval = inspectBodyInterval(admitted, initialBodyContinuation(admitted), target);
  if (!interval.ok || Math.abs(interval.state.command - target) > 1e-9 * scale) return false;
  const expected = bodyAnchorMaterialPoses(
    compiled.system,
    admitted.frame,
    interval.state.poses,
    length
  );
  const tolerance =
    (1e-7 * admitted.scale.length) / length + admitted.frame.inputPrecision / length;
  return [...expected].every(([bodyId, pose]) => {
    const actual = candidate.bodies.find((body) => body.id === bodyId)!.pose;
    return (
      Math.hypot(actual.x - pose.x, actual.y - pose.y) <= tolerance &&
      Math.abs(actual.angle - pose.angle) <= 1e-7
    );
  });
}
