import { Coord } from './coord';

/** The preview and commit must use the same bearing, with Option as an escape. */
export function placementBearing(start: Coord | undefined, end: Coord, free: boolean): Coord {
  if (!start || free) return end;
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  if (length < 1e-9) return end;
  const step = Math.PI / 12;
  const angle = Math.round(Math.atan2(end.y - start.y, end.x - start.x) / step) * step;
  return new Coord(start.x + length * Math.cos(angle), start.y + length * Math.sin(angle));
}
