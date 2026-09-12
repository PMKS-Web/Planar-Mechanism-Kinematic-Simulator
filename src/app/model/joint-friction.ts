/** Coulomb contact properties. Radius uses the same length units as joint coordinates. */
export interface JointFriction {
  staticCoefficient: number;
  kineticCoefficient: number;
  radius: number;
}

export function frictionless(): JointFriction {
  return { staticCoefficient: 0, kineticCoefficient: 0, radius: 0 };
}

export const INERTIA_FRICTION_REFUSAL =
  'Friction results are withheld because the existing In-motion inertia calculation has a scaling error for bodies with mass or inertia. Use Static analysis.';

export function hasFriction(value: JointFriction): boolean {
  return value.staticCoefficient !== 0 || value.kineticCoefficient !== 0;
}

export function frictionPropertyError(value: JointFriction, pin: boolean): string | undefined {
  if (Object.values(value).some((one) => !Number.isFinite(one) || one < 0)) {
    return 'Enter finite, nonnegative friction coefficients and radius.';
  }
  if (value.staticCoefficient < value.kineticCoefficient) {
    return 'The static coefficient must be at least the kinetic coefficient for this model.';
  }
  if (pin && hasFriction(value) && value.radius === 0) {
    return 'Enter a positive effective radius for pin friction.';
  }
  return undefined;
}
