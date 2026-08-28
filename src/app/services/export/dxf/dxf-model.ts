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

/**
 * A vertex of a polyline, and how the run to the next one curves.
 *
 * `bulge` is the tangent of a quarter of the arc's included angle, signed
 * counter-clockwise -- zero, and absent, for a straight run. It is how a
 * rounded outline survives as one closed loop that CAD can pick and extrude,
 * rather than as a heap of separate lines and arcs somebody has to stitch.
 */
export interface DxfVertex extends DxfPoint {
  bulge?: number;
}

export interface DxfPolyline extends LayeredEntity {
  type: 'POLYLINE';
  points: DxfVertex[];
  closed: boolean;
}

export interface DxfText extends LayeredEntity {
  type: 'TEXT';
  at: DxfPoint;
  height: number;
  text: string;
  angleDeg?: number;
}

export type DxfEntity = DxfLine | DxfCircle | DxfPointEntity | DxfPolyline | DxfText;

export interface DxfDocument {
  layers: DxfLayer[];
  entities: DxfEntity[];
}
