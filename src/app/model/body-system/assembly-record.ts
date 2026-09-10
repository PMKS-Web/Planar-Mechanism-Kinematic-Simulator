import { AssemblyId, AttachmentId, BodyId, JointId, LimitId } from './body-id';

export interface CylinderAssembly {
  readonly id: AssemblyId;
  readonly kind: 'cylinder';
  readonly label: string;
  readonly barrel: BodyId;
  readonly rod: BodyId;
  readonly internalJoint: JointId;
  readonly barrelMount: AttachmentId;
  readonly rodMount: AttachmentId;
  readonly strokeLimit: LimitId;
  readonly dimensions: {
    readonly barrelLength: number;
    readonly rodLength: number;
    readonly bore: number;
    readonly rodDiameter: number;
  };
}
