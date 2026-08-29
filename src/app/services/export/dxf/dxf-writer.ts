import { DxfDocument, DxfEntity, DxfPoint } from './dxf-model';

type Pair = readonly [number, string | number];

/**
 * A deterministic ASCII R12 writer for the small 2D subset PMKS emits.
 *
 * R12 (`AC1009`) is the only format written, and that is a decision rather than
 * a limitation. It is the dialect every CAD program, laser cutter and CAM tool
 * still reads, precisely because it predates everything that makes a newer file
 * easy to get wrong: no handles, no subclass markers, no CLASSES section, no
 * OBJECTS dictionary, no owner bookkeeping. What a newer version would have
 * bought here is a units hint, a tidier polyline entity, and real `DIMENSION`
 * entities -- and the importers this export exists for do not turn DXF
 * dimensions into sketch dimensions anyway, so the one substantial feature pays
 * off for nobody. The units hint is carried by the file's name and its notes
 * instead, which the import dialogs make you confirm regardless.
 */
export function writeDxf(document: DxfDocument): string {
  validate(document);
  const bounds = extents(document.entities);
  const pairs: Pair[] = [
    [0, 'SECTION'],
    [2, 'HEADER'],
    [9, '$ACADVER'],
    [1, 'AC1009'],
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
    ...document.entities.flatMap(entityPairs),
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
    // A style for the labels to be written in. Without one, TEXT names a style
    // that the file never defines, and importers substitute whatever they like
    // -- which is how a drawing arrives with its joint names at three times the
    // size of its dimensions.
    [0, 'TABLE'],
    [2, 'STYLE'],
    [70, 1],
    [0, 'STYLE'],
    [2, 'STANDARD'],
    [70, 0],
    [40, 0],
    [41, 1],
    [50, 0],
    [71, 0],
    [42, 0.2],
    [3, 'txt'],
    [4, ''],
    [0, 'ENDTAB'],
    [0, 'ENDSEC'],
  ];
}

function entityPairs(entity: DxfEntity): Pair[] {
  const common: Pair[] = [
    [0, entity.type],
    [8, entity.layer],
  ];
  if (entity.type === 'LINE') {
    return [...common, ...pointPairs(entity.start, 10), ...pointPairs(entity.end, 11)];
  }
  if (entity.type === 'CIRCLE') {
    return [...common, ...pointPairs(entity.center, 10), [40, entity.radius]];
  }
  if (entity.type === 'POLYLINE') {
    // `66` promises the vertices follow; `70` bit 1 closes the loop, which is
    // what makes the run a face an importer can pick rather than an open path.
    return [
      ...common,
      [66, 1],
      [70, entity.closed ? 1 : 0],
      [10, 0],
      [20, 0],
      [30, 0],
      ...entity.points.flatMap((vertex): Pair[] => [
        [0, 'VERTEX'],
        [8, entity.layer],
        [10, vertex.x],
        [20, vertex.y],
        [30, 0],
        ...(vertex.bulge ? ([[42, vertex.bulge]] as Pair[]) : []),
      ]),
      [0, 'SEQEND'],
      [8, entity.layer],
    ];
  }
  return [
    ...common,
    ...pointPairs(entity.at, 10),
    [40, entity.height],
    [1, entity.text.replace(/[\r\n]+/g, ' ')],
    [50, entity.angleDeg ?? 0],
    [7, 'STANDARD'],
  ];
}

function pointPairs(point: DxfPoint, xCode: 10 | 11): Pair[] {
  return [
    [xCode, point.x],
    [xCode + 10, point.y],
    [xCode + 20, 0],
  ];
}

/**
 * Refuse to write a drawing that would open as garbage.
 *
 * A NaN coordinate is silently accepted by most importers and lands the
 * geometry somewhere unrecoverable; an entity on an undeclared layer is a file
 * whose own table does not describe it.
 */
function validate(document: DxfDocument): void {
  const declared = new Set(document.layers.map((layer) => layer.name));
  document.entities.forEach((entity) => {
    if (!declared.has(entity.layer)) {
      throw new Error(`DXF entity on undeclared layer ${entity.layer}`);
    }
    coordinatesOf(entity).forEach((value) => {
      if (!Number.isFinite(value)) {
        throw new Error(`DXF entity with a non-finite coordinate on ${entity.layer}`);
      }
    });
  });
}

