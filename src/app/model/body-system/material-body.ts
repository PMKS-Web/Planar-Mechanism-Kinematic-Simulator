import { AttachmentId, BodyId, VertexId, WORLD } from './body-id';
import { IDENTITY_POSE, Point, Pose } from './body-frame';

export interface GeometryVertex extends Point {
  readonly id: VertexId;
}

export type BodyGeometry =
  | {
      readonly kind: 'bar';
      readonly vertices: readonly [GeometryVertex, GeometryVertex];
      readonly width: number;
    }
  | { readonly kind: 'polygon'; readonly vertices: readonly GeometryVertex[] }
  | { readonly kind: 'circle'; readonly center: Point; readonly radius: number };

export type ScalarProperty = { readonly mode: 'explicit'; readonly value: number };
export type CenterEditAnchor = 'body' | 'grid' | { readonly attachmentId: AttachmentId };

export interface MassSpecification {
  readonly mass: ScalarProperty | { readonly mode: 'density'; readonly value: number };
  readonly inertia: ScalarProperty | { readonly mode: 'automatic' };
  readonly center:
    | { readonly mode: 'automatic' }
    | {
        readonly mode: 'explicit';
        readonly point: Point;
        readonly editAnchor: CenterEditAnchor;
        /** Stable geometry direction for centroid-relative deformation, independent of array order. */
        readonly editAxis?: readonly [VertexId, VertexId];
      };
}

export interface BodyPresentation {
  readonly fill: string;
  readonly outline?: 'geometry' | 'circle';
  readonly hidden: boolean;
  readonly showCenter: boolean;
}

export interface MaterialBody {
  readonly kind: 'material';
  readonly id: BodyId;
  readonly label: string;
  readonly pose: Pose;
  readonly geometry: BodyGeometry;
  /** An edit lock freezes material placement even when the body has only one attachment. */
  readonly locked?: boolean;
  readonly mass: MassSpecification;
  readonly presentation: BodyPresentation;
}

export interface WorldBody {
  readonly kind: 'world';
  readonly id: typeof WORLD;
  readonly pose: typeof IDENTITY_POSE;
}

export type Body = MaterialBody | WorldBody;
export const WORLD_BODY: WorldBody = Object.freeze({
  kind: 'world',
  id: WORLD,
  pose: IDENTITY_POSE,
});
