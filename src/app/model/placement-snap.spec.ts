import { Coord } from './coord';
import { placementBearing } from './placement-snap';

describe('new link, cylinder, and force bearings', () => {
  it('leaves an unstarted or zero-length gesture alone', () => {
    const point = new Coord(7, -3);
    expect(placementBearing(undefined, point, true)).toBe(point);
    expect(placementBearing(point, point, true)).toBe(point);
  });

  it('snaps only with Option held, in every quadrant without changing length', () => {
    const start = new Coord(7, -3);
    for (let degrees = -179; degrees < 180; degrees += 7) {
      const end = new Coord(
        start.x + 10 * Math.cos((degrees * Math.PI) / 180),
        start.y + 10 * Math.sin((degrees * Math.PI) / 180)
      );
      const snapped = placementBearing(start, end, true);
      const angle = (Math.atan2(snapped.y - start.y, snapped.x - start.x) * 180) / Math.PI;
      expect(angle / 15).toBeCloseTo(Math.round(angle / 15), 8);
      expect(Math.hypot(snapped.x - start.x, snapped.y - start.y)).toBeCloseTo(10, 8);
      expect(placementBearing(start, end, false)).toBe(end);
    }
  });
});
