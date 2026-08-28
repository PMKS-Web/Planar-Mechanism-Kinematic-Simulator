import { DxfDocument, DxfEntity, DxfPoint } from './dxf-model';

type Pair = readonly [number, string | number];

const UNIT_CODE = { in: 1, cm: 5, m: 6 } as const;

/** A deterministic ASCII R2000 writer for the small portable 2D subset PMKS emits. */
export function writeDxf(document: DxfDocument): string {
  validate(document);
  const bounds = extents(document.entities);
  const pairs: Pair[] = [
    [0, 'SECTION'],
    [2, 'HEADER'],
    [9, '$ACADVER'],
    [1, 'AC1015'],
    [9, '$INSUNITS'],
    [70, UNIT_CODE[document.units]],
    [9, '$EXTMIN'],
    [10, bounds.min.x],
    [20, bounds.min.y],
    [30, 0],
    [9, '$EXTMAX'],
    [10, bounds.max.x],
    [20, bounds.max.y],
    [30, 0],
    [0, 'ENDSEC'],
    ...tablePairs(document),
    [0, 'SECTION'],
    [2, 'ENTITIES'],
    ...document.entities.flatMap((entity, index) => entityPairs(entity, 0x100 + index)),
    [0, 'ENDSEC'],
    [0, 'EOF'],
  ];
  return pairs.map(([code, value]) => `${code}\r\n${format(value)}\r\n`).join('');
}

function tablePairs(document: DxfDocument): Pair[] {
  return [
    [0, 'SECTION'],
    [2, 'TABLES'],
    [0, 'TABLE'],
    [2, 'LTYPE'],
    [70, 1],
    [0, 'LTYPE'],
    [2, 'CONTINUOUS'],
    [70, 0],
    [3, 'Solid line'],
    [72, 65],
    [73, 0],
    [40, 0],
    [0, 'ENDTAB'],
    [0, 'TABLE'],
    [2, 'LAYER'],
    [70, document.layers.length],
    ...document.layers.flatMap((layer): Pair[] => [
      [0, 'LAYER'],
      [2, layer.name],
      [70, 0],
      [62, layer.color],
      [6, 'CONTINUOUS'],
    ]),
    [0, 'ENDTAB'],
    [0, 'ENDSEC'],
  ];
}

function entityPairs(entity: DxfEntity, handle: number): Pair[] {
  const common: Pair[] = [
    [0, entity.type],
    [5, handle.toString(16).toUpperCase()],
    [100, 'AcDbEntity'],
    [8, entity.layer],
  ];
  if (entity.type === 'LINE') {
    return [
      ...common,
      [100, 'AcDbLine'],
      ...pointPairs(entity.start, 10),
      ...pointPairs(entity.end, 11),
    ];
  }
  if (entity.type === 'CIRCLE') {
    return [...common, [100, 'AcDbCircle'], ...pointPairs(entity.center, 10), [40, entity.radius]];
  }
  if (entity.type === 'POINT') {
    return [...common, [100, 'AcDbPoint'], ...pointPairs(entity.at, 10)];
  }
  if (entity.type === 'LWPOLYLINE') {
    return [
      ...common,
      [100, 'AcDbPolyline'],
      [90, entity.points.length],
      [70, entity.closed ? 1 : 0],
      ...entity.points.flatMap((point) => pointPairs(point, 10, false)),
    ];
  }
  return [
    ...common,
    [100, 'AcDbText'],
    ...pointPairs(entity.at, 10),
    [40, entity.height],
    [1, entity.text.replace(/[\r\n]+/g, ' ')],
    [50, entity.angleDeg ?? 0],
  ];
}

function pointPairs(point: DxfPoint, xCode: 10 | 11, includeZ = true): Pair[] {
  const result: Pair[] = [
    [xCode, point.x],
    [xCode + 10, point.y],
  ];
  if (includeZ) result.push([xCode + 20, 0]);
  return result;
}

function validate(document: DxfDocument): void {
  const layers = new Set<string>();
  document.layers.forEach((layer) => {
    if (!layer.name || layers.has(layer.name))
      throw new Error('DXF layers must have unique names.');
    if (!Number.isInteger(layer.color) || layer.color < 1 || layer.color > 255) {
      throw new Error('DXF layer colors must be AutoCAD color indexes from 1 to 255.');
    }
    layers.add(layer.name);
  });
  document.entities.forEach((entity) => {
    if (!layers.has(entity.layer))
      throw new Error(`DXF entity uses missing layer ${entity.layer}.`);
    entityPoints(entity).forEach(assertFinitePoint);
    if (entity.type === 'CIRCLE' && !(entity.radius > 0 && Number.isFinite(entity.radius))) {
      throw new Error('DXF circle radius must be finite and positive.');
    }
    if (entity.type === 'TEXT' && !(entity.height > 0 && Number.isFinite(entity.height))) {
      throw new Error('DXF text height must be finite and positive.');
    }
    if (entity.type === 'LWPOLYLINE' && entity.points.length < 2) {
      throw new Error('DXF polylines need at least two points.');
    }
  });
}

function entityPoints(entity: DxfEntity): DxfPoint[] {
  if (entity.type === 'LINE') return [entity.start, entity.end];
  if (entity.type === 'CIRCLE') return [entity.center];
  if (entity.type === 'LWPOLYLINE') return entity.points;
  return [entity.at];
}

function assertFinitePoint(point: DxfPoint): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error('DXF coordinates must be finite.');
  }
}

function extents(entities: DxfEntity[]): { min: DxfPoint; max: DxfPoint } {
  if (entities.length === 0) return { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } };
  const xs: number[] = [];
  const ys: number[] = [];
  entities.forEach((entity) => {
    entityPoints(entity).forEach((point) => {
      const radius = entity.type === 'CIRCLE' ? entity.radius : 0;
      xs.push(point.x - radius, point.x + radius);
      ys.push(point.y - radius, point.y + radius);
    });
  });
  return {
    min: { x: Math.min(...xs), y: Math.min(...ys) },
    max: { x: Math.max(...xs), y: Math.max(...ys) },
  };
}

function format(value: string | number): string {
  if (typeof value === 'string') return value;
  const rounded = Math.abs(value) < 1e-12 ? 0 : Number(value.toPrecision(12));
  return String(rounded);
}
