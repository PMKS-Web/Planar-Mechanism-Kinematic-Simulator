import { URL_DECIMAL_PLACES } from './base64-converter';

/**
 * How an object scale too small for the URL's thousandths still survives one.
 *
 * Every decimal rides the URL in thousandths, so a scale of 0.0001 -- which a
 * unit conversion can reach on its own -- was written as zero, and undo, redo
 * and every shared link brought the drawing back with no joints to see. The scale keeps its old token, rounded as
 * always, so a link stays readable by what wrote it; a second, appended token
 * carries the same value in millionths, and is written only when the first
 * would lose what the panel shows. Every URL that never needed it ends in the
 * zeros the encoder trims, so none of them changes by a character.
 */
const FINE_SCALE_FACTOR = 1_000_000;

/**
 * Three figures: past that, a difference in a mark's size is not one anybody
 * could see, so losing it is not worth a token.
 */
const SHOWN_FIGURES = 3;

/** The fine token for a scale: zero when the coarse one already carries it. */
export function fineScaleToken(scale: number): number {
  if (!(scale > 0)) return 0;
  const coarse = Math.round(scale * URL_DECIMAL_PLACES) / URL_DECIMAL_PLACES;
  const shown = (value: number) => Number(value.toPrecision(SHOWN_FIGURES));
  return shown(coarse) === shown(scale) ? 0 : scale * FINE_SCALE_FACTOR;
}

/** The scale a URL meant, from its coarse token and its fine one if present. */
export function scaleFromTokens(coarse: number, fine: number): number {
  return fine > 0 ? fine / FINE_SCALE_FACTOR : coarse;
}
