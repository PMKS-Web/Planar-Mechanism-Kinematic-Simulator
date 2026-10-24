import { Coord } from './coord';
import { BAR_HALF_SCALE, MARK, R_PER_SCALE } from './joint-marks';

/** One pin leaving the split point, and the other joints of the body it holds. */
export interface SplitPin {
  ends: Coord[];
}

/** A slider block the riders must step clear of, with the slot it runs in. */
export interface SplitBlock {
  angle: number;
}

/** Daylight left between two bars once they are apart, as a share of objectScale. */
const BAR_GAP_FACTOR = 0.2;
/** Two pins this far apart can each be grabbed: the gap a two-link split leaves. */
const PIN_GAP_FACTOR = 0.4;
/** The farthest a pin is moved, in bar clearances, before the search settles for less. */
const MAX_REACH_CLEARANCES = 3;
/**
 * A step sideways turns the link; a step along it only shortens it. Sideways
 * is charged double, so a pin goes along its own link wherever that clears,
 * and sideways only when two links lie too close to part that way.
 */
const SIDEWAYS_COST = 2;
/** Search resolution, as a share of objectScale. */
const STEP_FACTOR = 0.05;

/**
 * Where each pin goes once a joint splits.
 *
 * Bars that met at one point lie on top of each other there, so spreading the
 * pins around a circle left them overlapping -- and moved every link. Instead
 * one body keeps the point (`stays`; or none, when a slider block is what
 * stays), and each other pin takes the smallest move that clears every bar
 * already placed: along its own link first, which reshapes nothing but that
 * link, and sideways only when two links lie almost on top of each other. A
 * pin never folds back over its own far end, and goes no farther than a few
 * bar widths; where nothing clears within that, it takes the placement that
 * comes closest.
 */
export function placeSplitPins(
  at: Coord,
  pins: SplitPin[],
  scale: number,
  stays: number | undefined,
  block?: SplitBlock
): Coord[] {
  const barHalf = BAR_HALF_SCALE * scale;
  const clearance = 2 * barHalf + BAR_GAP_FACTOR * scale;
  const pinGap = PIN_GAP_FACTOR * scale;
  const step = STEP_FACTOR * scale;
  const reach = MAX_REACH_CLEARANCES * clearance;
  const placed: [Coord, Coord][] = [];
  const placedPins: Coord[] = [];
  const result: Coord[] = pins.map(() => at);
  if (stays !== undefined) {
    placedPins.push(at);
    pins[stays].ends.forEach((end) => placed.push([at, end]));
  }

  pins.forEach((pin, index) => {
    if (index === stays) return;
    let best: { at: Coord; cost: number } | undefined;
    let closest: { at: Coord; margin: number } | undefined;
    // Toward any of the body's other joints is "along it": a pin in the middle
    // of a straight bar has two ways to go, and the average of them is nowhere.
    for (const along of directions(at, pin.ends, spreadAngle(index, pins.length))) {
      const ux = Math.cos(along);
      const uy = Math.sin(along);
      for (let side = 0; side <= reach; side += step) {
        if (best && SIDEWAYS_COST * side >= best.cost) break;
        for (const sign of side === 0 ? [1] : [1, -1]) {
          for (let forward = 0; forward <= reach; forward += step) {
            const cost = forward + SIDEWAYS_COST * side;
            if (best && cost >= best.cost) break;
            const s = sign * side;
            const candidate = new Coord(at.x + forward * ux - s * uy, at.y + forward * uy + s * ux);
            const margin = marginAt(candidate, pin.ends);
            if (margin >= 0) best = { at: candidate, cost };
            else if (!closest || margin > closest.margin) closest = { at: candidate, margin };
          }
        }
      }
    }
    const chosen = best?.at ?? closest!.at;
    result[index] = chosen;
    placedPins.push(chosen);
    pin.ends.forEach((end) => placed.push([chosen, end]));
  });
  return result;

  /**
   * How far this candidate is inside clear space; negative where it overlaps.
   * Only what happens at the pins counts: no pin on another bar, and no bar
   * over another pin. Bars that cross farther along -- a scissor's two arms
   * -- were drawn crossing, and no move of a pin could change that.
   */
  function marginAt(candidate: Coord, ends: Coord[]): number {
    let margin = Infinity;
    for (const [a, b] of placed) {
      margin = Math.min(margin, pointSegmentDistance(candidate, a, b) - clearance);
    }
    // A bar that runs on through the old point -- the arm a scissor's center
    // pin sits in the middle of -- crossed the other bodies there before the
    // split and still does; only a bend could change that, and a bend is not
    // a move along the link.
    const across = ends.filter(
      (end) =>
        !(
          distance(candidate, at) > 1e-9 &&
          distance(end, at) > 1e-9 &&
          pointSegmentDistance(at, candidate, end) < 1e-6 * scale
        )
    );
    for (const pinAt of placedPins) {
      margin = Math.min(margin, distance(candidate, pinAt) - clearance);
      for (const end of across) {
        margin = Math.min(margin, pointSegmentDistance(pinAt, candidate, end) - clearance);
      }
    }
    for (const end of ends) margin = Math.min(margin, distance(candidate, end) - pinGap);
    if (block) {
      margin = Math.min(margin, outsideBlock(candidate) - barHalf - BAR_GAP_FACTOR * scale);
      // Off the slot's own line too, so a rider is not left lying along the channel.
      const slotA = new Coord(
        at.x - reach * Math.cos(block.angle),
        at.y - reach * Math.sin(block.angle)
      );
      const slotB = new Coord(
        at.x + reach * Math.cos(block.angle),
        at.y + reach * Math.sin(block.angle)
      );
      margin = Math.min(margin, pointSegmentDistance(candidate, slotA, slotB) - clearance);
    }
    return margin;
  }

  /** Distance from a point to the drawn block's outline, zero inside it. */
  function outsideBlock(point: Coord): number {
    const r = R_PER_SCALE * scale;
    const dx = point.x - at.x;
    const dy = point.y - at.y;
    const cos = Math.cos(block!.angle);
    const sin = Math.sin(block!.angle);
    const along = Math.abs(dx * cos + dy * sin) - MARK.blockAlongHalf * r;
    const across = Math.abs(-dx * sin + dy * cos) - MARK.blockAcrossHalf * r;
    return Math.hypot(Math.max(along, 0), Math.max(across, 0));
  }
}

/** Every way along the body from the split point: toward each of its other joints. */
function directions(at: Coord, ends: Coord[], fallback: number): number[] {
  const toward = ends
    .filter((end) => Math.hypot(end.x - at.x, end.y - at.y) > 1e-9)
    .map((end) => Math.atan2(end.y - at.y, end.x - at.x));
  return toward.length > 0 ? toward : [fallback];
}

function spreadAngle(index: number, count: number): number {
  return (2 * Math.PI * index) / count + Math.PI / 2;
}

function distance(a: Coord, b: Coord): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pointSegmentDistance(p: Coord, a: Coord, b: Coord): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t =
    length < 1e-18 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
