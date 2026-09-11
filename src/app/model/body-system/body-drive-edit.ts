import { BodyDocument } from './body-document';
import { BodyEditRefusal } from './body-edit-types';
import { DriverId, LimitId } from './body-id';
import { hasCoordinate, JointCoordinateRef } from './joint-record';
import { jointCoordinate } from './joint-coordinate';
import { bodyEditRefusal } from './joint-permission';

export type BodyDriveOperation =
  | { readonly kind: 'add-driver'; readonly coordinate: JointCoordinateRef; readonly speed: number }
  | { readonly kind: 'driver-speed'; readonly driverId: DriverId; readonly speed: number }
  | { readonly kind: 'remove-driver'; readonly driverId: DriverId }
  | {
      readonly kind: 'add-limit';
      readonly coordinate: JointCoordinateRef;
      readonly lower: number;
      readonly upper: number;
    }
  | {
      readonly kind: 'limit-bounds';
      readonly limitId: LimitId;
      readonly lower: number;
      readonly upper: number;
    }
  | { readonly kind: 'remove-limit'; readonly limitId: LimitId };

export function isBodyDriveOperation(operation: {
  readonly kind: string;
}): operation is BodyDriveOperation {
  return [
    'add-driver',
    'driver-speed',
    'remove-driver',
    'add-limit',
    'limit-bounds',
    'remove-limit',
  ].includes(operation.kind);
}

/** A drive belongs to a named coordinate; editing one never chooses the first incident body or row. */
export function editBodyDrive(
  document: BodyDocument,
  operation: BodyDriveOperation,
  commandId: string
): { readonly ok: true; readonly document: BodyDocument } | BodyEditRefusal {
  if ('speed' in operation && !Number.isFinite(operation.speed))
    return bodyEditRefusal('invalid-command');
  if (
    'lower' in operation &&
    (![operation.lower, operation.upper].every(Number.isFinite) ||
      operation.lower > operation.upper)
  )
    return bodyEditRefusal('invalid-command');
  if ('driverId' in operation) {
    if (!document.drivers.some((driver) => driver.id === operation.driverId))
      return bodyEditRefusal('missing-target');
    return {
      ok: true,
      document: {
        ...document,
        drivers:
          operation.kind === 'remove-driver'
            ? document.drivers.filter((driver) => driver.id !== operation.driverId)
            : document.drivers.map((driver) =>
                driver.id === operation.driverId
                  ? { ...driver, profile: { ...driver.profile, speed: operation.speed } }
                  : driver
              ),
      },
    };
  }
  if ('limitId' in operation) {
    if (!document.limits.some((limit) => limit.id === operation.limitId))
      return bodyEditRefusal('missing-target');
    const assembly = document.assemblies.find((item) => item.strokeLimit === operation.limitId);
    if (assembly)
      return bodyEditRefusal('assembly-interior', [{ kind: 'assembly', id: assembly.id }]);
    return {
      ok: true,
      document: {
        ...document,
        limits:
          operation.kind === 'remove-limit'
            ? document.limits.filter((limit) => limit.id !== operation.limitId)
            : document.limits.map((limit) =>
                limit.id === operation.limitId
                  ? { ...limit, lower: operation.lower, upper: operation.upper }
                  : limit
              ),
      },
    };
  }
  const joint = document.joints.find((item) => item.id === operation.coordinate.jointId);
  if (!joint) return bodyEditRefusal('missing-target');
  if (
    !['angle', 'travel'].includes(operation.coordinate.coordinate) ||
    !hasCoordinate(joint, operation.coordinate.coordinate)
  )
    return bodyEditRefusal('invalid-command', [{ kind: 'joint', id: joint.id }]);
  if (operation.kind === 'add-limit')
    return {
      ok: true,
      document: {
        ...document,
        limits: [
          ...document.limits,
          {
            id: `${commandId}:limit` as LimitId,
            coordinate: operation.coordinate,
            lower: operation.lower,
            upper: operation.upper,
          },
        ],
      },
    };
  if (
    document.drivers.some(
      (driver) =>
        driver.coordinate.jointId === joint.id &&
        driver.coordinate.coordinate === operation.coordinate.coordinate
    )
  )
    return bodyEditRefusal('coordinate-in-use', [{ kind: 'joint', id: joint.id }]);
  const initial = jointCoordinate(
    joint,
    operation.coordinate.coordinate,
    new Map(document.bodies.map((body) => [body.id, body.pose])),
    new Map(document.attachments.map((point) => [point.id, point]))
  );
  return {
    ok: true,
    document: {
      ...document,
      drivers: [
        ...document.drivers,
        {
          id: `${commandId}:driver` as DriverId,
          coordinate: operation.coordinate,
          profile: { kind: 'constant-speed', initial, speed: operation.speed },
        },
      ],
    },
  };
}
