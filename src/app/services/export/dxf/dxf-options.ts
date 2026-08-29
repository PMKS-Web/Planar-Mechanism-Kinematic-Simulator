import { LengthUnit } from '../../../model/unit-enums';

/**
 * What the CAD Export dialog decides, in one place.
 *
 * The screen asks as few questions as it can get away with -- a destination,
 * then four folded sections -- but the file it produces has a decision behind
 * every one of these. They live here rather than on the service so the dialog,
 * the presets and the writer can all name the same thing.
 */

/** Which point of the drawing lands on (0, 0). */
export type DxfOrigin = 'model' | 'ground' | 'center' | 'joint';

/** What is drawn at a joint centre. */
export type DxfJointCircles = 'none' | 'marks' | 'holes';

/**
 * What a link is drawn as.
 *
 * `centerlines` is a picture of the mechanism: one line per link, which is what
 * a reader traces over. `outlines` is the shape of the part -- the same rounded
 * body the canvas draws, as a closed loop with its pin holes already in it, so
 * CAD can pick the face and extrude it. A centreline cannot be extruded, which
 * is the whole difference between a drawing and a part.
 */
export type DxfLinkBodies = 'centerlines' | 'outlines';

/** How link lengths are written down. */
export type DxfDimensionStyle = 'entities' | 'table';

/** The companion file carrying what DXF cannot. */
export type DxfDataFile = 'none' | 'csv' | 'json';

export interface DxfExportOptions {
  fileName?: string;
  /** Overrides the project's unit for this export only. */
  unit?: LengthUnit;

  origin?: DxfOrigin;
  /** Only read when `origin` is `'joint'`. */
  originJointId?: string;
  jointCircles?: DxfJointCircles;
  linkBodies?: DxfLinkBodies;
  /** A plate under the grounded pins, so the assembly has a base to fix. */
  includeGroundPlate?: boolean;
  /**
   * In the export's unit, not model units. Only read for `'holes'`.
   *
   * Unset means "whatever fits the parts" -- half the width the link bodies are
   * being drawn at. A number fixed here could not be right, because the bodies
   * are whatever width the canvas is drawing them at.
   */
  pinDiameter?: number;
  includeDimensions?: boolean;
  dimensionStyle?: DxfDimensionStyle;
  includeTracedPaths?: boolean;
  includeSlotTravel?: boolean;

  perLinkLayers?: boolean;
  includeGroundPoints?: boolean;
  includeKinematicAnnotations?: boolean;
  includeLabels?: boolean;
  includeNotes?: boolean;

  dataFile?: DxfDataFile;
}

export type DxfExportChoices = Required<
  Omit<DxfExportOptions, 'unit' | 'originJointId' | 'pinDiameter'>
> &
  Pick<DxfExportOptions, 'unit' | 'originJointId' | 'pinDiameter'>;

/**
 * The two destinations the dialog offers, and the ten decisions each one makes.
 *
 * Named rather than spelled out at the call site because the dialog's whole
 * argument is that a reader picks one of these and leaves: a preset that had to
 * be assembled from defaults scattered across the screen would not be one.
 */
export const DXF_PRESETS = {
  /**
   * One part per link, ready to model from -- and nothing else.
   *
   * Everything decorative is off. Annotations, dimensions and traced curves are
   * all useful to look at and all land in CAD as extra sketch geometry tangled
   * into the very faces the reader is trying to select and extrude. What is
   * left is the outline, its holes, a layer apiece, a note saying what the file
   * is, and the numbers DXF cannot carry.
   */
  build: {
    origin: 'ground',
    jointCircles: 'holes',
    linkBodies: 'outlines',
    includeGroundPlate: true,
    includeDimensions: false,
    dimensionStyle: 'entities',
    includeTracedPaths: false,
    includeSlotTravel: true,
    perLinkLayers: true,
    includeGroundPoints: true,
    includeKinematicAnnotations: false,
    includeLabels: false,
    includeNotes: true,
    dataFile: 'csv',
  },
  /** Something to trace over, in the coordinates it was drawn in. */
  reference: {
    origin: 'model',
    jointCircles: 'marks',
    linkBodies: 'centerlines',
    includeGroundPlate: false,
    includeDimensions: false,
    dimensionStyle: 'entities',
    includeTracedPaths: true,
    includeSlotTravel: false,
    perLinkLayers: false,
    includeGroundPoints: true,
    includeKinematicAnnotations: true,
    includeLabels: true,
    includeNotes: false,
    dataFile: 'none',
  },
} as const satisfies Record<string, Partial<DxfExportOptions>>;

export type DxfPresetName = keyof typeof DXF_PRESETS;

/**
 * What the builder assumes when it is told nothing.
 *
 * Deliberately the plainest reading of the drawing rather than the useful one:
 * coordinates as drawn, centre marks rather than holes, one centreline layer.
 * The opinion belongs to the screen -- a reader picking "Build parts" is what
 * moves the origin and cuts the holes -- and a primitive that arrived with that
 * opinion baked in would be one every other caller had to argue with.
 */
export const NEUTRAL_DXF_OPTIONS: DxfExportChoices = {
  fileName: 'mechanism',
  origin: 'model',
  jointCircles: 'marks',
  linkBodies: 'centerlines',
  includeGroundPlate: false,
  includeDimensions: false,
  dimensionStyle: 'entities',
  includeTracedPaths: false,
  includeSlotTravel: false,
  perLinkLayers: false,
  includeGroundPoints: false,
  includeKinematicAnnotations: true,
  includeLabels: false,
  includeNotes: false,
  dataFile: 'none',
};

/** Where the dialog starts: the destination most readers are heading for. */
export const DEFAULT_DXF_EXPORT_OPTIONS: DxfExportChoices = {
  ...NEUTRAL_DXF_OPTIONS,
  ...DXF_PRESETS.build,
};
