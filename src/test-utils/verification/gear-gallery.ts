import type { GalleryEntry } from './fixture-gallery';
import { GEAR_PAIR, GEAR_FOUR_BAR, gearNetworkFixture } from './gear-fixtures';
import { COMPOUND_GEAR_TRAIN, COMPOUND_GEAR_FOUR_BAR } from './compound-gear-fixtures';

export const GEAR_GALLERY: GalleryEntry[] = [
  {
    name: 'Compound gear train',
    purpose: '20/40 and 10/30 share one shaft, giving an exact +1/6 output ratio',
    spec: 'compound-gear-kinematics.spec.ts',
    floatingSlot: false,
    speed: { rpm: 30 },
    fixture: COMPOUND_GEAR_TRAIN,
  },
  {
    name: 'Compound gear driven four-bar',
    purpose: 'A compound train drives an ordinary closed four-bar through six input turns',
    spec: 'compound-gear-kinematics.spec.ts',
    floatingSlot: false,
    speed: { rpm: 30 },
    fixture: COMPOUND_GEAR_FOUR_BAR,
  },
  {
    name: 'Simple gear pair',
    purpose: '20T drives 40T in the opposite direction over a two-input-turn cycle',
    spec: 'gear-kinematics.spec.ts',
    floatingSlot: false,
    speed: { rpm: 30 },
    fixture: GEAR_PAIR,
  },
  {
    name: 'Gear-driven four-bar',
    purpose: 'One input drives a dependent crank and a closed linkage',
    spec: 'gear-kinematics.spec.ts',
    floatingSlot: false,
    speed: { rpm: 30 },
    fixture: GEAR_FOUR_BAR,
  },
  {
    name: 'Idler gear train',
    purpose: '20T–40T–20T restores the final direction through an idler',
    spec: 'gear-kinematics.spec.ts',
    floatingSlot: false,
    speed: { rpm: 30 },
    fixture: gearNetworkFixture(
      [
        { center: [-3, 0], teeth: 20 },
        { center: [0, 0], teeth: 40 },
        { center: [3, 0], teeth: 20 },
      ],
      [
        [0, 1],
        [1, 2],
      ]
    ),
  },
];
