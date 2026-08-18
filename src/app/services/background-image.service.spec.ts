import { TestBed } from '@angular/core/testing';
import { BackgroundImageService, BackgroundImage, MIN_WIDTH } from './background-image.service';
import { SettingsService } from './settings.service';
import { LengthUnit } from '../model/unit-enums';
import { MODEL_SCALE } from '../model/render-scale';

/** A placed picture with a known 2:1 shape, so the derived height is checkable. */
function placed(over: Partial<BackgroundImage> = {}): BackgroundImage {
  return {
    src: 'data:image/png;base64,AAAA',
    naturalWidth: 400,
    naturalHeight: 200,
    centerX: 0,
    centerY: 0,
    width: 4 * MODEL_SCALE,
    rotationRad: 0,
    opacity: 0.5,
    fileName: 'rig.png',
    ...over,
  };
}

describe('BackgroundImageService', () => {
  let service: BackgroundImageService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(BackgroundImageService);
  });

  it('starts with nothing behind the grid', () => {
    expect(service.image()).toBeNull();
  });

  describe('geometry', () => {
    it('derives the height from the file’s own proportions', () => {
      const image = placed();
      expect(service.heightOf(image)).toBe(2 * MODEL_SCALE);
    });

    it('keeps those proportions when the width changes', () => {
      service.image.set(placed());
      service.place({ width: 10 * MODEL_SCALE });
      expect(service.heightOf(service.image()!)).toBe(5 * MODEL_SCALE);
    });

    it('places the left edge half a width left of centre', () => {
      const image = placed({ centerX: 3 * MODEL_SCALE });
      expect(service.leftOf(image)).toBe(MODEL_SCALE);
    });

    /**
     * The image layer is drawn unflipped while the model has y up, so a picture
     * centred above the axis has to be at a negative SVG y. Getting this
     * backwards mirrors the underlay about the x axis, which is invisible on a
     * symmetric picture and wrong on every other one.
     */
    it('flips y, because the image layer is drawn in SVG coordinates', () => {
      const image = placed({ centerY: 5 * MODEL_SCALE });
      expect(service.topOf(image)).toBe(-6 * MODEL_SCALE);
    });
  });

  describe('place', () => {
    it('changes only the field it is given', () => {
      service.image.set(placed());
      service.place({ centerX: 2 * MODEL_SCALE });
      const image = service.image()!;
      expect(image.centerX).toBe(2 * MODEL_SCALE);
      expect(image.centerY).toBe(0);
      expect(image.width).toBe(4 * MODEL_SCALE);
      expect(image.opacity).toBe(0.5);
      expect(image.src).toBe('data:image/png;base64,AAAA');
    });

    // The floor exists for the corner drag, which can be pulled through zero.
    // A typed width below it is refused by the panel instead, so the number in
    // the field is always the number that took effect.
    it('holds the picture at its minimum width rather than letting it vanish', () => {
      service.image.set(placed());
      service.place({ width: 0 });
      expect(service.image()!.width).toBe(MIN_WIDTH);
    });

    it('holds opacity inside 0..1', () => {
      service.image.set(placed());
      service.place({ opacity: 4 });
      expect(service.image()!.opacity).toBe(1);
      service.place({ opacity: -1 });
      expect(service.image()!.opacity).toBe(0);
    });

    it('does nothing when there is no picture', () => {
      service.place({ centerX: 5 });
      expect(service.image()).toBeNull();
    });
  });

  describe('load', () => {
    it('refuses a file that is not an image', async () => {
      const file = new File(['not a picture'], 'notes.txt', { type: 'text/plain' });
      await expect(service.load(file, MODEL_SCALE)).rejects.toThrow(/not an image/);
      expect(service.image()).toBeNull();
    });

    it('refuses a file too large to hold in memory', async () => {
      const file = new File(['x'], 'huge.png', { type: 'image/png' });
      // A real 13 MB buffer would slow every run of this suite; the guard reads
      // the reported size, so a reported size is what it is given.
      Object.defineProperty(file, 'size', { value: 13 * 1024 * 1024 });
      await expect(service.load(file, MODEL_SCALE)).rejects.toThrow(/limit is 12 MB/);
      expect(service.image()).toBeNull();
    });
  });

  /**
   * A unit change rescales every stored coordinate in the drawing, so a picture
   * that stayed put would be left the conversion factor's worth of wrong size
   * against the very linkage it was put there to be traced by.
   */
  describe('a change of length unit', () => {
    let settings: SettingsService;

    beforeEach(() => {
      settings = TestBed.inject(SettingsService);
      settings.lengthUnit.next(LengthUnit.CM);
      service.image.set(placed({ centerX: 3 * MODEL_SCALE, centerY: -1 * MODEL_SCALE }));
    });

    it('restates the placement in the new unit', () => {
      settings.lengthUnit.next(LengthUnit.METER);
      const image = service.image()!;
      // A centimetre is a hundredth of a metre, so every number is too.
      expect(image.centerX).toBeCloseTo(0.03 * MODEL_SCALE, 6);
      expect(image.centerY).toBeCloseTo(-0.01 * MODEL_SCALE, 6);
      expect(image.width).toBeCloseTo(0.04 * MODEL_SCALE, 6);
    });

    it('leaves the picture and its proportions alone', () => {
      settings.lengthUnit.next(LengthUnit.INCH);
      const image = service.image()!;
      expect(image.src).toBe('data:image/png;base64,AAAA');
      expect(service.heightOf(image) / image.width).toBeCloseTo(0.5, 9);
    });

    it('does nothing when the unit is set to the one already in force', () => {
      const before = service.image()!;
      settings.lengthUnit.next(LengthUnit.CM);
      expect(service.image()).toBe(before);
    });

    it('is harmless with no picture placed', () => {
      service.remove();
      expect(() => settings.lengthUnit.next(LengthUnit.METER)).not.toThrow();
      expect(service.image()).toBeNull();
    });
  });

  /**
   * The stored angle is counter-clockwise-positive like every other angle in
   * the app; SVG's rotate is clockwise-positive because its y points down. A
   * transform that forgot the sign turns the picture the wrong way, which on a
   * photograph of a linkage looks like a mirror rather than a mistake.
   */
  describe('the turn', () => {
    it('is the identity when the picture is square to the grid', () => {
      const image = placed({ centerX: 2 * MODEL_SCALE, centerY: MODEL_SCALE });
      expect(service.transformOf(image)).toBe(`rotate(0, ${2 * MODEL_SCALE}, ${-MODEL_SCALE})`);
    });

    it('goes to SVG the other way round, about the picture’s own centre', () => {
      const image = placed({ centerX: 0, centerY: 2 * MODEL_SCALE, rotationRad: Math.PI / 2 });
      expect(service.transformOf(image)).toBe(`rotate(-90, 0, ${-2 * MODEL_SCALE})`);
    });

    it('is placed like any other part of the placement', () => {
      service.image.set(placed());
      service.place({ rotationRad: Math.PI / 4 });
      expect(service.image()!.rotationRad).toBeCloseTo(Math.PI / 4, 9);
      expect(service.image()!.width).toBe(4 * MODEL_SCALE);
    });

    it('survives a change of length unit, which rescales rather than turns', () => {
      const settings = TestBed.inject(SettingsService);
      settings.lengthUnit.next(LengthUnit.CM);
      service.image.set(placed({ rotationRad: Math.PI / 6 }));
      settings.lengthUnit.next(LengthUnit.METER);
      expect(service.image()!.rotationRad).toBeCloseTo(Math.PI / 6, 9);
    });
  });

  it('remove clears the picture', () => {
    service.image.set(placed());
    service.remove();
    expect(service.image()).toBeNull();
  });
});
