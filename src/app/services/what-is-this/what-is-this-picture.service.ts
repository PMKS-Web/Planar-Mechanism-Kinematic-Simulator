import { ApplicationRef, Injectable, inject } from '@angular/core';
import { DrawingStyle } from '../../model/drawing-style';
import { BackgroundImage, BackgroundImageService } from '../background-image.service';
import { MechanismService } from '../mechanism.service';
import { SettingsService } from '../settings.service';
import { SvgGridService } from '../svg-grid.service';
import { Box, boxAround, CAPTURE, motionOutline, tileFrame, tileLabels } from './picture-layout';
import { embedReferencedFiles, PictureTile, renderSheet } from './picture-raster';
import { pictureSvg } from './picture-svg';

/** One moment of the cycle the picture shows, as the fact sheet lists it. */
export interface PictureMoment {
  /** Seconds into the machine's own cycle: one of its solved samples' times. */
  time: number;
  label: string;
}

/**
 * The picture "What is this?" sends with a machine's fact sheet: the machine
 * at the moments its sheet lists, tiled on one PNG.
 *
 * Taken from the canvas itself, as the evaluated prototype took it with a
 * browser (`prototype/what-is-this/run/schematic.mjs`): in the Schematic style,
 * joint letters and traced paths on, the center-of-mass marks off, zoomed so
 * the machine's whole cycle fills a 960 by 700 window. None of that is the
 * reader's view, so all of it is set for the capture and put back inside one
 * task, and the reader never sees their mechanism move or change style.
 */
@Injectable({ providedIn: 'root' })
export class WhatIsThisPictureService {
  private mechanism = inject(MechanismService);
  private settings = inject(SettingsService);
  private svgGrid = inject(SvgGridService);
  private backdrop = inject(BackgroundImageService);
  private appRef = inject(ApplicationRef);
  /** The ground marks and input arrows each tile points at, fetched once. */
  private files = new Map<string, Promise<string | undefined>>();

  /**
   * The picture as a base64 PNG with no `data:` prefix, or undefined for a
   * machine that does not run or a canvas that is not there to draw.
   *
   * Must not be called during change detection: the capture renders the app.
   */
  async capture(
    machineIndex: number,
    moments: readonly PictureMoment[],
    withBackdrop: boolean
  ): Promise<string | undefined> {
    const tiles = this.takeTiles(machineIndex, moments, withBackdrop);
    if (!tiles?.length) return undefined;
    const standalone = await Promise.all(
      tiles.map(async (tile) => ({
        ...tile,
        svg: await embedReferencedFiles(tile.svg, this.files),
      }))
    );
    return renderSheet(standalone);
  }

  /** Every tile's SVG. Synchronous: whatever it changes is put back before it returns. */
  private takeTiles(
    index: number,
    moments: readonly PictureMoment[],
    withBackdrop: boolean
  ): PictureTile[] | undefined {
    const machine = this.mechanism.mechanisms[index];
    const canvas = document.querySelector('svg#canvas') as SVGSVGElement | null;
    const own = machine?.isMechanismValid() ? boxAround(machine.joints.flat()) : undefined;
    if (!canvas || !own || !this.svgGrid.panZoomObject) return undefined;
    const image = withBackdrop ? this.backdrop.image() : null;
    const labels = tileLabels(moments, !!image);
    const putBack = this.dressForThePicture();
    try {
      const tiles: PictureTile[] = [];
      if (image) {
        // Tile 0: the author's picture once, with every machine at its start,
        // framed on the picture and on every machine's whole cycle.
        const everything = [...this.mechanism.mechanisms.flatMap((m) => m?.joints.flat() ?? [])];
        const whole = unionOf(boxAround(everything) ?? own, imageBox(image));
        const zoom = this.zoomToFill(whole);
        const frame = tileFrame(onScreen(whole, zoom));
        const outline = motionOutline(tileFrame(onScreen(own, zoom)), frame);
        this.mechanism.lookAt(index, [0], () => {
          this.appRef.tick();
          tiles.push(this.tile(canvas, { frame, zoom, keepBackdrop: true, outline }, labels[0]));
        });
      }
      const zoom = this.zoomToFill(own);
      const frame = tileFrame(onScreen(own, zoom));
      const motionLabels = labels.slice(labels.length - moments.length);
      this.mechanism.lookAt(
        index,
        moments.map((moment) => moment.time),
        () => {
          this.appRef.tick();
          const label = motionLabels[tiles.length - (image ? 1 : 0)];
          tiles.push(this.tile(canvas, { frame, zoom, keepBackdrop: false }, label));
        }
      );
      return tiles;
    } finally {
      putBack();
      this.appRef.tick();
    }
  }

