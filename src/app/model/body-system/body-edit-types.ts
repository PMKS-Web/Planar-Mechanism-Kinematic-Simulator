import { EditRefusal, EditState } from '../edit-permission';
import { BodyDocument } from './body-document';
import {
  AssemblyId,
  AttachmentId,
  BodyId,
  ForceId,
  JointId,
  JunctionId,
  DriverId,
  LimitId,
} from './body-id';
import { Point } from './body-frame';
import { BodyJoint } from './joint-record';
import { DocumentIssue } from './body-validation';

export type BodySelectionRef =
  | { readonly kind: 'body'; readonly id: BodyId }
  | { readonly kind: 'joint'; readonly id: JointId }
  | { readonly kind: 'attachment'; readonly id: AttachmentId }
  | { readonly kind: 'force'; readonly id: ForceId }
  | { readonly kind: 'assembly'; readonly id: AssemblyId }
  | { readonly kind: 'junction'; readonly id: JunctionId }
  | { readonly kind: 'group'; readonly members: readonly BodyId[] };
export type BodyDeleteTarget = BodySelectionRef;
export type BodyInsertRecords = Partial<
  Pick<
    BodyDocument,
    | 'bodies'
    | 'attachments'
    | 'joints'
    | 'junctions'
    | 'assemblies'
    | 'drivers'
    | 'limits'
    | 'forces'
    | 'groups'
    | 'holds'
    | 'locks'
  >
>;
export type BodyEditOperation =
  | { readonly kind: 'insert'; readonly records: BodyInsertRecords }
  | { readonly kind: 'delete'; readonly targets: readonly BodyDeleteTarget[] }
  | {
      readonly kind: 'joint-kind';
      readonly jointId: JointId;
      readonly jointKind: BodyJoint['kind'];
      readonly worldAxis?: number;
      readonly worldPoint?: Point;
      readonly removeCoordinates?: boolean;
    }
  | { readonly kind: 'reset-group-mass'; readonly member: BodyId };
export interface BodyEditCommand {
  /** Allocated once by the gesture. Pure planning derives any replacement record IDs from it. */
  readonly id: string;
  readonly operations: readonly BodyEditOperation[];
  readonly targetGroupMember?: BodyId;
}
export interface BodyEditContext {
  readonly state: EditState;
  readonly selection: readonly BodySelectionRef[];
}
export type BodyEditCode =
  | 'permission'
  | 'invalid-document'
  | 'missing-target'
  | 'immutable-world'
  | 'assembly-member'
  | 'assembly-interior'
  | 'coordinate-in-use'
  | 'aggregate-properties'
  | 'ambiguous-load-owner'
  | 'invalid-command'
  | 'connection-point'
  | 'drive-in-rigid-group';
export interface BodyEditRefusal {
  readonly ok: false;
  readonly code: BodyEditCode;
  readonly message: string;
  readonly targets: readonly BodySelectionRef[];
  readonly issues?: readonly DocumentIssue[];
  readonly permission?: EditRefusal;
}
export type BodyRecordRef =
  | BodySelectionRef
  | { readonly kind: 'driver'; readonly id: DriverId }
  | { readonly kind: 'limit'; readonly id: LimitId }
  | { readonly kind: 'lock'; readonly id: AttachmentId }
  | {
      readonly kind: 'hold';
      readonly bodyId: BodyId;
      readonly from: AttachmentId;
      readonly to: AttachmentId;
    };
export interface BodyEditEffects {
  readonly added: readonly BodyRecordRef[];
  readonly removed: readonly BodyRecordRef[];
  readonly changed: readonly BodyRecordRef[];
  readonly invalidatedBodies: readonly BodyId[];
  readonly invalidatedPartitions: readonly string[];
}
export interface BodyEditPlan {
  readonly ok: true;
  readonly baseRevision: number;
  readonly command: BodyEditCommand;
  readonly document: BodyDocument;
  readonly changed: boolean;
  readonly effects: BodyEditEffects;
  readonly selection: readonly BodySelectionRef[];
}
export type BodyEditResult = BodyEditPlan | BodyEditRefusal;
