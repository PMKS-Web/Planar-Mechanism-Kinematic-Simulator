/**
 * Where each tile of the "What is this?" picture is cut from the canvas, and
 * where it lands on the one sheet the model is sent.
 *
 * Every number here is the prototype's (`prototype/what-is-this/run/schematic.mjs`),
 * because its sheets are what the model's answers were evaluated on: a 960 by
 * 700 window with the machine's whole cycle zoomed to fill it less 44 pixels
 * of margin, then a Pillow tiler laying the tiles three wide, each under a bold
 * label on a white strip, on a gray page. Arithmetic only, so a spec can hold
 * it to those numbers without a browser.
 */

/** The window each tile was drawn in, and the margin kept round the mechanism. */
export const CAPTURE = { width: 960, height: 700, pad: 44 } as const;

/** A rectangle by its edges. */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** One tile: which part of the canvas it shows, and how many pixels that part is drawn in. */
export interface TileFrame {
  /** The part shown, in the canvas's own units: CSS pixels of the reader's view. */
  viewBox: { x: number; y: number; width: number; height: number };
  /** The tile in raster pixels, as the prototype's screenshot clip was. */
  width: number;
  height: number;
  /** Raster pixels per canvas unit: how much larger the tile draws than the reader's view. */
  scale: number;
}

/**
 * The prototype's zoom-to-fill: the box fills the window less its margin on the
 * tighter axis, and the tile is the box with that margin round it.
 *
 * A box with no width or height is taken as one unit across, as the prototype
 * took it, so a machine whose joints all share a line still gets a frame.
 */
export function tileFrame(box: Box): TileFrame {
  const across = Math.max(box.x1 - box.x0, 1);
  const down = Math.max(box.y1 - box.y0, 1);
  const scale = Math.min(
    (CAPTURE.width - 2 * CAPTURE.pad) / across,
    (CAPTURE.height - 2 * CAPTURE.pad) / down
  );
  const width = Math.round(across * scale + 2 * CAPTURE.pad);
  const height = Math.round(down * scale + 2 * CAPTURE.pad);
  // The view is taken from the rounded size, so the tile is never stretched to
  // fit a width the box did not quite have.
  const viewWidth = width / scale;
  const viewHeight = height / scale;
  return {
    viewBox: {
      x: (box.x0 + box.x1) / 2 - viewWidth / 2,
      y: (box.y0 + box.y1) / 2 - viewHeight / 2,
      width: viewWidth,
      height: viewHeight,
    },
    width,
    height,
    scale,
  };
}

/** The smallest box holding every point, or undefined for none. */
export function boxAround(points: Iterable<{ x: number; y: number }>): Box | undefined {
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const { x, y } of points) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    box.x0 = Math.min(box.x0, x);
    box.y0 = Math.min(box.y0, y);
    box.x1 = Math.max(box.x1, x);
    box.y1 = Math.max(box.y1, y);
  }
  return Number.isFinite(box.x0) ? box : undefined;
}

/**
 * The dashed box tile 0 draws round the area the motion tiles show, in canvas
 * units, with its stroke measured in tile 0's own pixels.
 *
 * The prototype drew it as a 3px dashed CSS border laid over the screenshot,
 * which sits just outside the box it outlines; the rectangle is grown by half
 * a stroke so this one does too. Dashes of six pixels with three between are
 * what Chrome drew for that border.
 */
export function motionOutline(
  motion: TileFrame,
  overview: TileFrame
): { x: number; y: number; width: number; height: number; stroke: number; dash: string } {
  const px = 1 / overview.scale;
  const grow = 1.5 * px;
  return {
    x: motion.viewBox.x - grow,
    y: motion.viewBox.y - grow,
    width: motion.viewBox.width + 2 * grow,
    height: motion.viewBox.height + 2 * grow,
    stroke: 3 * px,
    dash: `${6 * px} ${3 * px}`,
  };
}

/** The label strip above each tile, in the prototype's words and spacing. */
export function tileLabels(moments: readonly { label: string }[], withBackdrop: boolean): string[] {
  const numbered = moments.map((moment, i) => `${i + 1}   ${moment.label}`);
  if (!withBackdrop) return numbered;
  const tiles = moments.length === 1 ? 'tile 1' : `tiles 1-${moments.length}`;
  return [`0   background image; dashed box = area of ${tiles}`, ...numbered];
}

/** Where one tile goes on the sheet. */
export interface SheetCell {
  /** The white strip the label is written on, and where the text starts. */
  head: { x: number; y: number; width: number; height: number };
  text: { x: number; y: number };
  /** The white area the tile sits in. */
  well: { x: number; y: number; width: number; height: number };
  /** The tile itself, scaled to fit the well and centered in it. */
  image: { x: number; y: number; width: number; height: number };
}

export interface SheetLayout {
  width: number;
  height: number;
  columns: number;
  fontSize: number;
  cells: SheetCell[];
}

/** The page behind the tiles, and the ink the labels are written in. */
export const SHEET_COLORS = { page: 'rgb(214, 217, 225)', well: '#ffffff', ink: 'rgb(30, 30, 30)' };

/**
 * The prototype's tiler, line for line: three columns from five tiles up (two
 * below, one alone), each column a fixed width, and every row as tall as the
 * tallest tile once it is narrowed to that width. Python's `int()` and `//`
 * truncate, so these floor.
 */
export function sheetLayout(tiles: readonly { width: number; height: number }[]): SheetLayout {
  const count = tiles.length;
  const columns = count >= 5 ? 3 : Math.min(2, count);
  const width = ({ 1: 960, 2: 640, 3: 520 } as Record<number, number>)[columns] ?? 960;
  const height = Math.floor(
    Math.max(0, ...tiles.map((tile) => tile.height * Math.min(1, width / tile.width)))
  );
  const head = 34;
  const gap = 10;
  const rows = Math.ceil(count / Math.max(columns, 1));
  const cells = tiles.map((tile, i) => {
    const row = Math.floor(i / columns);
    const column = i % columns;
    const x = gap + column * (width + gap);
    const y = gap + row * (height + head + gap);
    const fit = Math.min(width / tile.width, height / tile.height);
    const fittedWidth = Math.max(1, Math.floor(tile.width * fit));
    const fittedHeight = Math.max(1, Math.floor(tile.height * fit));
    return {
      head: { x, y, width, height: head },
      text: { x: x + 10, y: y + 6 },
      well: { x, y: y + head, width, height },
      image: {
        x: x + Math.floor((width - fittedWidth) / 2),
        y: y + head + Math.floor((height - fittedHeight) / 2),
        width: fittedWidth,
        height: fittedHeight,
      },
    };
  });
  return {
    width: columns * width + (columns + 1) * gap,
    height: rows * (height + head) + (rows + 1) * gap,
    columns,
    fontSize: columns === 3 ? 17 : 20,
    cells,
  };
}
