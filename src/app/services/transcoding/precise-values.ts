import { fromUrlSafeDecimal, toUrlSafeDecimal } from './base64-converter';
import { ForceData, JointData, LinkData } from './transcoder-data';

/**
 * Thousandths remain the legacy record format. A tagged correction in the
 * optional tail preserves any number that format cannot round-trip, using
 * JavaScript's shortest round-trip spelling. Old links need no correction;
 * old readers reject the unknown tag rather than opening changed physics.
 */
interface NumericRecords {
  joints: JointData[];
  links: LinkData[];
  forces: ForceData[];
  decimals: number[];
  integers: number[];
}

// Field order is part of the extension format: append, never reorder.
const FIELDS = {
  J: ['x', 'y', 'angleRadians', 'driveSpeed', 'mass'],
  L: ['mass', 'massMoI', 'xCoM', 'yCoM'],
  F: ['startX', 'startY', 'endX', 'endY', 'magnitude'],
} as const;

type Kind = keyof typeof FIELDS;
const list = (data: NumericRecords, kind: Kind) =>
  kind === 'J' ? data.joints : kind === 'L' ? data.links : data.forces;

export function preciseValues(data: NumericRecords): string[] {
  const entries: string[] = [];
  const append = (tag: string, value: number, legacy: number) => {
    if (!Number.isFinite(value)) throw new Error('Cannot save a nonfinite numeric value');
    if (value !== legacy) entries.push(`${tag}~${value}`);
  };
  for (const kind of Object.keys(FIELDS) as Kind[]) {
    for (const object of list(data, kind)) {
      const numbers = object as unknown as Record<string, number>;
      FIELDS[kind].forEach((field, index) => {
        const value = numbers[field];
        append(`P${kind}${object.id}~${index}`, value, fromUrlSafeDecimal(toUrlSafeDecimal(value)));
      });
    }
  }
  data.decimals.forEach((value, index) =>
    append(`PD~${index}`, value, fromUrlSafeDecimal(toUrlSafeDecimal(value)))
  );
  data.integers.forEach((value, index) => append(`PI~${index}`, value, Math.floor(value)));
  return entries;
}

export function restorePreciseValue(entry: string, data: NumericRecords): void {
  const [tag, fieldText, valueText, extra] = entry.split('~');
  const index = Number(fieldText);
  const value = Number(valueText);
  if (
    extra !== undefined ||
    valueText === undefined ||
    valueText === '' ||
    fieldText === '' ||
    !Number.isInteger(index) ||
    index < 0 ||
    !Number.isFinite(value)
  )
    throw new Error('URL contains an invalid precision correction');
  const kind = tag[1];
  if ((kind === 'D' || kind === 'I') && tag.length === 2) {
    const target = kind === 'D' ? data.decimals : data.integers;
    if (index >= target.length)
      throw new Error('URL precision correction names an unknown setting');
    target[index] = value;
    return;
  }
  if (!(kind in FIELDS)) throw new Error('URL precision correction has an unknown kind');
  const fields = FIELDS[kind as Kind];
  const object = list(data, kind as Kind).find((candidate) => candidate.id === tag.slice(2));
  if (!object || index >= fields.length)
    throw new Error('URL precision correction names an unknown field');
  (object as unknown as Record<string, number>)[fields[index]] = value;
}
