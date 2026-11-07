import { MODEL_SCALE } from '../../app/model/render-scale';
import { LengthUnit } from '../../app/model/unit-enums';
import type { GalleryEntry } from './fixture-gallery';
import {
  LOCOMOTIVE_OBJECT_SCALE,
  PLIERS_OBJECT_SCALE,
  SUSPENSION_OBJECT_SCALE,
  crankDrivenPumpjackFixture,
  doubleWishboneFixture,
  dwellSixBarFixture,
  fixedLengthFourBarFixture,
  fourBarCardFixture,
  lockingPliersFixture,
  parallelogramFixture,
  scotchYokeOnRodFixture,
  steamLocomotiveFixture,
  toggleClampInInchesFixture,
  wattStraightLineFixture,
} from './library-card-fixtures';

/** A cycle in six seconds at 1x, the pace the rest of the library opens at. */
const LIBRARY_RPM = 10;

/**
 * Watt's arms only rock: the input swings up 29 degrees and down 57, so a
 * cycle is 172 degrees of command. 4 RPM puts that at 7.2 s, the slow end of
 * the window, as the Chebyshev line is: a line is something to watch drawn.
 */
const WATT_RPM = 4;

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
  {
    name: 'Parallelogram',
    purpose: 'Opposite links equal, so the coupler is carried round level and never turns',
    spec: 'library-cards.spec.ts',
    floatingSlot: false,
    speed: { rpm: LIBRARY_RPM },
    fixture: parallelogramFixture(),
  },
  {
    name: 'Watt straight-line mechanism',
    purpose: 'Two equal arms whose short coupler draws a figure eight with a straight middle',
    spec: 'library-cards.spec.ts',
    floatingSlot: false,
    speed: { rpm: WATT_RPM },
    fixture: wattStraightLineFixture(),
  },
  {
    name: 'Six-bar with a dwell',
    purpose: 'The output stands still for a third of every turn while the crank keeps going',
    spec: 'library-cards.spec.ts',
    floatingSlot: false,
    speed: { rpm: LIBRARY_RPM },
    fixture: dwellSixBarFixture(),
  },
  {
    name: 'Toggle clamp, in inches',
    purpose: 'The toggle clamp read in inches, pounds and pounds-force',
    spec: 'library-cards.spec.ts',
    floatingSlot: false,
    speed: { rpm: LIBRARY_RPM },
    lengthUnit: LengthUnit.INCH,
    fixture: toggleClampInInchesFixture(),
  },
  {
    name: 'Locking pliers',
    purpose:
      'A cylinder plays the hand: the jaw stops as the toggle link comes into line, and locks just past it',
    spec: 'library-cards.spec.ts',
    floatingSlot: true,
    slide: true,
    objectScale: PLIERS_OBJECT_SCALE,
    // 1.63 in of squeeze each way, so 6.5 s a cycle: slow enough to see the jaw
    // stop while the handle is still moving.
    speed: { unitsPerSecond: 0.5 },
    lengthUnit: LengthUnit.INCH,
    fixture: lockingPliersFixture(),
  },
  {
    name: 'Double-wishbone suspension',
    purpose:
      'Unequal arms tilt the wheel into the turn as it rises, and the tire hardly moves sideways',
    spec: 'library-cards.spec.ts',
    floatingSlot: true,
    slide: true,
    objectScale: SUSPENSION_OBJECT_SCALE,
    // 11.5 cm of shock travel each way: 5.75 s from full droop to full bump
    // and back.
    speed: { unitsPerSecond: 4 },
    fixture: doubleWishboneFixture(),
  },
  {
    name: 'Steam locomotive',
    purpose:
      'Three coupled wheels drawn as discs, and Walschaerts valve gear working a piston valve from the driving wheel',
    spec: 'library-cards.spec.ts',
    floatingSlot: false,
    slide: true,
    objectScale: LOCOMOTIVE_OBJECT_SCALE,
    speed: { rpm: LIBRARY_RPM },
    lengthUnit: LengthUnit.METER,
    fixture: steamLocomotiveFixture(),
  },
];
