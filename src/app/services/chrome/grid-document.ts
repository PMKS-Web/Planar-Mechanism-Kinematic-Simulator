import { InjectionToken, inject } from '@angular/core';
import { LegacyGridDocumentService } from './legacy-grid-document.service';
import type { Rect } from '../view-framing';

/** Bounds use y-down viewport units (MODEL_SCALE per physical unit), like the SVG layer. */
export interface GridDocument {
  readonly objectScale: number;
  readonly objectScaleChosen: boolean;
  chooseObjectScale(): void;
  hasParts(): boolean;
  setObjectScale(scale: number): void;
  restate(): void;
  fullMotionBox(): Rect | null;
}
export const GRID_DOCUMENT = new InjectionToken<GridDocument>('GRID_DOCUMENT', {
  providedIn: 'root',
  factory: () => inject(LegacyGridDocumentService),
});
