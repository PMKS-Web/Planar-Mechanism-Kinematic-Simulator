import type { RealJoint } from '../model/joint';

/**
 * The canvas, as the pan-zoom service and the Edit panel need it.
 *
 * `SvgGridService` and `EditPanelComponent` used to reach `NewGridComponent`
 * through its static instance, which made a service import a component -- and
 * through that component every panel, and through the panels the blocks that
 * the services are imported by. A cycle esbuild happens to tolerate; an
 * unbundled module graph does not (see `joint-drag-state.ts`). So the canvas
 * registers itself here, under the few things they ask of it, and they import
 * this file alone.
 */

/** A center-of-mass distance the Edit panel asks the canvas to draw while a CoM field is pointed at. */
export interface ComMeasure {
  axis: 'x' | 'y';
  origin: { x: number; y: number };
  com: { x: number; y: number };
  /* 'origin' measures along the frame origin's own line with a dashed run up
     to the mark; 'axis' (the global-grid frame) measures at the CoM's height
     straight to the grid's axis line, which needs no connector. */
  mode: 'origin' | 'axis';
}

export interface CanvasHandle {
  /** A tap that did not become a drag. */
  handleTap(): void;
  /** Let go of every gesture, on a release the canvas did not hear or a cancel nobody finished. */
  releaseCanvasGestures(event?: PointerEvent): void;
  /** Run once the panel has finished sliding, so a fit lands where the panel ends up. */
  afterGlide(run: () => void): void;
  enableGridAnimationForThisAction(): void;
  /** A synthesis pose or a group transform owns the pointer outside the drag state machine. */
  isGestureLive(): boolean;

  /* The show-me overlays a pointed-at Edit panel field asks for. */
  setComMeasureOverlay(measure: ComMeasure | undefined): void;
  setCylinderPartPreview(part: 'barrel' | 'rod' | 'head' | undefined): void;
  setSlotAngleOverlay(showing: boolean): void;
  setCylinderRangeOverlay(which: 'travel' | 'start' | undefined): void;
  /** -1 for the selected link, an index into `others` for one of the selected joint's neighbors, -2 for none. */
  setLinkLengthOverlay(index: number, others: readonly RealJoint[]): void;
  setLinkAngleOverlay(index: number, others: readonly RealJoint[]): void;
}

let canvas: CanvasHandle | undefined;

/** The canvas registers on construction and unregisters on destroy. */
export function registerCanvas(handle: CanvasHandle | undefined): void {
  canvas = handle;
}

/** Undefined when no canvas is on screen, and every caller already checks. */
export function canvasHandle(): CanvasHandle | undefined {
  return canvas;
}
