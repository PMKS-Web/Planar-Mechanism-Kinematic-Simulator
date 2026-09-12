import type { StructuralBody } from './configuration';
import type { BodyDynamicState } from './dynamic-state';
import type { ResolvedStructuralMember } from './member';
import { finiteVector } from './loads';
import { memberFailure, MemberFailure } from './member-results';

/** Describes placement of the authoritative mass; deliberately has no second total mass field. */
export interface MemberMassDistribution {
  readonly kind: 'uniform-line';
  readonly memberId: string;
}
export interface BodySectionMotionState extends BodyDynamicState {
  /** Signed CCW-positive rad/s, from the same sample as the accelerations. */
  readonly angularVelocityRadPerS: number;
}
export const MEMBER_MASS_TOLERANCES = Object.freeze({
  relative: 1e-8,
  positionM: 1e-12,
  inertiaKgM2: 1e-12,
});
export function validateMemberMass(
  member: ResolvedStructuralMember,
  body: StructuralBody,
  distribution?: MemberMassDistribution
): { status: 'ok'; massPerLengthKgPerM: number } | MemberFailure {
  if (!distribution)
    return memberFailure(
      'missing-mass-distribution',
      'Supply an explicit member mass distribution.'
    );
  if (distribution.kind !== 'uniform-line' || distribution.memberId !== member.id)
    return memberFailure(
      'mass-distribution-mismatch',
      'Select a uniform line distribution belonging to this member.'
    );
  const mass = body.massProperties;
  if (
    !mass ||
    !Number.isFinite(mass.massKg) ||
    mass.massKg < 0 ||
    !Number.isFinite(mass.inertiaKgM2) ||
    mass.inertiaKgM2 < 0 ||
    !finiteVector(mass.centerOfMassM)
  )
    return memberFailure(
      'invalid-properties',
      'The root needs authoritative mass, CoM, and inertia.'
    );
  const center = {
    x: member.startM.x + (member.endM.x - member.startM.x) / 2,
    y: member.startM.y + (member.endM.y - member.startM.y) / 2,
  };
  const expectedInertia = (mass.massKg * member.lengthM ** 2) / 12;
  const comErrorM = Math.hypot(mass.centerOfMassM.x - center.x, mass.centerOfMassM.y - center.y);
  const tolerance = MEMBER_MASS_TOLERANCES;
  if (
    comErrorM > Math.max(tolerance.positionM, tolerance.relative * member.lengthM) ||
    Math.abs(mass.inertiaKgM2 - expectedInertia) >
      Math.max(
        tolerance.inertiaKgM2,
        tolerance.relative * Math.max(expectedInertia, mass.inertiaKgM2)
      )
  ) {
    return memberFailure(
      'mass-distribution-mismatch',
      'A uniform line must reproduce the root CoM and I_G=m L²/12. ' +
        'CoM error (m): ' +
        comErrorM +
        '; inertia error (kg m²): ' +
        Math.abs(mass.inertiaKgM2 - expectedInertia) +
        '. Correct the distribution; mass properties are not rescaled.'
    );
  }
  if (!Number.isFinite(expectedInertia))
    return memberFailure('numerical-failure', 'The member mass integral overflowed.');
  return { status: 'ok', massPerLengthKgPerM: mass.massKg / member.lengthM };
}
