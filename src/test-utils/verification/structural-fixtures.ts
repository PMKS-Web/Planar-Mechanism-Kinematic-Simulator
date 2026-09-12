import type { MechanismFixture } from './fixture';
import type { GalleryEntry } from './fixture-gallery';

/** A 4 m beam pinned at A and supported at B by the vertical two-force hanger BC. */
export function structuralBeamFixture(): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true },
      { id: 'B', x: 4, y: 0 },
      { id: 'C', x: 4, y: 3, ground: true },
    ],
    links: [
      { joints: 'AB', mass: 0, moi: 0 },
      { joints: 'BC', mass: 0, moi: 0 },
    ],
    load: { onLink: 'AB', at: [1, 0], vector: [0, -100] },
    inputAngVel: 0,
  };
}

/** A held 2 m crank with a 100 N tip load; requires +200 N m at its grounded input. */
export function structuralCrankFixture(): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: 2, y: 0 },
    ],
    links: [{ joints: 'AB', mass: 2, moi: 2 / 3, com: [1, 0] }],
    load: { onLink: 'AB', at: [2, 0], vector: [0, -100] },
    inputAngVel: 1,
  };
}

/** All four pins collinear: the unrestrained transverse motion makes the pose singular. */
export function structuralToggleFixture(): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: 1, y: 0 },
      { id: 'C', x: 3, y: 0 },
      { id: 'D', x: 4, y: 0, ground: true },
    ],
    links: [
      { joints: 'AB', mass: 0, moi: 0 },
      { joints: 'BC', mass: 0, moi: 0 },
      { joints: 'CD', mass: 0, moi: 0 },
    ],
    inputAngVel: 1,
  };
}

/** Keep the structural verification family and its published descriptions together. */
export const STRUCTURAL_GALLERY: GalleryEntry[] = [
  {
    name: 'Structural supported beam',
    purpose: 'A quarter-span 100 N load gives 75 N and 25 N support reactions',
    spec: 'structural/static-force-solver.spec.ts',
    floatingSlot: false,
    fixture: structuralBeamFixture(),
  },
  {
    name: 'Structural held crank',
    purpose: 'A 100 N tip load requires 200 N m holding torque on a 2 m crank',
    spec: 'structural/static-force-solver.spec.ts',
    floatingSlot: false,
    fixture: structuralCrankFixture(),
  },
  {
    name: 'Structural singular toggle',
    purpose: 'A collinear four-bar must refuse a unique structural reaction solution',
    spec: 'structural/static-force-solver.spec.ts',
    floatingSlot: false,
    fixture: structuralToggleFixture(),
  },
];
