import { PATH_PRESETS, pathCurve, pathPreset } from './path-synthesis';

describe('a target path', () => {
  it('allows empty and single-point designs before a curve exists', () => {
    expect(pathCurve([], true, true)).toBe('');
    expect(pathCurve([{ x: 2, y: 3 }], true, true)).toBe('');
  });

  it('keeps an open line open and a closed polygon closed', () => {
    const p = [
      { x: 0, y: 0 },
      { x: 2, y: 3 },
      { x: 4, y: 0 },
    ];
    expect(pathCurve(p, false, false)).toBe('M 0 0 L 2 3 L 4 0');
    expect(pathCurve(p, true, false)).toBe('M 0 0 L 2 3 L 4 0 L 0 0 Z');
  });

  it('wraps the tangent through the closed seam', () => {
    const p = [
      { x: 0, y: 0 },
      { x: 6, y: 6 },
      { x: 12, y: 0 },
    ];
    const path = pathCurve(p, true, true);
    expect(path).toContain('M 0 0 C -1 1');
    expect(path).toContain('1 -1 0 0 Z');
  });

  it('keeps all the recovered shape choices finite after scaling', () => {
    for (const name of PATH_PRESETS) {
      const path = pathPreset(name, { x: 10, y: -3 }, 2);
      expect(path.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
      const before = path.points.map((p) => ({ ...p }));
      path.convertLengths(2.54);
      expect(path.points[0].x).toBeCloseTo(before[0].x * 2.54, 10);
      expect(path.curve).not.toMatch(/NaN|Infinity/);
    }
  });
});
