import { Joint } from './joint';
import { RealLink } from './link';
import { Cylinder, CylinderHolds, cylinderLengthsOf, stretchedCylinderPose } from './cylinder';
import { SettingsService } from '../services/settings.service';

interface Point {
  x: number;
  y: number;
}

/**
 * Where along its channel a block that is also a cylinder's end joint may be
 * put back (decision S22).
 *
 * Every other floating block is a point, so a reseat is two coordinates. This
 * one is one end of a rigid part, and the part has a shortest length: drag the
 * carrier right up against the cylinder's other end and there is a stretch of
 * channel the block cannot reach, because reaching it would mean the part
 * closing past its own stops.
 *
 * So the channel's answer is taken as far as the part can follow it, which is
 * what a rail and a cylinder do — the collar runs along the rail until the
 * cylinder bottoms out, and there it stops. **The answer is always on the
 * channel**: the block belongs in the hole it rides, and a compromise between
 * where it was and where the hole went is a block in neither.
 *
 * Found by searching rather than solved. The layout's yes/no is a clamp against
 * holds and floors as well as against a span, and each of those would need its
 * own case; what the search relies on is only that the distance from a fixed
 * point to a point running along a line falls and then rises, so the part of
 * the channel the part cannot reach is one interval and its edge is what a
 * bisection from inside it finds.
 *
 * Without this the planner refuses instead — correctly, and with a sentence —
 * but the block is then left off its rail for good, and every later edit
 * anywhere in the drawing asks the same refused question again.
 */
export function reseatEndJoint(
  cylinders: readonly Cylinder[],
  joint: Joint,
  /** One end of the channel the block rides. */
  channelStart: Point,
  /** The other. */
  channelEnd: Point,
  /** Where the channel wants the block, already clamped between those two. */
  wanted: Point,
  r: number = 0.15 * SettingsService.objectScale
): Point {
  const here = cylinders.filter((one) => one.mountA.id === joint.id || one.mountB.id === joint.id);
  if (here.length === 0) return wanted;

  const reaches = (at: Point) =>
    here.every((one) => {
      const movingBarrelMount = one.mountA.id === joint.id;
      return !!stretchedCylinderPose(
        movingBarrelMount ? at : one.mountA,
        movingBarrelMount ? one.mountB : at,
        cylinderLengthsOf(one),
        r,
        holdsOf(one)
      );
    });

  if (reaches(wanted)) return wanted;

  // The nearest point to `wanted` that the part can reach, on the way to each
  // end of the channel. Both, because which side has room depends on where the
  // carrier went, and the closer of the two is the one that moves the block
  // least.
  const best = [channelStart, channelEnd]
    .filter(reaches)
    .map((end) => edgeToward(wanted, end, reaches))
    .sort((one, other) => span(wanted, one) - span(wanted, other))[0];
  // Nowhere on this channel works: the carrier has been put somewhere the part
  // cannot follow at all. Leaving the block exactly where it is keeps the
  // drawing assembled and keeps the reader's own way out — move it back.
  return best ?? { x: joint.x, y: joint.y };
}

/** The first point from `from` toward `to` that `reaches` accepts. */
function edgeToward(from: Point, to: Point, reaches: (at: Point) => boolean): Point {
  const at = (t: number) => ({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
  let low = 0;
  let high = 1;
  // Twenty halvings puts the answer inside a millionth of the channel, which is
  // finer than the six decimals every coordinate is rounded to.
  for (let step = 0; step < 20; step++) {
    const mid = (low + high) / 2;
    if (reaches(at(mid))) high = mid;
    else low = mid;
  }
  return at(high);
}

const span = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Which of a part's members are keeping their length.
 *
 * Read off the flags, the way `GridUtilsService` reads them for the same
 * question: what a `'length'` hold constrains is a length the layout picks, so
 * the layout is where it has to be honored — and a reachability test that
 * ignored it would call a pose reachable that the commit then refuses.
 */
function holdsOf(cylinder: Cylinder): CylinderHolds {
  return {
    barrel: cylinder.barrel instanceof RealLink && cylinder.barrel.hold === 'length',
    rod: cylinder.rod instanceof RealLink && cylinder.rod.hold === 'length',
  };
}
