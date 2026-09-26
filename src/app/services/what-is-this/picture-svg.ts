import { TileFrame, motionOutline } from './picture-layout';

/**
 * One tile of the "What is this?" picture: the live canvas, serialized as a
 * self-contained SVG of the machine and nothing else.
 *
 * The same move as the report's `export/canvas-svg.ts` -- clone the canvas,
 * write each computed style onto the element that had it, frame it -- with
 * four differences the picture cannot do without:
 *
 * - **It copies the four properties Schematic draws with.** `vector-effect`
 *   is what makes a Schematic bar a 3px line at every zoom, `paint-order` is
 *   what puts a joint letter's white halo *behind* the letter, and the two
 *   baselines place the letters. Without them the bars came out as thick as
 *   the reader happened to be zoomed and the letters as white smudges.
 * - **It draws every part at rest.** A picked machine is amber from end to
 *   end, and the reader has usually picked the machine they are asking about.
 *   Its state classes are read as the resting ones while the styles are
 *   copied, and the marks a selection or a pointer adds are left out.
 * - **It keeps the background image when asked**, for tile 0; the report drops
 *   it with the grid it is drawn in.
 * - **It leaves out a link tag that only repeats joint letters** ("ABHKLMNOPQ"):
 *   the joint labels already say it, and a name the author typed is the one
 *   worth the room.
 */

/**
 * The properties that decide what a shape looks like: the report's list, and
 * the four above.
 */
const COPIED = [
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'opacity',
  'filter',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-anchor',
  'letter-spacing',
  'display',
  'visibility',
  'vector-effect',
  'paint-order',
  'dominant-baseline',
  'alignment-baseline',
];

/** Where `none` is a value (an unfilled path, a hidden element) rather than nothing set. */
const NONE_IS_A_VALUE = new Set(['fill', 'stroke', 'display', 'vector-effect']);

/** How each state class a part can wear reads when nobody is pointing at it or has picked it. */
const RESTING = new Map([
  ['joint-selected', 'joint-default'],
  ['joint-pointed', 'joint-default'],
  ['joint-highlight', 'joint-default'],
  ['joint-dragging', 'joint-default'],
  ['link-selected', 'link-default'],
  ['link-pointed', 'link-default'],
  ['link-hovered', 'link-default'],
]);

/**
 * What the canvas draws that is not the machine: the tools, the start ghost,
 * the marks a selection or a pointer adds, and the synthesis layers.
 */
const NOT_THE_MACHINE = [
  '#backgroundImageHandles',
  '#backgroundImageGrips',
  '#startGhostHolder',
  '#startGhostTags',
  '#dragTraceHolder',
  '#selectionHaloHolder',
  '#primitiveSelection',
  '#selectionTransformOverlay',
  '#synthesis',
  '#forceTempHolder',
  '#startForceEndpoint',
  '#endForceEndpoint',
  '.tutorialRing',
  '.jointSelectionRing',
  '.cylinder-selected',
  '.hoverDimension',
  '.snapTarget',
  '.snapRefused',
  '.holdGuide',
  '.cylinder-preview',
  '.com-drag-ring',
];

/** An unnamed link's tag: its joint letters, which the joint labels already say. */
const ID_ONLY = /^[A-Z][A-Z0-9]*$/;

/** The dashed box's ink, the prototype's red. */
const OUTLINE_INK = '#d62828';

export interface PictureSvgOptions {
  frame: TileFrame;
  /**
   * Screen pixels per model unit the tile is drawn at. The frame is measured in
   * that space: a model point (x, y) sits at (x * zoom, -y * zoom).
   */
  zoom: number;
  /** Keep the background image rather than dropping it with the grid it is drawn in. */
  keepBackdrop: boolean;
  /** Tile 0's dashed box round the area the motion tiles show. */
  outline?: ReturnType<typeof motionOutline>;
}

/** The canvas as the picture shows it. Synchronous: it reads the DOM as it stands. */
export function pictureSvg(canvas: SVGSVGElement, options: PictureSvgOptions): string {
  const clone = canvas.cloneNode(true) as SVGSVGElement;
  // Styles first, while the two trees still walk in step.
  inlineRestingStyles(canvas, clone);
  keepOnlyTheMachine(clone, options.keepBackdrop);
  hideIdOnlyTags(clone);
  resolveHrefs(clone);
  zoomViewport(clone, options.zoom);
  frameOn(clone, options.frame);
  if (options.outline) drawOutline(clone, options.outline);
  return new XMLSerializer().serializeToString(clone);
}

/**
 * Set the pan-zoom layer to the picture's own zoom, with no pan.
 *
 * The library writes a zoom to the page on the next animation frame, and the
 * capture has put the reader's view back long before then: the marks are
 * sized for the picture's zoom, but the layer on the page still carries the
 * reader's. It writes both the attribute and the style, so both are set here.
 */
function zoomViewport(root: Element, zoom: number): void {
  const viewport = root.querySelector('.svg-pan-zoom_viewport') as SVGElement | null;
  if (!viewport) return;
  const matrix = `matrix(${zoom},0,0,${zoom},0,0)`;
  viewport.setAttribute('transform', matrix);
  viewport.style.setProperty('transform', matrix);
}

