import { MechanismFixture } from './fixture';
import type { GalleryEntry } from './fixture-gallery';
import { NEWTONS_PER_KGF, siUnitFactors } from '../../app/model/unit-conversions';

/** A weightless slider-crank with a 100 N transverse load applied at its slider pin. */
export function frictionSliderCrankFixture(): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 0, y: 0, input: true, ground: true, driveSpeed: 10 },
      { id: 'B', x: 2, y: 2 },
      { id: 'C', x: 8, y: 0 },
    ],
    links: [
      { joints: 'AB', mass: 0, moi: 0 },
      { joints: 'BC', mass: 0, moi: 0 },
    ],
    slider: { at: 'C', prisId: 'D', angleRad: 0, pistonMass: 0 },
    load: { onLink: 'BC', at: [8, 0], vector: [0, -100] },
    inputAngVel: 1,
    gravity: false,
    friction: [
      { jointId: 'D', properties: { staticCoefficient: 0.3, kineticCoefficient: 0.2, radius: 0 } },
    ],
  };
}

/** A pin driven against a known 100 N radial load; the load itself has zero moment. */
export function frictionBearingFixture(): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 0, y: 0, input: true, ground: true, driveSpeed: 10 },
      { id: 'B', x: 4, y: 0 },
    ],
    links: [{ joints: 'AB', mass: 0, moi: 0 }],
    load: { onLink: 'AB', at: [0, 0], vector: [0, -100] },
    inputAngVel: 1,
    gravity: false,
    friction: [
      {
        jointId: 'A',
        properties: { staticCoefficient: 0.3, kineticCoefficient: 0.2, radius: 0.5 },
      },
    ],
  };
}

export const FRICTION_GALLERY: GalleryEntry[] = [
  {
    name: 'Driven slider with friction',
    floatingSlot: false,
    purpose: '100 N guide load, 20 N kinetic friction and 30 N static capacity',
    spec: 'friction-boundary.spec.ts',
    fixture: frictionDrivenSliderFixture(),
  },
  {
    name: 'Combined slider and bearing friction',
    floatingSlot: false,
    purpose: 'Guide and pin losses contribute to the same required input torque',
    spec: 'friction-reference.spec.ts',
    fixture: frictionCombinedFixture(),
  },
  {
    name: 'Slider-crank with friction',
    floatingSlot: false,
    purpose: 'Coupled normal load, sliding friction and static contact limit',
    spec: 'friction-analysis.spec.ts',
    fixture: frictionSliderCrankFixture(),
  },
  {
    name: 'Pin bearing with friction',
    floatingSlot: false,
    purpose: 'Effective-radius bearing torque under a known radial load',
    spec: 'friction-analysis.spec.ts',
    fixture: frictionBearingFixture(),
  },
];

export function frictionDrivenSliderFixture(unit = 'cm'): MechanismFixture {
  return {
    joints: [{ id: 'A', x: 1, y: 0 }],
    links: [],
    slider: {
      at: 'A',
      prisId: 'B',
      angleRad: 0,
      pistonMass: 100 / (NEWTONS_PER_KGF * siUnitFactors(unit).massToKg),
      input: true,
      driveSpeed: 1,
    },
    inputAngVel: 1,
    gravity: true,
    friction: [
      { jointId: 'B', properties: { staticCoefficient: 0.3, kineticCoefficient: 0.2, radius: 0 } },
    ],
  };
}
export function frictionCombinedFixture(): MechanismFixture {
  const fixture = frictionSliderCrankFixture();
  fixture.friction!.push({
    jointId: 'A',
    properties: { staticCoefficient: 0.2, kineticCoefficient: 0.12, radius: 0.05 },
  });
  return fixture;
}
