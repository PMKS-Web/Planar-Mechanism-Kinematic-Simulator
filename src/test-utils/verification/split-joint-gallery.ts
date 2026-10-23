import type { GalleryEntry } from './fixture-gallery';
import {
  plainPinFixture,
  splitSliderFixture,
  twoSlotsAtOnePinFixture,
} from './split-joint-fixtures';

/** Every combination Split Joint treats differently, each one click from its URL. */
export const SPLIT_JOINT_GALLERY: GalleryEntry[] = [
  {
    name: 'Split Joint: two plain links',
    purpose:
      'Select A and Split Joint: both pins spread evenly, since nothing depends on where A is',
    spec: 'split-joint-sliders.spec.ts',
    floatingSlot: false,
    fixture: plainPinFixture(),
  },
  {
    name: 'Split Joint: four plain links',
    purpose: 'Select A and Split Joint: four pins spread far enough apart to grab each one',
    spec: 'split-joint-sliders.spec.ts',
    floatingSlot: false,
    fixture: plainPinFixture(4),
  },
  {
    name: 'Split Joint: two slots ending at one pin',
    purpose:
      'Select A and Split Joint: both carriers have to move, and both blocks stay on their slots',
    spec: 'split-joint-sliders.spec.ts',
    floatingSlot: true,
    fixture: twoSlotsAtOnePinFixture(),
  },
  {
    name: 'Split Joint: one rider on a moving slot',
    purpose:
      'Select B and Split Joint: the block stays on its slot, empty, and the rider steps off along itself',
    spec: 'split-joint-sliders.spec.ts',
    floatingSlot: true,
    fixture: splitSliderFixture(1),
  },
  {
    name: 'Split Joint: two riders on a moving slot',
    purpose:
      'Select B and Split Joint: the block stays on its slot, empty, and each rider gets its own pin',
    spec: 'split-joint-sliders.spec.ts',
    floatingSlot: true,
    fixture: splitSliderFixture(2),
  },
  {
    name: 'Split Joint: one rider on a grounded slot',
    purpose: 'Select B and Split Joint: the grounded block stays where it is, empty',
    spec: 'split-joint-sliders.spec.ts',
    floatingSlot: false,
    fixture: splitSliderFixture(1, { grounded: true }),
  },
  {
    name: 'Split Joint: two riders on a grounded slot',
    purpose: 'Select B and Split Joint: the grounded block stays, and each rider gets its own pin',
    spec: 'split-joint-sliders.spec.ts',
    floatingSlot: false,
    fixture: splitSliderFixture(2, { grounded: true }),
  },
  {
    name: 'Split Joint: one rider on a Prismatic block',
    purpose: 'Select B and Split Joint: a Prismatic block with one rider splits like any other',
    spec: 'split-joint-sliders.spec.ts',
    floatingSlot: true,
    slide: true,
    fixture: splitSliderFixture(1, { prismatic: true }),
  },
  {
    name: 'Split Joint refused: two riders on a Prismatic block',
    purpose:
      'Select B: Split Joint is refused, because the block welds its two riders into one body',
    spec: 'split-joint-sliders.spec.ts',
    floatingSlot: false,
    slide: true,
    fixture: splitSliderFixture(2, { grounded: true, prismatic: true }),
  },
  {
    name: 'Split Joint: a rider shorter than one step',
    purpose:
      'Select B and Split Joint: the rider would fold back over its own far end, so it steps aside instead',
    spec: 'split-joint-sliders.spec.ts',
    floatingSlot: true,
    fixture: splitSliderFixture(1, { shortRider: true }),
  },
];
