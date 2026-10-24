import type { GalleryEntry } from './fixture-gallery';
import {
  nearlyParallelPinFixture,
  plainPinFixture,
  splitSliderFixture,
  twoSlotsAtOnePinFixture,
} from './split-joint-fixtures';

/** Every combination Split Joint treats differently, each one click from its URL. */
export const SPLIT_JOINT_GALLERY: GalleryEntry[] = [
  {
    name: 'Split Joint: two plain links',
    purpose:
      'Select A and Split Joint: A keeps its place, and the other link steps off along itself, clear of its bar',
    spec: 'split-joint-sliders.spec.ts',
    floatingSlot: false,
    fixture: plainPinFixture(),
  },
  {
    name: 'Split Joint: four plain links',
    purpose:
      'Select A and Split Joint: one link keeps A, and each other one steps off along itself, clear of the rest',
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
    name: 'Split Joint: two riders on a Prismatic block',
    purpose:
      'Select B and Split Joint: the weld through the block lets go, the block stays Prismatic, and each rider gets its own pin',
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
  {
    name: 'Split Joint: a welded joint',
    purpose: 'Select A and Split Joint: the weld lets go first, then each link gets its own pin',
    spec: 'split-joint-sliders.spec.ts',
    floatingSlot: false,
    fixture: plainPinFixture(2, true),
  },
  {
    name: 'Split Joint: two links almost on top of each other',
    purpose:
      'Select A and Split Joint: along itself the link would barely part, so it steps sideways',
    spec: 'split-placement.spec.ts',
    floatingSlot: false,
    fixture: nearlyParallelPinFixture(),
  },
];