/** Whether a link tag says nothing but the letters of the joints it joins. */
export function isIdOnlyTag(text: string): boolean {
  return ID_ONLY.test(text.trim());
}

/** Drop the tags that only repeat joint letters; keep the names an author typed. */
export function hideIdOnlyTags(root: Element): void {
  root.querySelectorAll('#linkTagHolder text').forEach((text) => {
    if (isIdOnlyTag(text.textContent ?? '')) text.remove();
  });
}

/**
 * Take the paper and the tools off, keeping the background image if asked.
 *
 * The image is drawn inside the grid's own group, so it is lifted out into the
 * grid's place, which is where it sat in the stack: under everything else.
 */
export function keepOnlyTheMachine(root: Element, keepBackdrop: boolean): void {
  const grid = root.querySelector('#backgroundAndGrid');
  const backdrop = keepBackdrop ? grid?.querySelector('#backgroundImageHolder') : null;
  if (grid && backdrop) grid.replaceWith(backdrop);
  else grid?.remove();
  root.querySelectorAll(NOT_THE_MACHINE.join(', ')).forEach((element) => element.remove());
}

/** Tile 0's dashed box, drawn over everything in the canvas's own units. */
function drawOutline(root: SVGSVGElement, outline: ReturnType<typeof motionOutline>): void {
  const rect = root.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', String(outline.x));
  rect.setAttribute('y', String(outline.y));
  rect.setAttribute('width', String(outline.width));
  rect.setAttribute('height', String(outline.height));
  rect.setAttribute('fill', 'none');
  rect.setAttribute('stroke', OUTLINE_INK);
  rect.setAttribute('stroke-width', String(outline.stroke));
  rect.setAttribute('stroke-dasharray', outline.dash);
  root.appendChild(rect);
}

/** The tile's own frame and pixel size, and the namespaces a standalone file needs. */
function frameOn(root: SVGSVGElement, frame: TileFrame): void {
  const { x, y, width, height } = frame.viewBox;
  root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  root.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  root.setAttribute('width', String(frame.width));
  root.setAttribute('height', String(frame.height));
  root.setAttribute('viewBox', `${x} ${y} ${width} ${height}`);
  root.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  root.removeAttribute('id');
  root.removeAttribute('class');
  root.removeAttribute('style');
}

/**
 * Point every referenced file at where it actually is.
 *
 * The ground marks and input arrows are reached with paths relative to the
 * app (`../../../assets/Ground.svg`); the rasterizer swaps these absolute
 * addresses for the files' contents, because an SVG drawn as an image loads
 * nothing from outside itself.
 */
function resolveHrefs(root: Element): void {
  const XLINK = 'http://www.w3.org/1999/xlink';
  [root, ...root.querySelectorAll('*')].forEach((element) => {
    (['href', 'xlink:href'] as const).forEach((name) => {
      const value =
        name === 'href' ? element.getAttribute('href') : element.getAttributeNS(XLINK, 'href');
      if (!value || value.startsWith('#') || value.startsWith('data:')) return;
      const absolute = new URL(value, root.ownerDocument.baseURI).href;
      if (name === 'href') element.setAttribute('href', absolute);
      else element.setAttributeNS(XLINK, 'xlink:href', absolute);
    });
  });
}

/**
 * Write what the stylesheet says onto each element, as though nothing were
 * picked or pointed at.
 *
 * The state classes are swapped for their resting ones on the live elements
 * just for the read, and put back before anything can paint: a class, not
 * app state, because the selection is spread over two services and the
 * panels listen to it.
 */
function inlineRestingStyles(source: Element, clone: Element): void {
  const swapped = putAtRest(source);
  try {
    const from = [source, ...source.querySelectorAll('*')];
    const to = [clone, ...clone.querySelectorAll('*')];
    for (let at = 0; at < from.length && at < to.length; at++) {
      const target = to[at] as SVGElement;
      if (!target.style) continue;
      const computed = getComputedStyle(from[at]);
      COPIED.forEach((property) => {
        const value = computed.getPropertyValue(property);
        if (!value || value === 'normal' || value === 'auto') return;
        if (value === 'none' && !NONE_IS_A_VALUE.has(property)) return;
        target.style.setProperty(property, value);
      });
      target.removeAttribute('pointer-events');
      const swap = swapped.get(from[at]);
      if (swap) target.setAttribute('class', swap.resting);
    }
  } finally {
    swapped.forEach(({ original }, element) => element.setAttribute('class', original));
  }
}

/** Swap every state class under the root for its resting one, and say what was there. */
function putAtRest(root: Element): Map<Element, { original: string; resting: string }> {
  const swapped = new Map<Element, { original: string; resting: string }>();
  root.querySelectorAll('[class]').forEach((element) => {
    const original = element.getAttribute('class') ?? '';
    const resting = restingClass(original);
    if (resting === undefined) return;
    swapped.set(element, { original, resting });
    element.setAttribute('class', resting);
  });
  return swapped;
}

/** A class list with every state class read as its resting one, or undefined when it has none. */
export function restingClass(classes: string): string | undefined {
  const names = classes.split(/\s+/).filter(Boolean);
  if (!names.some((name) => RESTING.has(name))) return undefined;
  return names.map((name) => RESTING.get(name) ?? name).join(' ');
}
