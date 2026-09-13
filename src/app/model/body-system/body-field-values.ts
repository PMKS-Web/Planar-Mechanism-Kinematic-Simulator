import { BodyUnits } from './body-units';

/** Significant digits retain small physical values after a unit conversion. */
export function nativeNumber(value: number): string {
  return Number.isFinite(value) ? String(Number(value.toPrecision(8))) : '';
}

export function nativeLength(text: string, unit: BodyUnits['length']): number | undefined {
  const match = text.trim().match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*(m|cm|in)?$/i);
  if (!match) return undefined;
  const factor = { m: 1, cm: 0.01, in: 0.0254 };
  const value =
    (Number(match[1]) * factor[(match[2]?.toLowerCase() as BodyUnits['length']) || unit]) /
    factor[unit];
  return Number.isFinite(value) ? value : undefined;
}
export function nativeAngle(text: string, unit: 'deg' | 'rad'): number | undefined {
  const match = text.trim().match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*(deg|rad|°)?$/i);
  if (!match) return undefined;
  const typed = match[2]?.toLowerCase() || unit;
  const value = Number(match[1]) * (typed === 'rad' ? 1 : Math.PI / 180);
  return Number.isFinite(value) ? value : undefined;
}
