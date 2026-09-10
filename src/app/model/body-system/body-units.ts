export interface BodyUnits {
  readonly length: 'm' | 'cm' | 'in';
  readonly mass: 'kg' | 'g' | 'lb';
  readonly inertia: 'kg*m2' | 'kg*cm2' | 'lb*in2';
  readonly force: 'N' | 'lbf';
}

export const SI_UNITS: BodyUnits = Object.freeze({
  length: 'm',
  mass: 'kg',
  inertia: 'kg*m2',
  force: 'N',
});

export function unitFactors(units: BodyUnits) {
  return {
    length: { m: 1, cm: 0.01, in: 0.0254 }[units.length],
    mass: { kg: 1, g: 0.001, lb: 0.45359237 }[units.mass],
    // Legacy centimeter documents use grams but kg·cm²; these factors are independent.
    inertia: { 'kg*m2': 1, 'kg*cm2': 0.0001, 'lb*in2': 0.45359237 * 0.0254 ** 2 }[units.inertia],
    force: { N: 1, lbf: 4.4482216152605 }[units.force],
  };
}
