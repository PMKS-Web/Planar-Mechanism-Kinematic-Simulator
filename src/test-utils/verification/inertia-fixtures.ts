import { MechanismFixture } from './fixture';

/**
 * Two mechanisms whose dynamic forces can be worked out by hand, kept for
 * checking the force solver's inertia terms rather than for the library.
 *
 * Both are written in meters and kilograms. A spec builds them through
 * `inModelUnits`, as the app would hold them, because the force solver reads
 * every length as a model unit (see force-solver.model-scale.spec.ts).
 */

/**
 * A 2 kg bar, 2 m long, pinned at one end and turning at 1 rad/s.
 *
 * Its pin pulls it round with m·ω²·r = 2 N, and with gravity on the drive
 * holds it level at the start with m·g·r = 19.6133 N·m.
 */
export function spinningBarFixture(gravity = false): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: 2, y: 0 },
    ],
    links: [{ joints: 'AB', mass: 2, moi: 0.5, com: [1, 0] }],
    inputAngVel: 1,
    gravity,
  };
}

/** The rocker's mass, kg. The crank and coupler weigh nothing. */
export const ROCKER_MASS = 3;
/** The rocker's moment of inertia about its own center, kg·m². */
export const ROCKER_INERTIA = 0.4;
/** Where the rocker's center is drawn: off the line CD, so both of its terms matter. */
export const ROCKER_CENTER: [number, number] = [3.8, 1.6];

/**
 * A crank-rocker four-bar whose rocker carries all the mass.
 *
 * With the crank and coupler weightless, the coupler is a two-force member and
 * the rocker's equilibrium is three equations in three unknowns. The rocker's
 * angular acceleration changes all cycle, so its I·α term is a real load.
 */
export function weightedRockerFourBarFixture(): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: 0, y: 1 },
      { id: 'C', x: 3, y: 3 },
      { id: 'D', x: 4, y: 0, ground: true },
    ],
    links: [
      { joints: 'AB', mass: 0, moi: 0 },
      { joints: 'BC', mass: 0, moi: 0 },
      { joints: 'CD', mass: ROCKER_MASS, moi: ROCKER_INERTIA, com: ROCKER_CENTER },
    ],
    inputAngVel: 2,
    gravity: true,
  };
}
