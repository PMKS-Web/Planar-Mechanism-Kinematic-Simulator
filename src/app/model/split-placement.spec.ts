import { Coord } from './coord';
import { BAR_HALF_SCALE } from './joint-marks';
import { placeSplitPins } from './split-placement';

const SCALE = 140;
const AT = new Coord(0, 0);
/** Two bar half-widths and the daylight between them. */
const CLEARANCE = 2 * BAR_HALF_SCALE * SCALE + 0.2 * SCALE;
const LENGTH = 600;

const toward = (degrees: number, length = LENGTH): Coord =>
  new Coord(
    length * Math.cos((degrees * Math.PI) / 180),
    length * Math.sin((degrees * Math.PI) / 180)
  );
const bars = (...degrees: number[]) => degrees.map((angle) => ({ ends: [toward(angle)] }));
const distance = (a: Coord, b: Coord) => Math.hypot(a.x - b.x, a.y - b.y);
function offBar(p: Coord, a: Coord, b: Coord): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
/** No pin within a clearance of another body's bar, and no two pins that close. */
function clearsEverything(placed: Coord[], ends: Coord[]): boolean {
  return placed.every((pin, i) =>
    placed.every(
      (other, j) =>
        i === j ||
        (distance(pin, other) >= CLEARANCE - 1e-6 &&
          offBar(pin, other, ends[j]) >= CLEARANCE - 1e-6)
    )
  );
}

describe('placeSplitPins', () => {
  it('keeps the chosen pin and moves the other only along its own link', () => {
    const [kept, moved] = placeSplitPins(AT, bars(0, 90), SCALE, 0);
    expect([kept.x, kept.y]).toEqual([0, 0]);
    expect(moved.x).toBeCloseTo(0);
    expect(moved.y).toBeGreaterThanOrEqual(CLEARANCE - 1e-6);
    expect(moved.y).toBeLessThan(CLEARANCE + 0.05 * SCALE);
  });

  it('separates links pointing opposite ways by the least that clears them', () => {
    const [, moved] = placeSplitPins(AT, bars(0, 180), SCALE, 0);
    expect(moved.y).toBeCloseTo(0);
    expect(-moved.x).toBeGreaterThanOrEqual(CLEARANCE - 1e-6);
    expect(-moved.x).toBeLessThan(CLEARANCE + 0.05 * SCALE);
  });

  it('steps sideways when two links lie almost on top of each other', () => {
    const placed = placeSplitPins(AT, bars(0, 8), SCALE, 0);
    expect(clearsEverything(placed, [toward(0), toward(8)])).toBe(true);
    // Along the link alone it would have to go seven clearances out.
    expect(distance(placed[1], AT)).toBeLessThan(2 * CLEARANCE);
  });

  it.each([
    [4, [0, 90, 180, 270]],
    [6, [0, 60, 120, 180, 240, 300]],
    [5, [0, 20, 95, 200, 330]],
  ])('clears every bar at a %s-link joint', (_, angles) => {
    const placed = placeSplitPins(AT, bars(...angles), SCALE, 0);
    expect(
      clearsEverything(
        placed,
        angles.map((angle) => toward(angle))
      )
    ).toBe(true);
    placed.forEach((pin) => expect(distance(pin, AT)).toBeLessThanOrEqual(3 * CLEARANCE));
  });

  it('never folds a short link back over its own far end', () => {
    const short = { ends: [toward(90, 0.6 * CLEARANCE)] };
    const [, moved] = placeSplitPins(AT, [{ ends: [toward(0)] }, short], SCALE, 0);
    expect(distance(moved, short.ends[0])).toBeGreaterThanOrEqual(0.4 * SCALE - 1e-6);
  });

  it('lets a pin in the middle of a straight bar go either way along it', () => {
    const middle = { ends: [toward(45), toward(225)] };
    const [, moved] = placeSplitPins(AT, [{ ends: [toward(135)] }, middle], SCALE, 0);
    expect(Math.abs(moved.x - moved.y)).toBeLessThan(1e-6);
    expect(distance(moved, AT)).toBeGreaterThan(0);
  });

  it('moves every rider clear of a block and off its slot line', () => {
    const placed = placeSplitPins(AT, bars(45, 135), SCALE, undefined, { angle: 0 });
    placed.forEach((pin) => expect(Math.abs(pin.y)).toBeGreaterThanOrEqual(CLEARANCE - 1e-6));
    expect(distance(placed[0], placed[1])).toBeGreaterThanOrEqual(CLEARANCE - 1e-6);
  });
});
