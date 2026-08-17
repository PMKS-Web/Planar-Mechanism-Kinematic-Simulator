import { Injectable, signal } from '@angular/core';
import { MODEL_SCALE } from '../model/render-scale';

/**
 * A picture pinned behind the grid, for building a linkage on top of one.
 *
 * Everything here is in internal model units (see MODEL_SCALE), the same units
 * a Joint's x and y are in, so the placement numbers can be handed straight to
 * the SVG alongside the mechanism's own geometry.
 */
export interface BackgroundImage {
  /** The picture itself, as a data URL: the file is never uploaded anywhere. */
  src: string;
  /** The file's own pixel size, which fixes the aspect ratio. */
  naturalWidth: number;
  naturalHeight: number;
  /** Where the middle of the picture sits, in model units. */
  centerX: number;
  centerY: number;
  /** How wide the picture is drawn, in model units. Height follows the ratio. */
  width: number;
  /** 0..1. A tracing underlay wants to be visible *through*, not just under. */
  opacity: number;
  /** The name of the file it came from, for the panel to show. */
  fileName: string;
}

/** The largest file we will read, in bytes. */
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

/** Nothing narrower than this is a picture you could trace anything against. */
const MIN_WIDTH = 0.05 * MODEL_SCALE;

@Injectable({ providedIn: 'root' })
export class BackgroundImageService {
  /**
   * The one picture, or none.
   *
   * Deliberately outside the URL codec and outside the undo history: an image
   * is megabytes and a shared URL is a few hundred characters, so there is no
   * version of this that survives a link. The panel says so in as many words.
   */
  readonly image = signal<BackgroundImage | null>(null);

  /** How tall the picture is drawn, in model units — the ratio decides. */
  heightOf(image: BackgroundImage): number {
    return (image.width * image.naturalHeight) / image.naturalWidth;
  }

  /** The picture's left edge in SVG coordinates. */
  leftOf(image: BackgroundImage): number {
    return image.centerX - image.width / 2;
  }

  /**
   * The picture's top edge in SVG coordinates.
   *
   * The image layer is drawn unflipped, so a model y of +2 is an SVG y of -2 —
   * which is why this negates the centre rather than adding to it.
   */
  topOf(image: BackgroundImage): number {
    return -image.centerY - this.heightOf(image) / 2;
  }

  /**
   * Read a chosen file and place it, centred on the origin, sized to `fitWidth`.
   *
   * Rejects rather than guesses on anything it cannot decode: a broken data URL
   * drawn into the canvas is an invisible failure, and the caller turns this
   * into a message the user can act on.
   */
  async load(file: File, fitWidth: number): Promise<void> {
    if (!file.type.startsWith('image/')) {
      throw new Error(`${file.name} is not an image.`);
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error(
        `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${
          MAX_IMAGE_BYTES / 1024 / 1024
        } MB.`
      );
    }

    const src = await readAsDataURL(file);
    const { width, height } = await measure(src);

    this.image.set({
      src,
      naturalWidth: width,
      naturalHeight: height,
      centerX: 0,
      centerY: 0,
      width: Math.max(MIN_WIDTH, fitWidth),
      opacity: 0.5,
      fileName: file.name,
    });
  }

  /** Change part of the placement, leaving the picture itself alone. */
  place(change: Partial<Pick<BackgroundImage, 'centerX' | 'centerY' | 'width' | 'opacity'>>): void {
    const current = this.image();
    if (!current) return;
    this.image.set({
      ...current,
      ...change,
      width: Math.max(MIN_WIDTH, change.width ?? current.width),
      opacity: clamp(change.opacity ?? current.opacity, 0, 1),
    });
  }

  remove(): void {
    this.image.set(null);
  }
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`${file.name} could not be read.`));
    reader.readAsDataURL(file);
  });
}

function measure(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const probe = new Image();
    probe.onload = () => {
      if (!probe.naturalWidth || !probe.naturalHeight) {
        reject(new Error('That image has no size the browser could read.'));
        return;
      }
      resolve({ width: probe.naturalWidth, height: probe.naturalHeight });
    };
    probe.onerror = () => reject(new Error('That image could not be decoded.'));
    probe.src = src;
  });
}
