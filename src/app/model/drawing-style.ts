/** Presentation only. Never use these sizes for constraints, coordinates, or exports. */
export type DrawingStyle = 'standard' | 'fine' | 'schematic';

export const DRAWING_STYLES: readonly DrawingStyle[] = ['standard', 'fine', 'schematic'];

// One unit of scale draws a pin with diameter 0.3. In the middle of this
// range marks grow with the drawing; only the extremes stay screen-readable.
const STYLES = {
  standard: { factor: 1, min: 40, max: 90 },
  fine: { factor: 0.6, min: 25, max: 50 },
  schematic: { factor: 0.48, min: 24, max: 38 },
} as const;

export function drawingScale(base: number, zoom: number, style: DrawingStyle): number {
  const { factor, min, max } = STYLES[style];
  if (!(zoom > 0) || !Number.isFinite(zoom)) return base * factor;
  return Math.max(min, Math.min(max, base * factor * zoom)) / zoom;
}

export function readDrawingStyle(): DrawingStyle {
  try {
    const stored = localStorage.getItem('drawingStyle');
    if (DRAWING_STYLES.includes(stored as DrawingStyle)) return stored as DrawingStyle;
    return localStorage.getItem('lineDrawing') === 'true' ? 'schematic' : 'standard';
  } catch {
    return 'standard';
  }
}

export function storeDrawingStyle(style: DrawingStyle): void {
  try {
    localStorage.setItem('drawingStyle', style);
  } catch {
    // A private or embedded view can still choose a style for this visit.
  }
}
