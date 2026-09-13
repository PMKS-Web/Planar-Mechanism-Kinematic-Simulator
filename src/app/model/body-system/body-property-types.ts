import { BodyLoad, GroupMassOverride } from './body-document';
import { AttachmentId, BodyId, ForceId, JointId, AssemblyId } from './body-id';
import { BodyPresentation, MassSpecification } from './material-body';

export type BodyPropertyOperation =
  | {
      readonly kind: 'body-properties';
      readonly bodyId: BodyId;
      readonly change: {
        readonly label?: string;
        readonly presentation?: Partial<BodyPresentation>;
        readonly mass?: Partial<MassSpecification>;
      };
    }
  | {
      readonly kind: 'group-properties';
      readonly members: readonly BodyId[];
      readonly change: {
        readonly label?: string;
        readonly presentation?: Partial<BodyPresentation>;
        readonly mass?: GroupMassOverride | null;
      };
    }
  | {
      readonly kind: 'force-properties';
      readonly forceId: ForceId;
      readonly change: Partial<
        Pick<BodyLoad, 'label' | 'point' | 'vector' | 'frame' | 'couple' | 'presentation'>
      >;
    }
  | { readonly kind: 'force-owner'; readonly forceId: ForceId; readonly bodyId: BodyId }
  | {
      readonly kind: 'attachment-properties';
      readonly attachmentId: AttachmentId;
      readonly change: {
        readonly label?: string;
        readonly trace?: boolean;
        readonly color?: string;
      };
    }
  | {
      readonly kind: 'label';
      readonly target:
        | { readonly kind: 'joint'; readonly id: JointId }
        | { readonly kind: 'assembly'; readonly id: AssemblyId };
      readonly label: string;
    }
  | {
      readonly kind: 'lock';
      readonly targets: readonly (
        | { readonly kind: 'attachment'; readonly id: AttachmentId }
        | { readonly kind: 'force'; readonly id: ForceId }
        | { readonly kind: 'body'; readonly id: BodyId }
      )[];
      readonly locked: boolean;
    }
  | {
      readonly kind: 'hold';
      readonly bodyId: BodyId;
      readonly from: AttachmentId;
      readonly to: AttachmentId;
      readonly dimension: 'length' | 'angle' | null;
      readonly enabled?: boolean;
    };
