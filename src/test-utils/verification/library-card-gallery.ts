import { MODEL_SCALE } from '../../app/model/render-scale';
import type { GalleryEntry } from './fixture-gallery';
import {
  crankDrivenPumpjackFixture,
  fixedLengthFourBarFixture,
  fourBarCardFixture,
  scotchYokeOnRodFixture,
} from './library-card-fixtures';

/** A cycle in six seconds at 1x, the pace the rest of the library opens at. */
const LIBRARY_RPM = 10;

/**
 * The library's first four-bar was drawn at full object size, and these two are
 * drawn on its pins, so they keep its size and look like the card they replace.
 */
const FOUR_BAR_OBJECT_SCALE = 1 * MODEL_SCALE;

/** Library cards drawn for a reader; see library-card-fixtures.ts. */
export const LIBRARY_CARD_GALLERY: GalleryEntry[] = [
  {
    name: 'Four-bar with a coupler point',
    purpose:
      'A crank-rocker whose coupler carries a traced point, drawing its curve from the start',
    spec: 'library-cards.spec.ts',
    floatingSlot: false,
    objectScale: FOUR_BAR_OBJECT_SCALE,
    speed: { rpm: LIBRARY_RPM },
    fixture: fourBarCardFixture(),
  },
  {
    name: 'Four-bar with fixed lengths',
    purpose: 'The same pins, with the crank holding its angle and the other two bars their lengths',
    spec: 'library-cards.spec.ts',
    floatingSlot: false,
    objectScale: FOUR_BAR_OBJECT_SCALE,
    speed: { rpm: LIBRARY_RPM },
    fixture: fixedLengthFourBarFixture(),
  },
  {
    name: 'Pumpjack, driven at the crank',
    purpose: 'The crank turns right round and the beam nods once per turn, as a real one does',
    spec: 'library-cards.spec.ts',
    floatingSlot: false,
    speed: { rpm: LIBRARY_RPM },
    fixture: crankDrivenPumpjackFixture(),
  },
  {
    name: 'Scotch yoke on a guided rod',
    purpose: 'A disc crank works a yoke welded to a rod that slides through two bearings',
    spec: 'library-cards.spec.ts',
    floatingSlot: true,
    slide: true,
    speed: { rpm: LIBRARY_RPM },
    fixture: scotchYokeOnRodFixture(),
  },
];
