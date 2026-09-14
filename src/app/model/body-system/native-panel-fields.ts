/**
 * What the Edit panel's fields read and write, said once in the document's own
 * terms.
 *
 * The panel on the native route is the public panel, so its fields ask the same
 * questions: a force's magnitude and angle, an input's speed in the unit the
 * reader picked, a cylinder's travel read as a stroke or as its two ends. The
 * document keeps none of those directly -- it keeps a vector, radians per
 * second, and a limit on a coordinate -- so each is a conversion, and a
 * conversion written in a template is a conversion nothing can test.
 *
 * Nothing here reaches for a service or a document: every function takes the
 * numbers it needs and returns numbers.
 */

import { Point } from './body-frame';

/** Why a control the public panel offers cannot be used on this route yet. */
export interface NativePanelRefusal {
  readonly short: string;
  readonly long: string;
}

/**
 * The rule behind this control is not written yet.
 *
 * The panel keeps the control rather than dropping it: a reader who knows the
 * Edit panel should find the same rows in the same order, and a row that is
 * grayed with a reason says more than a row that is not there. The words are
 * the ones `docs/ui-vocabulary.md` settles on.
 */
export const NOT_BUILT_YET: NativePanelRefusal = { short: 'not built yet', long: 'Not built yet.' };

/**
 * Input Speed unit choices, in the order the public panel's picker shows them.
 *
 * The value is the option's index as a string, because that is what
 * `input-block`'s unit picker binds a form control to.
 */
export const NATIVE_SPEED_UNITS: { value: string; label: string }[] = [
  { value: '0', label: 'RPM' },
  { value: '1', label: 'deg/s' },
  { value: '2', label: 'rad/s' },
];

/** Radians per second per unit of the picker above, by the picker's own index. */
const PER_RADIAN_PER_SECOND = [30 / Math.PI, 180 / Math.PI, 1];

/** A stored angular speed, shown in the unit the picker is set to. */
export function nativeAngularSpeedIn(radiansPerSecond: number, unitIndex: number): number {
  return radiansPerSecond * (PER_RADIAN_PER_SECOND[unitIndex] ?? PER_RADIAN_PER_SECOND[0]);
}

/** The same boundary the other way: typed in the reader's unit, kept in ours. */
export function nativeAngularSpeedFrom(value: number, unitIndex: number): number {
  return value / (PER_RADIAN_PER_SECOND[unitIndex] ?? PER_RADIAN_PER_SECOND[0]);
}

/**
 * A unit as the panel prints it, from the token the document keeps it under.
 *
 * `kg*m2` is a key, not a word. The public panel prints `kg·m²` and the reader
 * of either route should see the same thing.
 */
export function nativeUnitLabel(unit: string): string {
  return { 'kg*m2': 'kg·m²', 'kg*cm2': 'kg·cm²', 'lb*in2': 'lbm·in²' }[unit] ?? unit;
}

/**
 * A number and its unit, written the way every field in the Edit panel writes
 * one: two decimals, or none for a whole number of degrees, and never a
 * negative zero.
 *
 * The same rule as the public panel's `formatValueAndUnit`, because the panel
 * is the same panel -- a readout eight digits deep beside one rounded to two is
 * the difference a reader sees first.
 */
export function nativeUnitText(value: number, unit: string): string {
  const rounded = value.toFixed(unit === 'deg' ? 0 : 2);
  return (Number(rounded) === 0 ? (0).toFixed(unit === 'deg' ? 0 : 2) : rounded) + ' ' + unit;
}

/** The same rounding for a field whose unit is shown by its picker, not its text. */
export function nativeRounded(value: number): string {
  return Number(value.toFixed(2)).toString();
}

/**
 * A plain number, with or without the unit the field printed beside it.
 *
 * Masses, speeds and force components are shown with their unit in the box, the
 * way every other value in the panel is, and there is only one unit each could
 * be in -- so the word is read back and discarded rather than parsed.
 */
export function nativeScalar(text: string): number | undefined {
  const match = text
    .trim()
    .match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*(%|[A-Za-z][A-Za-z0-9*·²/^]*)?$/);
  return match ? Number(match[1]) : undefined;
}

/** A force's magnitude and its angle, which is what the panel's first pair asks for. */
export function nativeForcePolar(vector: Point): { magnitude: number; angle: number } {
  return { magnitude: Math.hypot(vector.x, vector.y), angle: Math.atan2(vector.y, vector.x) };
}

/**
 * The vector a typed magnitude and angle mean.
 *
 * A magnitude of zero has no direction to read back, so the angle the reader
 * typed is kept by the caller rather than recovered from the vector.
 */
export function nativeForceVector(magnitude: number, angle: number): Point {
  return { x: magnitude * Math.cos(angle), y: magnitude * Math.sin(angle) };
}

/** Which of the three ways the Travel field reads a cylinder's size. */
export type NativeTravelMode = 'stroke' | 'ret' | 'ext';

/** Everything the Travel and Starts at fields are read from. */
export interface NativeCylinderSpan {
  /** Joint to joint right now, in document length. */
  readonly span: number;
  /** Where the rod stands in its travel right now. */
  readonly travel: number;
  readonly lower: number;
  readonly upper: number;
}

/** Travel, closed and open are three ways of saying one size. */
export function nativeTravelValue(at: NativeCylinderSpan, mode: NativeTravelMode): number {
  const closed = at.span - (at.travel - at.lower);
  if (mode === 'ret') return closed;
  if (mode === 'ext') return closed + (at.upper - at.lower);
  return at.upper - at.lower;
}

/**
 * The stroke a typed Travel means, or nothing when this document cannot take it.
 *
 * Stroke and open both resolve to a stroke -- open is the closed length plus
 * the stroke, and the closed length is fixed by the barrel and the rod. Typing
 * the closed length asks for the two members to be resized around an unchanged
 * stroke, which this model has no edit for, so the field says so instead of
 * writing something else.
 */
export function nativeStrokeFor(
  at: NativeCylinderSpan,
  mode: NativeTravelMode,
  typed: number
): number | undefined {
  if (mode === 'stroke') return typed;
  if (mode === 'ext') return typed - nativeTravelValue(at, 'ret');
  return undefined;
}

/** Where the rod begins its cycle, as a share of the travel or as a length. */
export function nativeStartValue(at: NativeCylinderSpan, asShare: boolean): number {
  const range = at.upper - at.lower;
  if (!asShare) return at.travel - at.lower;
  return range === 0 ? 0 : ((at.travel - at.lower) / range) * 100;
}

/** The travel coordinate a typed Starts at means. */
export function nativeStartTravel(at: NativeCylinderSpan, asShare: boolean, typed: number): number {
  const range = at.upper - at.lower;
  return at.lower + (asShare ? (typed / 100) * range : typed);
}
