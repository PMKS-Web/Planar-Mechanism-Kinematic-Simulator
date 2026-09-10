import { AttachmentId, BodyId, DriverId, ForceId, LimitId } from './body-id';
import { Point, Pose } from './body-frame';
import { Body, BodyPresentation, WORLD_BODY } from './material-body';
import { Attachment, BodyJoint, JointCoordinateRef, PinJunction } from './joint-record';
import { CylinderAssembly } from './assembly-record';
import { BodyUnits, SI_UNITS } from './body-units';

export interface BodyDriver {
  readonly id: DriverId;
  readonly coordinate: JointCoordinateRef;
  readonly profile: {
    readonly kind: 'constant-speed';
    readonly initial: number;
    readonly speed: number;
  };
}

export interface CoordinateLimit {
  readonly id: LimitId;
  readonly coordinate: JointCoordinateRef;
  readonly lower: number;
  readonly upper: number;
}

export interface LegacyLoadScope {
  /** Frozen material frames relative to the load's reference body, in document units. */
  readonly members: readonly { readonly bodyId: BodyId; readonly poseInReference: Pose }[];
}

export interface BodyLoad {
  readonly id: ForceId;
  readonly bodyId: BodyId;
  readonly point: Point;
  readonly label: string;
  readonly frame: 'world' | 'body';
  readonly vector: Point;
  readonly couple: number;
  /** Import-only ambiguity is retained until the author chooses a material owner. */
  readonly legacyGroupScope?: LegacyLoadScope;
}

export interface GroupAnnotation {
  readonly members: readonly BodyId[];
  readonly frameBody: BodyId;
  readonly label?: string;
  readonly presentation?: BodyPresentation;
  readonly mass?: GroupMassOverride;
}

/** Missing fields retain member-derived values; aggregate overrides never become member values. */
export interface GroupMassOverride {
  readonly mass?: number;
  readonly inertia?: number;
  readonly center?: { readonly point: Point; readonly editAnchor: 'body' | 'grid' };
}

export interface BodyHold {
  readonly bodyId: BodyId;
  readonly from: AttachmentId;
  readonly to: AttachmentId;
  readonly length?: number;
  readonly angle?: number;
}

export interface BodyDocument {
  readonly version: 2;
  readonly units: BodyUnits;
  readonly bodies: readonly Body[];
  readonly attachments: readonly Attachment[];
  readonly joints: readonly BodyJoint[];
  readonly junctions: readonly PinJunction[];
  readonly assemblies: readonly CylinderAssembly[];
  readonly drivers: readonly BodyDriver[];
  readonly limits: readonly CoordinateLimit[];
  readonly forces: readonly BodyLoad[];
  readonly groups: readonly GroupAnnotation[];
  readonly holds: readonly BodyHold[];
  readonly locks: readonly AttachmentId[];
}

export function emptyBodyDocument(units: BodyUnits = SI_UNITS): BodyDocument {
  return {
    version: 2,
    units,
    bodies: [WORLD_BODY],
    attachments: [],
    joints: [],
    junctions: [],
    assemblies: [],
    drivers: [],
    limits: [],
    forces: [],
    groups: [],
    holds: [],
    locks: [],
  };
}
