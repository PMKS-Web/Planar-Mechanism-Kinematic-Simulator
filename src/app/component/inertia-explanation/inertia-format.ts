import { LengthUnit } from '../../model/unit-enums';
import { MODEL_SCALE } from '../../model/render-scale';
import { siUnitFactors } from '../../model/unit-conversions';
import { NumberUnitParserService } from '../../services/number-unit-parser.service';

/** Keep mathematical markup separate from labels and round only for display. */
export function inertiaFormat(length: LengthUnit, nup: NumberUnitParserService) {
  const unit = nup.unitLabel(length);
  const massUnit = nup.unitLabel(nup.massUnitFor(length));
  const display = nup.displayInertiaUnit(length);
  const stored = nup.storedInertiaUnit(length);
  const units = siUnitFactors(unit);
  const number = (value: number) =>
    Number.isFinite(value) ? Number(value.toPrecision(6)).toString() : 'unavailable';
  const tex = (value: number) => {
    const [base, exponent] = number(value).split('e');
    return exponent ? `${base}\\times 10^{${Number(exponent)}}` : base;
  };
  const quantity = (value: number, label: string) => `${tex(value)}\\,\\mathrm{${label}}`;
  const inertiaValue = (value: number) => nup.convertInertia(value, stored, display);
  return {
    factor: (units.massToKg * units.distanceToM ** 2) / units.inertiaToKgM2 / MODEL_SCALE ** 2,
    number,
    tex,
    unit,
    mass: (value: number) => quantity(value, massUnit),
    length: (value: number) => quantity(value / MODEL_SCALE, unit),
    square: (value: number) => quantity(value / MODEL_SCALE ** 2, unit) + '^{2}',
    power: (value: number, exponent: number) =>
      quantity(value / MODEL_SCALE ** exponent, unit) + `^{${exponent}}`,
    inertia: (value: number) =>
      `${tex(inertiaValue(value))}\\,\\mathrm{${massUnit}}\\cdot\\mathrm{${unit}}^{2}`,
    inertiaText: (value: number) => `${number(inertiaValue(value))} ${nup.unitLabel(display)}`,
    inertiaNumber: (value: number) => tex(inertiaValue(value)),
  };
}
export type InertiaFormat = ReturnType<typeof inertiaFormat>;
export interface InertiaStep {
  title: string;
  text: string;
  equations: string[];
  children?: InertiaStep[];
}
