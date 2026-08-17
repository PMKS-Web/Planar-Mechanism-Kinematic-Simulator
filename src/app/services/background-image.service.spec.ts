import { TestBed } from '@angular/core/testing';
import { BackgroundImageService, BackgroundImage } from './background-image.service';
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

    it('refuses to shrink the picture to nothing', () => {
      service.image.set(placed());
      service.place({ width: 0 });
      expect(service.image()!.width).toBeGreaterThan(0);
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

  it('remove clears the picture', () => {
    service.image.set(placed());
    service.remove();
    expect(service.image()).toBeNull();
  });
});
