import type { GalleryEntry } from './fixture-gallery';
import {
  hydraulicCrossheadFixture,
  offsetMountHatchFixture,
  reciprocatingSawFixture,
  slottedToolDriveFixture,
} from './part2-library-fixtures';

/** The library cards that replaced the duplicate cylinder cards, and the two force studies. */
export const PART2_LIBRARY_GALLERY: GalleryEntry[] = [
  {
    name: 'Hydraulic crosshead',
    purpose: 'Welded frame and rod platen translate as rigid bodies',
    spec: 'part2-library.spec.ts',
    floatingSlot: true,
    speed: { unitsPerSecond: 1 },
    fixture: hydraulicCrossheadFixture(),
  },
  {
    name: 'Offset-mount hatch',
    purpose: 'Offset brackets welded to both cylinder ends drive a hinged hatch',
    spec: 'part2-library.spec.ts',
    floatingSlot: true,
    speed: { unitsPerSecond: 0.6 },
    fixture: offsetMountHatchFixture(),
  },
  {
    name: 'Reciprocating saw',
    purpose: 'Cutting resistance and carriage weight in a Scotch-yoke drive',
    spec: 'part2-library.spec.ts',
    floatingSlot: true,
    speed: { rpm: 10 },
    fixture: reciprocatingSawFixture(),
  },
  {
    name: 'Slotted tool drive',
    purpose: 'Local tool-normal force and global hanging load acting through a slotted coupler',
    spec: 'part2-library.spec.ts',
    floatingSlot: true,
    speed: { rpm: 10 },
    fixture: slottedToolDriveFixture(),
  },
];
