import { AttachmentId, BodyId, DriverId, JointId, LimitId } from './body-id';
import { Point, Pose } from './body-frame';
import { ResolvedMass } from './body-properties';
import { JointCoordinate } from './joint-record';

/** All compiled lengths, velocities and loads use SI; angles remain unwrapped radians. */
export interface CompiledBodyGroup {
  readonly id: BodyId;
  readonly fixed: boolean;
  readonly pose: Pose;
  readonly members: ReadonlyMap<BodyId, Pose>;
  readonly mass: ResolvedMass;
  readonly materialMass: ResolvedMass;
}

export interface ConstraintPair {
  readonly groupA: BodyId;
  readonly groupB: BodyId;
  readonly anchorA: Point;
  readonly anchorB: Point;
  readonly axisA: number;
  readonly memberAngleA: number;
  readonly memberAngleB: number;
}

export type BodyRowKind = 'coincidence-x' | 'coincidence-y' | 'lateral' | 'angle' | 'travel';
export interface BodyConstraintRow {
  readonly key: string;
  readonly jointId: JointId;
  readonly kind: BodyRowKind;
  readonly pair: ConstraintPair;
  readonly zero: number;
  readonly commandId?: DriverId;
}

export interface CompiledCoordinate {
  readonly jointId: JointId;
  readonly coordinate: JointCoordinate;
  readonly row: BodyConstraintRow;
}
export interface CompiledBodyDriver {
  readonly id: DriverId;
  readonly row: BodyConstraintRow;
  readonly initial: number;
  readonly speed: number;
}
export interface CompiledBodyLimit {
  readonly id: LimitId;
  readonly row: BodyConstraintRow;
  readonly lower: number;
  readonly upper: number;
}
export interface CompiledAttachment {
  readonly id: AttachmentId;
  readonly bodyId: BodyId;
  readonly groupId: BodyId;
  readonly point: Point;
}
export interface CompiledBodyPartition {
  readonly key: string;
  readonly unknowns: readonly BodyId[];
  readonly boundary: readonly BodyId[];
  readonly materialIds: readonly BodyId[];
  readonly rows: readonly BodyConstraintRow[];
  readonly drivers: readonly CompiledBodyDriver[];
  readonly limits: readonly CompiledBodyLimit[];
}
export interface CompiledBodySystem {
  readonly groups: ReadonlyMap<BodyId, CompiledBodyGroup>;
  readonly groupOf: ReadonlyMap<BodyId, BodyId>;
  readonly attachments: ReadonlyMap<AttachmentId, CompiledAttachment>;
  readonly coordinates: readonly CompiledCoordinate[];
  readonly partitions: readonly CompiledBodyPartition[];
  /** Frame-only constraints still need consistency/drive/limit checks, outside moving partitions. */
  readonly fixedRows: readonly BodyConstraintRow[];
  readonly fixedDrivers: readonly CompiledBodyDriver[];
  readonly fixedLimits: readonly CompiledBodyLimit[];
}
