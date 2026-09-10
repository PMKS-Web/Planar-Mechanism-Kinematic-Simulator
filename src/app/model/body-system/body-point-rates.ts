import { add, Point, Pose, perpendicular, rotate, scale } from './body-frame';
import { BodyMotion } from './body-rates';
import { BodyId } from './body-id';
import { BodySolveFrame } from './body-solve-frame';

export interface PointRates {
  readonly velocity: Point;
  readonly acceleration: Point;
}

/** Material points use the body's angular acceleration directly, including off-axis witnesses. */
export function bodyPointRates(
  pose: Pose,
  local: Point,
  motion: BodyMotion
): PointRates | undefined {
  const offset = rotate(local, pose.angle),
    normal = perpendicular(offset);
  const v = motion.velocity,
    a = motion.acceleration;
  const velocity = add({ x: v.vx, y: v.vy }, scale(normal, v.omega));
  const acceleration = add(
    add({ x: a.ax, y: a.ay }, scale(normal, a.alpha)),
    scale(scale(offset, -v.omega), v.omega)
  );
  return [velocity.x, velocity.y, acceleration.x, acceleration.y].every(Number.isFinite)
    ? { velocity, acceleration }
    : undefined;
}

/** O is constant; relocating a rotating group origin by h still changes its linear rates. */
export function numericalGroupRates(
  frame: BodySolveFrame,
  id: BodyId,
  pose: Pose,
  motion: BodyMotion
): BodyMotion | undefined {
  const offset = frame.groupOffsets.get(id);
  return offset ? ratesAtOffset(pose, offset, motion) : undefined;
}

export function worldGroupRates(
  frame: BodySolveFrame,
  id: BodyId,
  pose: Pose,
  motion: BodyMotion
): BodyMotion | undefined {
  const offset = frame.groupOffsets.get(id);
  return offset ? ratesAtOffset(pose, scale(offset, -1), motion) : undefined;
}

function ratesAtOffset(pose: Pose, offset: Point, motion: BodyMotion): BodyMotion | undefined {
  const point = bodyPointRates(pose, offset, motion);
  return point
    ? {
        velocity: { vx: point.velocity.x, vy: point.velocity.y, omega: motion.velocity.omega },
        acceleration: {
          ax: point.acceleration.x,
          ay: point.acceleration.y,
          alpha: motion.acceleration.alpha,
        },
      }
    : undefined;
}