function coordinatesOf(entity: DxfEntity): number[] {
  if (entity.type === 'LINE') {
    return [entity.start.x, entity.start.y, entity.end.x, entity.end.y];
  }
  if (entity.type === 'CIRCLE') {
    return [entity.center.x, entity.center.y, entity.radius];
  }
  if (entity.type === 'POLYLINE') {
    return entity.points.flatMap((vertex) => [vertex.x, vertex.y, vertex.bulge ?? 0]);
  }
  return [entity.at.x, entity.at.y, entity.height];
}

function extents(entities: readonly DxfEntity[]): { min: DxfPoint; max: DxfPoint } {
  const xs: number[] = [];
  const ys: number[] = [];
  const add = (x: number, y: number) => {
    xs.push(x);
    ys.push(y);
  };
  entities.forEach((entity) => {
    if (entity.type === 'LINE') {
      add(entity.start.x, entity.start.y);
      add(entity.end.x, entity.end.y);
    } else if (entity.type === 'CIRCLE') {
      add(entity.center.x - entity.radius, entity.center.y - entity.radius);
      add(entity.center.x + entity.radius, entity.center.y + entity.radius);
    } else if (entity.type === 'POLYLINE') {
      // The vertices *and* what the arcs between them sweep past. A bulge
      // reaches outside its own chord by design -- that is what makes it a
      // rounded corner -- so extents taken from the vertices alone stop short
      // of the drawing they claim to bound, and an importer fitting the view
      // to them clips it.
      entity.points.forEach((vertex, index) => {
        add(vertex.x, vertex.y);
        const next = entity.points[(index + 1) % entity.points.length];
        const last = index === entity.points.length - 1;
        if (!vertex.bulge || (last && !entity.closed)) return;
        arcExtremes(vertex, next, vertex.bulge).forEach((at) => add(at.x, at.y));
      });
    } else {
      add(entity.at.x, entity.at.y);
    }
  });
  if (!xs.length) return { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } };
  return {
    min: { x: Math.min(...xs), y: Math.min(...ys) },
    max: { x: Math.max(...xs), y: Math.max(...ys) },
  };
}

/**
 * The points a bulge arc reaches furthest at, exactly.
 *
 * The two ends, plus whichever of the four compass extremes of its circle the
 * arc actually sweeps through -- that is where a curve leaves its own chord
 * behind. Solved rather than sampled: sampling an arc at some step size misses
 * the apex by however much falls between two samples, which is small enough to
 * look right and still leave the header claiming a box the drawing pokes out of.
 */
function arcExtremes(from: DxfPoint, to: DxfPoint, bulge: number): DxfPoint[] {
  const swept = 4 * Math.atan(bulge);
  const chord = Math.hypot(to.x - from.x, to.y - from.y);
  if (!chord || !Number.isFinite(swept) || swept === 0) return [];
  const radius = chord / (2 * Math.sin(Math.abs(swept) / 2));
  const height =
    Math.sqrt(Math.max(0, radius * radius - (chord / 2) ** 2)) *
    Math.sign(Math.cos(swept / 2)) *
    Math.sign(swept);
  const centerX = (from.x + to.x) / 2 - ((to.y - from.y) / chord) * height;
  const centerY = (from.y + to.y) / 2 + ((to.x - from.x) / chord) * height;
  const start = Math.atan2(from.y - centerY, from.x - centerX);
  const found: DxfPoint[] = [];
  for (let quarter = -4; quarter <= 4; quarter++) {
    const at = (quarter * Math.PI) / 2;
    // How far round from the start this compass point lies, in the direction
    // the arc actually turns.
    const along = swept > 0 ? at - start : start - at;
    const turned = ((along % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    if (turned > Math.abs(swept)) continue;
    found.push({ x: centerX + radius * Math.cos(at), y: centerY + radius * Math.sin(at) });
  }
  return found;
}

/** Six decimals, without an exponent: DXF has no notation for `1e-7`. */
function format(value: string | number): string {
  if (typeof value === 'string') return value;
  if (Number.isInteger(value)) return String(value);
  const fixed = value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
  return fixed === '-0' ? '0' : fixed;
}
