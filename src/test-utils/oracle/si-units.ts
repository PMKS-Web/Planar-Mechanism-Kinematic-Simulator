/**
 * What one stored number means in SI, for each length system a drawing can be in.
 *
 * Written out here rather than imported from `unit-conversions.ts`, because the
 * exporter is the one place a PMKS+ convention becomes physics for the oracle,
 * and a wrong factor shared by both sides would agree with itself. A spec holds
 * this table against the app's, so a change to either is a visible decision.
 *
 * Every length is also scaled: the model stores MODEL_SCALE units per user unit.
 */
export interface SiFactors {
  /** Meters per user length unit. */
  meters: number;
  /** Kilograms per stored mass unit. */
  kilograms: number;
  /** kg·m² per stored inertia unit. */
  kilogramMetersSquared: number;
  /** Newtons per stored force unit. */
  newtons: number;
}

const METERS_PER_INCH = 0.0254;
const KILOGRAMS_PER_POUND = 0.45359237;
/** One pound-force: a pound mass under standard gravity, 9.80665 m/s². */
const NEWTONS_PER_POUND_FORCE = KILOGRAMS_PER_POUND * 9.80665;

/** The solver's unit strings: `'cm'`, `'in'` or `'m'`. */
export function siFactors(unit: 'cm' | 'in' | 'm'): SiFactors {
  switch (unit) {
    case 'm':
      return { meters: 1, kilograms: 1, kilogramMetersSquared: 1, newtons: 1 };
    case 'in':
      return {
        meters: METERS_PER_INCH,
        kilograms: KILOGRAMS_PER_POUND,
        kilogramMetersSquared: KILOGRAMS_PER_POUND * METERS_PER_INCH ** 2,
        newtons: NEWTONS_PER_POUND_FORCE,
      };
    case 'cm':
      // Grams for mass, but kg·cm² for inertia: the metric drawing's two
      // stored units are not one system, and the Edit panel says so.
      return { meters: 0.01, kilograms: 0.001, kilogramMetersSquared: 1e-4, newtons: 1 };
  }
}

/** Standard gravity, which the force solver applies when gravity is on. */
export const STANDARD_GRAVITY = 9.80665;
