import type { Vector2 } from './loads';

/**
 * Global accelerations of one moving root body at the supplied configuration.
 * Mass, solved CoM, and inertia about CoM live in that body's massProperties;
 * they are required for dynamics, and are deliberately not duplicated here.
 * Gravity is an applied load, never part of this acceleration.
 */
export interface BodyDynamicState {
  readonly linkId: string;
  readonly centerOfMassAccelerationMPerS2: Vector2;
  readonly angularAccelerationRadPerS2: number;
}
