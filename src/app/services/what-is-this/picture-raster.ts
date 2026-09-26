import { SHEET_COLORS, sheetLayout } from './picture-layout';

/**
 * The picture's tiles drawn to pixels and laid out on one PNG.
 *
 * Asynchronous, and run after the capture on purpose: the capture has to finish
 * inside one task so the reader never sees a pose it passes through, and
 * nothing here touches the canvas or the mechanism, so it can take its time.
 */

/** One tile as the capture left it: an SVG, its pixel size, and the line written above it. */
export interface PictureTile {
  svg: string;
  width: number;
  height: number;
  label: string;
}

/** Any `href` a serialized SVG carries, with the address in group 1. */
const HREF = /\b((?:xlink:)?href)="([^"]*)"/g;

/**
 * Write every file a tile points at into the tile itself.
 *
 * An SVG drawn through an image loads nothing from outside itself, so a ground
 * mark or an input arrow left as an address draws as nothing at all. Each file
 * is fetched once per cache, which the caller keeps across pictures: the marks
 * are the same few assets every time.
 */
export async function embedReferencedFiles(
  svg: string,
  cache: Map<string, Promise<string | undefined>>
): Promise<string> {
  const addresses = new Set<string>();
  for (const [, , address] of svg.matchAll(HREF)) {
    if (address.startsWith('#') || address.startsWith('data:')) continue;
    addresses.add(address);
  }
  const contents = new Map<string, string | undefined>();
  await Promise.all(
    [...addresses].map(async (address) => {
      const url = unescapeXml(address);
      if (!cache.has(url)) cache.set(url, dataUrlOf(url));
      contents.set(address, await cache.get(url));
    })
  );
  return svg.replace(HREF, (whole, name: string, address: string) => {
    const inline = contents.get(address);
    return inline ? `${name}="${escapeXml(inline)}"` : whole;
  });
}

/** The tiles on one sheet, as a base64 PNG with no `data:` prefix. */
export async function renderSheet(tiles: readonly PictureTile[]): Promise<string> {
  const pictures = await Promise.all(tiles.map(rasterize));
  const layout = sheetLayout(tiles);
  const sheet = document.createElement('canvas');
  sheet.width = layout.width;
  sheet.height = layout.height;
  const ink = sheet.getContext('2d');
  if (!ink) throw new Error('No 2D context to draw the picture on');
  ink.fillStyle = SHEET_COLORS.page;
  ink.fillRect(0, 0, layout.width, layout.height);
  ink.font = `bold ${layout.fontSize}px Arial, Helvetica, sans-serif`;
  ink.textBaseline = 'alphabetic';
  ink.imageSmoothingEnabled = true;
  ink.imageSmoothingQuality = 'high';
  layout.cells.forEach((cell, i) => {
    ink.fillStyle = SHEET_COLORS.well;
    ink.fillRect(cell.head.x, cell.head.y, cell.head.width, cell.head.height);
    ink.fillRect(cell.well.x, cell.well.y, cell.well.width, cell.well.height);
    // Pillow places text by the top of the font's ascender; a canvas by its
    // baseline. The font's own ascent is the distance between the two.
    const label = tiles[i].label;
    const ascent = ink.measureText(label).fontBoundingBoxAscent || layout.fontSize * 0.905;
    ink.fillStyle = SHEET_COLORS.ink;
    ink.fillText(label, cell.text.x, cell.text.y + ascent);
    const { x, y, width, height } = cell.image;
    ink.drawImage(pictures[i], x, y, width, height);
  });
  return sheet.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
}

/**
 * One tile at the size it was framed at, on white.
 *
 * Drawn at that size and only then scaled onto the sheet, as the prototype's
 * screenshots were: a Schematic bar is a 3px line in the tile, whatever the
 * sheet then does to it. Drawing the SVG straight at the smaller size would
 * keep it 3px there and thicken every line the model was shown.
 */
async function rasterize(tile: PictureTile): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(new Blob([tile.svg], { type: 'image/svg+xml' }));
  try {
    const image = await loaded(url);
    const canvas = document.createElement('canvas');
    canvas.width = tile.width;
    canvas.height = tile.height;
    const ink = canvas.getContext('2d');
    if (!ink) throw new Error('No 2D context to draw a tile on');
    ink.fillStyle = SHEET_COLORS.well;
    ink.fillRect(0, 0, tile.width, tile.height);
    ink.drawImage(image, 0, 0, tile.width, tile.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loaded(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('A tile of the picture did not draw'));
    image.src = src;
  });
}

async function dataUrlOf(url: string): Promise<string | undefined> {
  try {
    const response = await fetch(url);
    if (!response.ok) return undefined;
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : undefined);
      reader.onerror = () => resolve(undefined);
      reader.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}

function unescapeXml(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
