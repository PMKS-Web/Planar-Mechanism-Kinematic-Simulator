import { uniformBodyOf } from './uniform-body';

// Checked against the closed forms every statics text carries, not against the
// implementation: a rod is mL²/12, a rectangular plate m(w²+h²)/12, a triangle
// m(a²+b²+c²)/36. Auto-derived mass properties are only worth having if they
// are the numbers the textbook would print.

describe('a uniform body over a link skeleton', () => {
  it('treats two joints as a slender rod', () => {
    const body = uniformBodyOf([
      { x: 1, y: 2 },
      { x: 4, y: 6 },
    ]);
    expect(body.centroid.x).toBeCloseTo(2.5, 12);
    expect(body.centroid.y).toBeCloseTo(4, 12);
    expect(body.gyrationSq).toBeCloseTo(25 / 12, 12);
  });

  it('treats four corners as a rectangular plate', () => {
    const body = uniformBodyOf([
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 6, y: 2 },
      { x: 0, y: 2 },
    ]);
    expect(body.centroid.x).toBeCloseTo(3, 12);
    expect(body.centroid.y).toBeCloseTo(1, 12);
    expect(body.gyrationSq).toBeCloseTo((36 + 4) / 12, 12);
  });

  it('treats three joints as a triangular plate', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 4, y: 0 };
    const c = { x: 1, y: 3 };
    const body = uniformBodyOf([a, b, c]);
    expect(body.centroid.x).toBeCloseTo((a.x + b.x + c.x) / 3, 12);
    expect(body.centroid.y).toBeCloseTo((a.y + b.y + c.y) / 3, 12);
    const side = (p: { x: number; y: number }, q: { x: number; y: number }) =>
      (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
    expect(body.gyrationSq).toBeCloseTo((side(a, b) + side(b, c) + side(c, a)) / 36, 12);
  });

  it('falls back to the rod when the joints are collinear', () => {
    // A tracer on the bar's own axis must not turn the bar into a zero-area
    // plate; it stays the rod between the farthest pair.
    const body = uniformBodyOf([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 5, y: 0 },
    ]);
    expect(body.centroid.x).toBeCloseTo(2.5, 12);
    expect(body.gyrationSq).toBeCloseTo(25 / 12, 12);
  });

  it('ignores a joint interior to the hull', () => {
    // The plate is the drawn shape, and the drawn shape is the hull: a joint
    // strictly inside it adds no material.
    const withInterior = uniformBodyOf([
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 6, y: 2 },
      { x: 0, y: 2 },
      { x: 3, y: 1 },
    ]);
    expect(withInterior.gyrationSq).toBeCloseTo((36 + 4) / 12, 12);
  });

  it('shrugs at duplicates and degenerate input rather than dividing by zero', () => {
    expect(uniformBodyOf([]).gyrationSq).toBe(0);
    expect(uniformBodyOf([{ x: 1, y: 1 }]).gyrationSq).toBe(0);
    const doubled = uniformBodyOf([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 3, y: 0 },
    ]);
    expect(doubled.gyrationSq).toBeCloseTo(9 / 12, 12);
  });
});
