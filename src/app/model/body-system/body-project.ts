import { AttachmentId, BodyId, JointId } from './body-id';
import { Point, Pose } from './body-frame';
import { BodyUnits } from './body-units';

/** Display units do not change the units used by physical records. */
export interface BodyProjectSettings {
  readonly angleUnit: 'deg' | 'rad';
  readonly forceUnit: 'N' | 'kgf' | 'lbf';
  readonly gravity: boolean;
  readonly forceAnalysis: 'static' | 'dynamic';
  readonly showMajorGrid: boolean;
  readonly showMinorGrid: boolean;
  readonly showIds: boolean;
  /** Marker length uses document units but never controls physical constraints or mass. */
  readonly objectScale: number;
  /** New drives capture these defaults; existing drives retain their own signed rates. */
  readonly defaultDrive: { readonly angular: number; readonly linear: number };
}

export interface BodySynthesisDesign {
  readonly stage: 'chooser' | 'working';
  readonly length: number;
  readonly reference: 'back' | 'center' | 'front';
  readonly endsOnly: boolean;
  readonly allowDefect: boolean;
  readonly constrain: boolean;
  /** Authored order is the requested traversal order, not a sortable set. Angles are radians. */
  readonly poses: readonly Pose[];
  readonly region: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly generated: {
    readonly bodies: readonly BodyId[];
    readonly joints: readonly JointId[];
    readonly attachments: readonly { readonly id: AttachmentId; readonly at: Point }[];
    readonly partial: boolean;
  };
}

export interface BodyProjectView {
  /** The span covers the shorter usable viewport side, so reopening retains model scale across aspect ratios. */
  readonly camera?: { readonly center: Point; readonly span: number };
  /** Only shipped assets can be shared. Private file data remains local to the editor. */
  readonly backdrop?: {
    readonly asset: string;
    readonly label: string;
    readonly center: Point;
    readonly width: number;
    readonly angle: number;
    readonly opacity: number;
  };
}

export function defaultBodyProjectSettings(units: BodyUnits): BodyProjectSettings {
  return {
    angleUnit: 'deg',
    forceUnit: units.force,
    gravity: true,
    forceAnalysis: 'static',
    showMajorGrid: true,
    showMinorGrid: true,
    showIds: true,
    objectScale: 0.7,
    defaultDrive: { angular: -Math.PI / 6, linear: 5 },
  };
}

export function isShippedBackdropAsset(asset: string): boolean {
  return /^assets\/backdrops\/[a-zA-Z0-9_-]+\.(svg|png|jpg|jpeg|webp)$/.test(asset);
}
