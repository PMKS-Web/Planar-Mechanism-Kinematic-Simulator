/**
 * Velocity, acceleration and force, drawn on the mechanism itself.
 *
 * A graph answers "how big is this at each instant"; a vector trace answers
 * "which way does it point, and where". The two are the same numbers — this
 * module and the analysis graphs both read `AnalysisSampleService` — but a
 * reader trying to see why a coupler point slows at the top of its stroke is
 * asking about direction, and a curve of magnitude against time cannot show it.
 *
 * A leaf module: pure arithmetic and a palette, no imports. The caller hands
 * in two closures — where the part is at a sample, and what the quantity reads
 * there — so the service graph stays on the service side of the line.
 */

/** The three things a part can have drawn on it. */
export type VectorQuantity = 'velocity' | 'acceleration' | 'force';

/** A point and the vector leaving it, both in internal model units. */
export interface VectorArrow {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

/**
 * How many arrows a whole cycle gets.
 *
 * Not one per solved sample: a cycle is 360 of them and 360 arrows on a path
 * is a black thicket with a curve somewhere inside it. Two dozen is enough for
 * the field to read as a field — the turn of the arrows around the path is
 * visible, and every one of them is far enough from its neighbours to be read
 * on its own.
 */
export const PATH_ARROW_COUNT = 24;

/**
 * The longest arrow of a cycle, as a fraction of what the machine sweeps.
 *
 * Velocity is a length per second, acceleration a length per second squared
 * and a force is not a length at all, so none of the three has a size on the
 * drawing until one is chosen. Each is normalised against its own largest
 * value over the cycle and that largest one is drawn this long, which makes
 * every arrow in a trace readable as a fraction of the biggest — and keeps the
 * three from being drawn at wildly different sizes on the same picture.
 */
export const LONGEST_ARROW_FRACTION = 0.12;

/** What each quantity is drawn in. None of it a link, joint or force colour. */
export const VECTOR_INK: Record<VectorQuantity, string> = {
  velocity: '#2e7d32',
  acceleration: '#6a1b9a',
  force: '#c62828',
};

/** The switch's label, in the menu and anywhere else that names one. */
export const VECTOR_LABEL: Record<VectorQuantity, string> = {
  velocity: 'Velocity Vectors',
  acceleration: 'Acceleration Vectors',
  force: 'Force Vectors',
};

/** Material Icons ligatures — the classic set, which is the one loaded. */
export const VECTOR_ICON: Record<VectorQuantity, string> = {
  velocity: 'call_made',
  acceleration: 'double_arrow',
  // Two arrows meeting: a reaction is what a joint pushes back with.
  force: 'compare_arrows',
};

/** Why a part will not take one, in three or four words and a sentence. */
export interface VectorTraceRefusal {
  short: string;
  long: string;
}

/** One part's whole cycle, ready for the canvas. */
export interface DrawnVectorTrace {
  key: string;
  quantity: VectorQuantity;
  ink: string;
  /** Every path arrow, as one `d`. */
  d: string;
}

/** The one arrow at the pose on screen, drawn heavier than the path's. */
export interface LiveVectorArrow {
  key: string;
  ink: string;
  /** The tail, so the canvas can put a dot on it. */
  x: number;
  y: number;
  d: string;
}

/**
 * The plane part of a solved sample, or nothing where it did not solve.
 *
 * `AnalysisSampleService` answers in the order a graph plots -- x, y, and the
 * magnitude where one is plotted -- and returns NaNs rather than dropping a
 * sample, so that a curve keeps a gap in the right place. An arrow has no way
 * to draw a gap; it is simply not drawn.
 */
export function planar(values: number[]): { x: number; y: number } | undefined {
  if (values.length < 2) return undefined;
  const [x, y] = values;
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
}

/** One SVG path holding every arrow given to it: shaft, then two barbs. */
export function arrowPath(arrows: VectorArrow[]): string {
  return arrows
    .map(oneArrow)
    .filter((piece) => piece !== '')
    .join(' ');
}

/** The head is a fraction of the shaft, so a short arrow still reads as one. */
const HEAD_LENGTH_FRACTION = 0.26;
const HEAD_HALF_WIDTH_FRACTION = 0.42;

function oneArrow({ x, y, dx, dy }: VectorArrow): string {
  const length = Math.hypot(dx, dy);
  // Below this the head would be larger than the shaft and the arrow reads as
  // a blot. A quantity that is genuinely zero at this instant draws nothing,
  // which is the truth about it.
  if (!Number.isFinite(length) || length < 1e-6) return '';
  const tipX = x + dx;
  const tipY = y + dy;
  const unitX = dx / length;
  const unitY = dy / length;
  const head = length * HEAD_LENGTH_FRACTION;
  const baseX = tipX - head * unitX;
  const baseY = tipY - head * unitY;
  const halfX = -unitY * head * HEAD_HALF_WIDTH_FRACTION;
  const halfY = unitX * head * HEAD_HALF_WIDTH_FRACTION;
  return (
    `M ${round(x)} ${round(y)} L ${round(tipX)} ${round(tipY)} ` +
    `M ${round(baseX + halfX)} ${round(baseY + halfY)} L ${round(tipX)} ${round(tipY)} ` +
    `M ${round(baseX - halfX)} ${round(baseY - halfY)} L ${round(tipX)} ${round(tipY)}`
  );
}

/** Four decimals is finer than the drawing can express; more is just bytes. */
function round(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}

/** Evenly spaced sample indices, never more of them than there are samples. */
export function arrowSampleIndices(samples: number, wanted = PATH_ARROW_COUNT): number[] {
  if (samples <= 0) return [];
  const count = Math.min(wanted, samples);
  const indices: number[] = [];
  for (let step = 0; step < count; step++) {
    indices.push(Math.round((step * (samples - 1)) / Math.max(1, count - 1)));
  }
  // The last sample of a closed cycle is the first pose again, so an arrow at
  // each end lands two on the same spot.
  return [...new Set(indices)];
}

/** What one part's trace comes out as: the arrows, and the size they were drawn at. */
export interface VectorTraceShape {
  /** Every path arrow, as one `d`. */
  d: string;
  /** Model units per unit of the quantity — the live arrow uses it too. */
  scale: number;
  /** The largest magnitude anywhere in the cycle, in the quantity's own units. */
  largest: number;
}

/**
 * A whole cycle of one quantity on one part.
 *
 * The maximum is taken over every solved sample rather than over the two dozen
 * that get an arrow: the live arrow at the current pose is drawn to the same
 * scale, and normalising against a subset would let it grow past the longest
 * one on the path and look like a spike that is not there.
 */
export function buildVectorTrace(
  samples: number,
  at: (index: number) => { x: number; y: number } | undefined,
  vectorAt: (index: number) => { x: number; y: number } | undefined,
  span: number
): VectorTraceShape | undefined {
  if (samples <= 0 || !(span > 0)) return undefined;
  let largest = 0;
  for (let index = 0; index < samples; index++) {
    const value = vectorAt(index);
    if (!value) continue;
    const magnitude = Math.hypot(value.x, value.y);
    if (Number.isFinite(magnitude)) largest = Math.max(largest, magnitude);
  }
  if (largest <= 0) return undefined;
  const scale = (span * LONGEST_ARROW_FRACTION) / largest;
  const arrows: VectorArrow[] = [];
  for (const index of arrowSampleIndices(samples)) {
    const tail = at(index);
    const value = vectorAt(index);
    if (!tail || !value) continue;
    if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) continue;
    arrows.push({ x: tail.x, y: tail.y, dx: value.x * scale, dy: value.y * scale });
  }
  return { d: arrowPath(arrows), scale, largest };
}
