import type { Vector2 } from './loads';
import type { StructuralProperties } from './structural-properties';

export interface MassProperties {
  readonly massKg: number;
  readonly centerOfMassM: Vector2;
  readonly inertiaKgM2: number;
}

export interface StructuralBody {
  readonly id: string;
  readonly jointIds: readonly string[];
  /** First pin is the local origin; first -> second is the local +x axis. */
  readonly frameJointIds: readonly [string, string];
  readonly massProperties?: MassProperties;
  readonly structural?: StructuralProperties;
}

export interface StructuralJoint {
  readonly id: string;
  readonly kind: 'revolute';
  readonly positionM: Vector2;
  readonly grounded: boolean;
}

export interface HoldingDriver {
  readonly jointId: string;
  readonly linkId: string;
}

/** A supplied, solved pose, in SI and y-up coordinates. No mutable PMKS objects. */
export interface StructuralConfiguration {
  readonly bodies: readonly StructuralBody[];
  readonly joints: readonly StructuralJoint[];
  /** A grounded pin holding the named moving body; never inferred from speed. */
  readonly drivers: readonly HoldingDriver[];
}
