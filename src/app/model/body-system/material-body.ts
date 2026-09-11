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
