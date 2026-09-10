import { AttachmentId, BodyId, JointId, JunctionId, VertexId } from './body-id';
import { Point, Pose } from './body-frame';

export interface Attachment {
  readonly id: AttachmentId;
  readonly bodyId: BodyId;
  readonly point: Point;
  readonly label: string;
  readonly trace: boolean;
  readonly vertexId?: VertexId;
}

export interface JointFrame {
  readonly attachmentId: AttachmentId;
  readonly angle: number;
}

interface JointPair {
  readonly id: JointId;
  readonly label: string;
  readonly bodyA: BodyId;
  readonly bodyB: BodyId;
  readonly frameA: JointFrame;
  readonly frameB: JointFrame;
}

export interface RevoluteJoint extends JointPair {
  readonly kind: 'revolute';
  readonly angleZero: number;
}

export interface GuidedJoint extends JointPair {
  readonly kind: 'prismatic' | 'pin-in-slot';
  /** Captured body B minus body A angle, not an inferred direction between pins. */
  readonly angleZero: number;
  readonly travelZero: number;
  readonly guideDisplay?: {
    readonly bodyId: BodyId;
    readonly frame: JointFrame;
    readonly from: number;
    readonly to: number;
  };
}

export interface WeldJoint extends JointPair {
  readonly kind: 'weld';
  readonly rest: Pose;
}

export type BodyJoint = RevoluteJoint | GuidedJoint | WeldJoint;
export type JointCoordinate = 'angle' | 'travel';
export interface JointCoordinateRef {
  readonly jointId: JointId;
  readonly coordinate: JointCoordinate;
}

export interface PinJunction {
  readonly id: JunctionId;
  readonly hub: AttachmentId;
  readonly attachments: readonly AttachmentId[];
  readonly joints: readonly JointId[];
}

export function hasCoordinate(joint: BodyJoint, coordinate: JointCoordinate): boolean {
  return coordinate === 'angle'
    ? joint.kind === 'revolute' || joint.kind === 'pin-in-slot'
    : joint.kind === 'prismatic' || joint.kind === 'pin-in-slot';
}
