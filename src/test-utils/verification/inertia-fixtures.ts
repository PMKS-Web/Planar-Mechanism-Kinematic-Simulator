import type { MechanismFixture } from './fixture';

/** App URL demonstrations, stated in its default cm / g / kg*cm^2 system. */
export function centripetalBarDrawingFixture(): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 0, y: 0, input: true, ground: true, driveSpeed: 30 / Math.PI },
      { id: 'B', x: 4, y: 0 },
    ],
    links: [{ joints: 'AB', mass: 1000, moi: 4 / 3, com: [2, 0] }],
    inputAngVel: 1,
    gravity: false,
  };
}

export function appliedMomentDrawingFixture(): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 0, y: 0, input: true, ground: true },
      { id: 'B', x: 40, y: 0 },
    ],
    links: [{ joints: 'AB', mass: 0, moi: 0, com: [20, 0] }],
    load: { onLink: 'AB', at: [20, 0], vector: [0, -10] },
    inputAngVel: 1,
    gravity: false,
  };
}
