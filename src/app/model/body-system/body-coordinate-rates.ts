import { bodyRowGradient, bodyRowValue, GroupPoses } from './body-constraint-rows';
import { BodyConstraintRow } from './compiled-body-system';
import { BodyId } from './body-id';
import { BodyMotion, CommandMotion } from './body-rates';
import { bodyRowQuadratic } from './body-row-quadratic';

/** A passive coordinate follows both material frames, including a rotating guide's quadratic terms. */
export function bodyCoordinateMotion(
  row: BodyConstraintRow,
  poses: GroupPoses,
  motions: ReadonlyMap<BodyId, BodyMotion>
): CommandMotion | undefined {
  const gradient = bodyRowGradient(row, poses);
  let velocity = 0,
    acceleration = 0;
  for (const [id, coefficients] of gradient) {
    const motion = motions.get(id);
    if (!motion) return undefined;
    const v = motion.velocity,
      a = motion.acceleration;
    velocity += coefficients[0] * v.vx + coefficients[1] * v.vy + coefficients[2] * v.omega;
    acceleration += coefficients[0] * a.ax + coefficients[1] * a.ay + coefficients[2] * a.alpha;
  }
  const twists = new Map([...motions].map(([id, motion]) => [id, motion.velocity]));
  acceleration += bodyRowQuadratic(row, poses, twists);
  const value = bodyRowValue({ ...row, commandId: undefined }, poses);
  return [value, velocity, acceleration].every(Number.isFinite)
    ? { value, velocity, acceleration }
    : undefined;
}
