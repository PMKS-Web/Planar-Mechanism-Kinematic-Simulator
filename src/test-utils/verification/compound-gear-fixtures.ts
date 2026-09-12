import { GearFixture, gearNetworkFixture } from './gear-fixtures';

const shafts = gearNetworkFixture(
  [
    { center: [-3, 0], teeth: 20 },
    { center: [0, 0], teeth: 40 },
    { center: [2, 0], teeth: 30, heading: Math.PI / 3 },
  ],
  []
);
const [a, b, d] = shafts.transmission.gears;

/** Four gears, three ordinary rigid shafts and two genuine external meshes. */
export const COMPOUND_GEAR_TRAIN: GearFixture = {
  ...shafts,
  transmission: {
    gears: [
      { ...a, id: 'GA', name: 'Gear A' },
      { ...b, id: 'GB', name: 'Gear B' },
      { ...b, id: 'GC', name: 'Gear C', teeth: 10, plane: 1 },
      { ...d, id: 'GD', name: 'Gear D', plane: 1 },
    ],
    meshes: [
      { id: 'GMAB', gearAId: 'GA', gearBId: 'GB', kind: 'external' },
      { id: 'GMCD', gearAId: 'GC', gearBId: 'GD', kind: 'external' },
    ],
  },
};

const f = shafts.joints[5],
  dx = 6 - f.x,
  dy = -f.y;
const distance = Math.hypot(dx, dy),
  height = Math.sqrt(9 - (distance * distance) / 4);
export const COMPOUND_GEAR_FOUR_BAR: GearFixture = {
  ...COMPOUND_GEAR_TRAIN,
  joints: [
    ...shafts.joints,
    { id: 'G', x: (f.x + 6) / 2 - (dy / distance) * height, y: f.y / 2 + (dx / distance) * height },
    { id: 'H', x: 6, y: 0, ground: true },
  ],
  links: [...shafts.links, { joints: 'FG' }, { joints: 'GH' }],
};
