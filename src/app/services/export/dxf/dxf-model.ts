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

export type DxfEntity = DxfLine | DxfCircle | DxfPointEntity | DxfPolyline | DxfText;

export interface DxfDocument {
  units: DxfUnits;
  layers: DxfLayer[];
  entities: DxfEntity[];
}
