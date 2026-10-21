import type { GalleryEntry } from './fixture-gallery';
import {
  splitDanglingSliderFixture,
  splitPinFixture,
  splitSliderFixture,
} from './split-joint-fixtures';

/** The published editing examples, kept beside the split fixtures they explain. */
export const SPLIT_JOINT_GALLERY: GalleryEntry[] = [
  {
    name: 'Split a detached pin-in-slot joint',
    purpose: 'Two links at red joint B can separate even though its slider has no guide',
    spec: 'split-joint-selection.spec.ts',
    floatingSlot: false,
    fixture: splitDanglingSliderFixture('pin-in-slot'),
  },
  {
    name: 'Split a detached prismatic joint',
    purpose: 'Separate one rider from red joint B while retaining the other prismatic rider',
    spec: 'split-joint-selection.spec.ts',
    floatingSlot: false,
    slide: true,
    fixture: splitDanglingSliderFixture('prismatic'),
  },
  {
    name: 'Split a three-link joint',
    purpose: 'Select joint B and choose which link should get a separate pin',
    spec: 'split-joint-selection.spec.ts',
    floatingSlot: false,
    fixture: splitPinFixture(),
  },
  {
    name: 'Split a four-link joint into groups',
    purpose: 'Select joint B and move two checked links together to one new Revolute joint',
    spec: 'split-joint-selection.spec.ts',
    floatingSlot: false,
    fixture: splitPinFixture(4),
  },
  {
    name: 'Split links off a pin-in-slot joint',
    purpose: 'Joint B keeps its slot while a chosen attached link receives a Revolute pin',
    spec: 'split-joint-selection.spec.ts',
    floatingSlot: true,
    fixture: splitSliderFixture('pin-in-slot'),
  },
  {
    name: 'Split links off a prismatic joint',
    purpose: 'Joint B keeps its carrier and prismatic constraint while a chosen link separates',
    spec: 'split-joint-selection.spec.ts',
    floatingSlot: true,
    slide: true,
    fixture: splitSliderFixture('prismatic'),
  },
  {
    name: 'Split links off a grounded prismatic joint',
    purpose: 'Joint B keeps its grounded guide while a chosen link receives a Revolute pin',
    spec: 'split-joint-selection.spec.ts',
    floatingSlot: false,
    slide: true,
    fixture: splitSliderFixture('prismatic', true),
  },
];
