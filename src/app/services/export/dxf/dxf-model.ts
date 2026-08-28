export type DxfUnits = 'in' | 'cm' | 'm';

export interface DxfPoint {
  x: number;
  y: number;
}

export interface DxfLayer {
  name: string;
  /** AutoCAD Color Index. Entities inherit it with BYLAYER. */
  color: number;
}

interface LayeredEntity {
  layer: string;
}

export interface DxfLine extends LayeredEntity {
  type: 'LINE';
  start: DxfPoint;
  end: DxfPoint;
}

export interface DxfCircle extends LayeredEntity {
  type: 'CIRCLE';
  center: DxfPoint;
  radius: number;
}

export interface DxfPointEntity extends LayeredEntity {
  type: 'POINT';
  at: DxfPoint;
}

export interface DxfPolyline extends LayeredEntity {
  type: 'LWPOLYLINE';
  points: DxfPoint[];
  closed: boolean;
}

export interface DxfText extends LayeredEntity {
  type: 'TEXT';
  at: DxfPoint;
  height: number;
  text: string;
  angleDeg?: number;
}

/**
 * An aligned dimension between two points.
 *
 * Written as a real DIMENSION rather than as lines and a label, because that is
 * the difference between a number a reader can see and one CAD will let them
 * drive the model from. The picture lives in an anonymous block, as the format
 * requires: an importer that regenerates dimensions ignores it, and one that
 * does not still has something to draw.
 */
export interface DxfDimension extends LayeredEntity {
  type: 'DIMENSION';
  /** The anonymous block holding the drawn picture, e.g. `*D0`. */
  blockName: string;
  /** Where the dimension line sits. */
  definition: DxfPoint;
  /** The two things being measured between. */
  from: DxfPoint;
  to: DxfPoint;
  /** Middle of the text, and the text itself. */
  textAt: DxfPoint;
  text: string;
}

/** A placed copy of a block -- one object in CAD rather than a heap of lines. */
export interface DxfInsert extends LayeredEntity {
  type: 'INSERT';
  name: string;
  at: DxfPoint;
  scale?: number;
  rotationDeg?: number;
}

export type DxfEntity =
  DxfLine | DxfCircle | DxfPointEntity | DxfPolyline | DxfText | DxfDimension | DxfInsert;

/** A named group of entities, defined once and placed by INSERT. */
export interface DxfBlock {
  name: string;
  /** Where the block's own origin sits; almost always (0, 0). */
  base: DxfPoint;
  entities: DxfEntity[];
}

export interface DxfDocument {
  units: DxfUnits;
  layers: DxfLayer[];
  entities: DxfEntity[];
  /** Reusable symbols and the anonymous blocks dimensions are drawn in. */
  blocks?: DxfBlock[];
  /** `AC1015` unless the reader asked for the older one. */
  version?: 'R2000' | 'R12';
}