  private tile(
    canvas: SVGSVGElement,
    options: Parameters<typeof pictureSvg>[1],
    label: string
  ): PictureTile {
    return {
      svg: pictureSvg(canvas, options),
      width: options.frame.width,
      height: options.frame.height,
      label,
    };
  }

  /**
   * Zoom the canvas so a box in model units fills the capture window less its
   * margin, and say the zoom it took.
   *
   * The library applies a zoom to the page on the next animation frame, so
   * the reader's view, put back before then, is never drawn at this one; the
   * app's marks and letters, which size themselves by the zoom, are.
   */
  private zoomToFill(box: Box): number {
    const target = Math.min(
      (CAPTURE.width - 2 * CAPTURE.pad) / Math.max(box.x1 - box.x0, 1e-9),
      (CAPTURE.height - 2 * CAPTURE.pad) / Math.max(box.y1 - box.y0, 1e-9)
    );
    const panZoom = this.svgGrid.panZoomObject;
    const relative = (target * panZoom.getZoom()) / this.svgGrid.getZoom();
    this.svgGrid.ourOwnMove(() => panZoom.zoom(relative));
    // Refused past the app's zoom limits: draw at the zoom it has.
    return this.svgGrid.getZoom();
  }

  /**
   * Set the view the picture was evaluated in, and return how to put the
   * reader's back.
   */
  private dressForThePicture(): () => void {
    const panZoom = this.svgGrid.panZoomObject;
    const view = { zoom: panZoom.getZoom(), pan: panZoom.getPan() };
    const shown: [{ next(value: boolean): void; value: boolean }, boolean][] = [
      [this.settings.isShowID, true],
      [this.settings.isShowTraces, true],
      [this.settings.isShowCOM, false],
    ];
    const held = shown.map(([subject]) => subject.value);
    const style: DrawingStyle = this.settings.drawingStyle.value;
    shown.forEach(([subject, value]) => subject.value !== value && subject.next(value));
    if (style !== 'schematic') this.settings.drawingStyle.next('schematic');
    return () => {
      if (style !== 'schematic') this.settings.drawingStyle.next(style);
      shown.forEach(([subject], i) => subject.value !== held[i] && subject.next(held[i]));
      this.svgGrid.ourOwnMove(() => {
        panZoom.zoom(view.zoom);
        panZoom.pan(view.pan);
      });
    };
  }
}

/** A box in model units, in the tile's space: y flipped, as the canvas draws it. */
function onScreen(box: Box, zoom: number): Box {
  return { x0: box.x0 * zoom, x1: box.x1 * zoom, y0: -box.y1 * zoom, y1: -box.y0 * zoom };
}

function unionOf(a: Box, b: Box | undefined): Box {
  if (!b) return a;
  return {
    x0: Math.min(a.x0, b.x0),
    y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1),
    y1: Math.max(a.y1, b.y1),
  };
}

/** The background image's extent in model units, turned as it is drawn. */
function imageBox(image: BackgroundImage): Box | undefined {
  if (!(image.naturalWidth > 0)) return undefined;
  const half = {
    x: image.width / 2,
    y: (image.width * image.naturalHeight) / image.naturalWidth / 2,
  };
  const cos = Math.cos(image.rotationRad);
  const sin = Math.sin(image.rotationRad);
  return boxAround(
    [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].map(([sx, sy]) => ({
      x: image.centerX + sx * half.x * cos - sy * half.y * sin,
      y: image.centerY + sx * half.x * sin + sy * half.y * cos,
    }))
  );
}
