import { DRAWING_STYLES, drawingScale, readDrawingStyle, storeDrawingStyle } from './drawing-style';

describe('drawing styles', () => {
  it('grows with geometry between the screen limits instead of fixing every zoom to one size', () => {
    expect(drawingScale(60, 1, 'standard')).toBe(60);
    expect(drawingScale(60, 1.25, 'standard')).toBe(60);
    expect(drawingScale(60, 2, 'standard') * 2).toBe(90);
    expect(drawingScale(60, 0.1, 'standard') * 0.1).toBe(40);
  });

  it('bounds every style at extreme metric and imperial drawing scales', () => {
    for (const base of [0.0001, 1, 140, 100000]) {
      for (const zoom of [0.0001, 0.01, 1, 100, 10000]) {
        const pixels = DRAWING_STYLES.map((style) => drawingScale(base, zoom, style) * zoom);
        expect(pixels.every((p) => p >= 20 && p <= 90)).toBe(true);
        expect(pixels[0]).toBeGreaterThan(pixels[1]);
        expect(pixels[1]).toBeGreaterThan(pixels[2]);
      }
    }
  });

  it('uses model proportions before a viewport exists', () => {
    expect(drawingScale(100, 0, 'standard')).toBe(100);
    expect(drawingScale(100, NaN, 'fine')).toBe(60);
  });

  it('migrates Lines once and remembers the complete style thereafter', () => {
    const oldStyle = localStorage.getItem('drawingStyle');
    const oldLines = localStorage.getItem('lineDrawing');
    try {
      localStorage.removeItem('drawingStyle');
      localStorage.setItem('lineDrawing', 'true');
      expect(readDrawingStyle()).toBe('schematic');
      storeDrawingStyle('fine');
      expect(readDrawingStyle()).toBe('fine');
    } finally {
      for (const [key, value] of [
        ['drawingStyle', oldStyle],
        ['lineDrawing', oldLines],
      ]) {
        if (value === null) localStorage.removeItem(key!);
        else localStorage.setItem(key!, value!);
      }
    }
  });
});
