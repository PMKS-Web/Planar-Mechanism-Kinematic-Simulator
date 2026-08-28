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

/** How link lengths are written down. */
export type DxfDimensionStyle = 'entities' | 'table';

/** The companion file carrying what DXF cannot. */
export type DxfDataFile = 'none' | 'csv' | 'json';

/** Which DXF the file claims to be. */
export type DxfVersion = 'R2000' | 'R12';

export interface DxfExportOptions {
  fileName?: string;
  /** Overrides the project's unit for this export only. */
  unit?: LengthUnit;
  version?: DxfVersion;

  origin?: DxfOrigin;
  /** Only read when `origin` is `'joint'`. */
  originJointId?: string;
  jointCircles?: DxfJointCircles;
  /** In the export's unit, not model units. Only read for `'holes'`. */
  pinDiameter?: number;
  includeDimensions?: boolean;
  dimensionStyle?: DxfDimensionStyle;
  includeTracedPaths?: boolean;
  includeSlotTravel?: boolean;

  perLinkLayers?: boolean;
  includeGroundPoints?: boolean;
  includeKinematicAnnotations?: boolean;
  includeForces?: boolean;
  includeConstruction?: boolean;
  includeLabels?: boolean;
  includeNotes?: boolean;

  dataFile?: DxfDataFile;
}

export type DxfExportChoices = Required<Omit<DxfExportOptions, 'unit' | 'originJointId'>> &
  Pick<DxfExportOptions, 'unit' | 'originJointId'>;

/**
 * The two destinations the dialog offers, and the ten decisions each one makes.
 *
 * Named rather than spelled out at the call site because the dialog's whole
 * argument is that a reader picks one of these and leaves: a preset that had to
 * be assembled from defaults scattered across the screen would not be one.
 */
export const DXF_PRESETS = {
  /** One part per link, ready to model from. */
  build: {
    origin: 'ground',
    jointCircles: 'holes',
    includeDimensions: true,
    dimensionStyle: 'entities',
    includeTracedPaths: true,
    includeSlotTravel: true,
    perLinkLayers: true,
    includeGroundPoints: true,
    includeKinematicAnnotations: true,
    includeForces: false,
    includeConstruction: true,
    includeLabels: false,
    includeNotes: true,
    dataFile: 'csv',
  },
  /** Something to trace over, in the coordinates it was drawn in. */
  reference: {
    origin: 'model',
    jointCircles: 'marks',
    includeDimensions: false,
    dimensionStyle: 'entities',
    includeTracedPaths: true,
    includeSlotTravel: false,
    perLinkLayers: false,
    includeGroundPoints: true,
    includeKinematicAnnotations: false,
    includeForces: false,
    includeConstruction: false,
    includeLabels: false,
    includeNotes: false,
    dataFile: 'none',
  },
} as const satisfies Record<string, Partial<DxfExportOptions>>;

export type DxfPresetName = keyof typeof DXF_PRESETS;

export const DEFAULT_DXF_EXPORT_OPTIONS: DxfExportChoices = {
  fileName: 'mechanism',
  version: 'R2000',
  pinDiameter: 0.6,
  ...DXF_PRESETS.build,
};
