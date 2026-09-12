import type { GalleryEntry } from './fixture-gallery';
import { GEAR_PAIR, GEAR_FOUR_BAR, gearNetworkFixture } from './gear-fixtures';

export const GEAR_GALLERY: GalleryEntry[] = [
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
