import { Coord } from './coord';

/** The preview and commit stay free unless Option requests an angle snap. */
export function placementBearing(start: Coord | undefined, end: Coord, snap: boolean): Coord {
  if (!start || !snap) return end;
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  if (length < 1e-9) return end;
  const step = Math.PI / 12;
  const angle = Math.round(Math.atan2(end.y - start.y, end.x - start.x) / step) * step;
  return new Coord(start.x + length * Math.cos(angle), start.y + length * Math.sin(angle));
}
