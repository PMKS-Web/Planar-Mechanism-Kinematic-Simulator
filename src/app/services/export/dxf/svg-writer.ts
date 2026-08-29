import { DxfDocument, DxfEntity, DxfPoint, DxfVertex } from './dxf-model';

/**
 * The same drawing, written as SVG.
 *
 * One document, two writers. Everything the DXF side learned -- closed loops,
 * bulge arcs, a layer per part, holes cut into the profile that carries them --
 * is a property of the document rather than of the format, so SVG gets it for
 * free and the two files are the same drawing by construction rather than by
 * being kept in step.
 *
 * SVG is what a laser cutter, an Illustrator user and a browser all read, and
 * unlike DXF it carries a real physical size: `width` in centimetres against a
 * viewBox in drawing units means the thing prints and cuts at the size it was
 * drawn, with no import dialog to get wrong.
 */
export function writeSvg(document: DxfDocument, units: 'cm' | 'm' | 'in'): string {
  const bounds = extents(document.entities);
  const pad = span(bounds) * 0.02 || 1;
  const minX = bounds.min.x - pad;
  const minY = bounds.min.y - pad;
  const width = bounds.max.x - bounds.min.x + pad * 2;
  const height = bounds.max.y - bounds.min.y + pad * 2;
  // SVG has no metre, so a metric drawing is stated in centimetres. The number
  // changes; the physical size does not.
  const physical =
    units === 'in' ? { per: 1, suffix: 'in' } : { per: units === 'm' ? 100 : 1, suffix: 'cm' };
  const stroke = span(bounds) / 600 || 0.01;
  const byLayer = new Map<string, DxfEntity[]>();
  document.entities.forEach((entity) => {
    byLayer.set(entity.layer, [...(byLayer.get(entity.layer) ?? []), entity]);
  });
  const groups = document.layers
    .filter((layer) => byLayer.has(layer.name))
    .map((layer) => {
      const drawn = byLayer
        .get(layer.name)!
        .map((entity) => shapeOf(entity))
        .join('\n      ');
      // Named as a layer in the two editors that have the idea, and as a plain
      // group everywhere else.
      return (
        `    <g id="${escape(layer.name)}" inkscape:groupmode="layer" ` +
        `inkscape:label="${escape(layer.name)}" stroke="${colourOf(layer.color)}">\n` +
        `      ${drawn}\n    </g>`
      );
    });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"`,
    `     width="${round(width * physical.per)}${physical.suffix}" height="${round(height * physical.per)}${physical.suffix}"`,
    `     viewBox="${round(minX)} ${round(-minY - height)} ${round(width)} ${round(height)}">`,
    '  <title>PMKS+ CAD export</title>',
    // One flip for the whole drawing: SVG counts y downward and every other
    // part of this pipeline counts it up.
    `  <g transform="scale(1,-1)" fill="none" stroke-width="${round(stroke)}" ` +
      'stroke-linecap="round" stroke-linejoin="round">',
    ...groups,
    '  </g>',
    '</svg>',
    '',
  ].join('\n');
}

function shapeOf(entity: DxfEntity): string {
  if (entity.type === 'LINE') {
    return `<line x1="${round(entity.start.x)}" y1="${round(entity.start.y)}" x2="${round(entity.end.x)}" y2="${round(entity.end.y)}"/>`;
  }
  if (entity.type === 'CIRCLE') {
    return `<circle cx="${round(entity.center.x)}" cy="${round(entity.center.y)}" r="${round(entity.radius)}"/>`;
  }
  if (entity.type === 'POLYLINE') {
    return `<path d="${pathOf(entity.points, entity.closed)}"/>`;
  }
  // Flipped back the right way up, since the whole drawing is mirrored in y.
  const at = entity.at;
  return (
    `<text x="${round(at.x)}" y="${round(-at.y)}" transform="scale(1,-1)" ` +
    `font-size="${round(entity.height)}" fill="currentColor" stroke="none" ` +
    `font-family="sans-serif">${escape(entity.text)}</text>`
  );
}

/** A run of vertices as path data, with each bulge turned into an arc. */
function pathOf(points: readonly DxfVertex[], closed: boolean): string {
  if (points.length === 0) return '';
  const parts = [`M${round(points[0].x)} ${round(points[0].y)}`];
  const last = closed ? points.length : points.length - 1;
  for (let index = 0; index < last; index++) {
    const from = points[index];
    const to = points[(index + 1) % points.length];
    if (!from.bulge) {
      parts.push(`L${round(to.x)} ${round(to.y)}`);
      continue;
    }
    const swept = 4 * Math.atan(from.bulge);
    const chord = Math.hypot(to.x - from.x, to.y - from.y);
    const radius = chord / (2 * Math.sin(Math.abs(swept) / 2));
    // `sweep` is 1 for a clockwise turn in SVG's own axes -- which are flipped
    // against the drawing's, so a counter-clockwise bulge comes out as 1.
    const large = Math.abs(swept) > Math.PI ? 1 : 0;
    const sweepFlag = swept > 0 ? 1 : 0;
    parts.push(
      `A${round(radius)} ${round(radius)} 0 ${large} ${sweepFlag} ${round(to.x)} ${round(to.y)}`
    );
  }
  if (closed) parts.push('Z');
  return parts.join(' ');
}

/** The handful of AutoCAD colour indices this export actually uses. */
function colourOf(index: number): string {
  const known: Record<number, string> = {
    1: '#d33',
    2: '#cc0',
    3: '#2a2',
    4: '#0aa',
    5: '#25a',
    6: '#a2a',
    7: '#111',
    8: '#888',
    9: '#bbb',
  };
  return known[index] ?? '#111';
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
      entity.points.forEach((vertex) => add(vertex.x, vertex.y));
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

function span(bounds: { min: DxfPoint; max: DxfPoint }): number {
  return Math.max(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y);
}

function round(value: number): string {
  const fixed = Number(value.toFixed(5));
  return Object.is(fixed, -0) ? '0' : String(fixed);
}

function escape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
