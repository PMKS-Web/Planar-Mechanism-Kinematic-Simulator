import { MechanismFixture } from '../../../test-utils/verification/fixture';

/**
 * PROTOTYPE -- test mechanisms written for the "What is this?" trials, where
 * neither the library nor the students' drawings had a case worth testing.
 *
 * Each says what it is testing. None is in the library, so no answer can have
 * been learned from a template's name.
 */
export interface MadeCase {
  id: string;
  name: string;
  /** What it tests; shown on the review page, never sent to the model. */
  blurb: string;
  /** What a good answer recognizes it as. */
  intent: string;
  fixture: MechanismFixture;
}

/** Hoeken's straight-line linkage: crank 1, ground 2, coupler and rocker 2.5, point 5 from the crank pin. */
function hoeken(): MechanismFixture {
  const a = 1;
  const B = { x: 0, y: a };
  const D = { x: 2 * a, y: 0 };
  // C is 2.5 from both B and D, on the side that keeps the linkage open.
  const mid = { x: (B.x + D.x) / 2, y: (B.y + D.y) / 2 };
  const half = Math.hypot(D.x - B.x, D.y - B.y) / 2;
  const up = Math.sqrt(2.5 ** 2 - half ** 2);
  const ux = (D.x - B.x) / (2 * half);
  const uy = (D.y - B.y) / (2 * half);
  const C = { x: mid.x - up * uy, y: mid.y + up * ux };
  // P on the coupler line, twice as far from B as C is.
  const P = { x: B.x + 2 * (C.x - B.x), y: B.y + 2 * (C.y - B.y) };
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true, driveSpeed: 10 },
      { id: 'B', ...B },
      { id: 'C', ...C },
      { id: 'P', ...P, trace: true },
      { id: 'D', ...D, ground: true },
    ],
    links: [{ joints: 'AB' }, { joints: 'BCP' }, { joints: 'CD' }],
    inputAngVel: (10 * Math.PI) / 30,
  };
}

/**
 * Chebyshev's proportions (side links 5, coupler 2, ground 4) drawn slightly
 * off, as a student sketching one from memory would: the family check allows 3%.
 */
function chebyshevNearMiss(): MechanismFixture {
  const half = 4.3 / 2;
  const reach = 2.2 / 2;
  const rise = Math.sqrt(5 ** 2 - (half + reach) ** 2);
  return {
    joints: [
      { id: 'G', x: -half, y: 0, ground: true, input: true, driveSpeed: 3 },
      { id: 'A', x: -reach, y: rise },
      { id: 'B', x: reach, y: rise },
      { id: 'M', x: 0, y: rise, trace: true },
      { id: 'H', x: half, y: 0, ground: true },
    ],
    links: [{ joints: 'GB' }, { joints: 'ABM' }, { joints: 'AH' }],
    inputAngVel: (3 * Math.PI) / 30,
  };
}

/** Watt's linkage as it locates a car's rear axle: two equal arms reaching in opposite directions. */
function wattsLinkage(): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true, driveSpeed: 5 },
      { id: 'B', x: 3, y: 0 },
      { id: 'M', x: 3, y: 1, trace: true },
      { id: 'C', x: 3, y: 2 },
      { id: 'D', x: 6, y: 2, ground: true },
    ],
    links: [{ joints: 'AB' }, { joints: 'BMC' }, { joints: 'CD' }],
    inputAngVel: (5 * Math.PI) / 30,
  };
}

export const MADE_CASES: MadeCase[] = [
  {
    id: 'made-chebyshev-near-miss',
    name: 'Chebyshev, drawn a little off',
    blurb:
      "Chebyshev's straight-line linkage with its lengths 4-10% off (ground 4.3, coupler 2.2): outside the family check's 3%, as a student's sketch from memory would be.",
    intent: 'Chebyshev straight-line linkage',
    fixture: chebyshevNearMiss(),
  },
  {
    id: 'made-hoeken',
    name: "Hoeken's linkage",
    blurb:
      "Hoeken's straight-line linkage at its textbook proportions: in the family catalog, not in the library.",
    intent: "Hoeken's straight-line linkage",
    fixture: hoeken(),
  },
  {
    id: 'made-watts-linkage',
    name: "Watt's linkage",
    blurb:
      "Watt's linkage as it locates a car's rear axle: the family check knows the linkage, only world knowledge knows the car.",
    intent: "Watt's linkage (car rear-axle location)",
    fixture: wattsLinkage(),
  },
];
