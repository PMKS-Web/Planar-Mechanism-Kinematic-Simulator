import { BodyId, DriverId } from './body-id';
import { BodyRowGradient } from './body-constraint-rows';
import { CompiledBodyPartition } from './compiled-body-system';
import type { BodyMotion, CommandMotion } from './body-rates';

/** A boundary-only row may cancel a command in algebra but not in floating point.
 * Keep the operands' arithmetic scale before subtracting them into a near-zero RHS.
 */
export function bodyRatePrescription(
  partition: CompiledBodyPartition,
  gradients: readonly BodyRowGradient[],
  commands: ReadonlyMap<DriverId, CommandMotion>,
  boundary: ReadonlyMap<BodyId, BodyMotion>,
  order: 'velocity' | 'acceleration'
) {
  const rhs: number[] = [],
    roundoff: number[] = [];
  for (const [i, row] of partition.rows.entries()) {
    let value = row.commandId ? commands.get(row.commandId)![order] : 0;
    let magnitude = Math.abs(value);
    for (const id of partition.boundary) {
      const coefficients = gradients[i].get(id);
      if (!coefficients) continue;
      const motion = boundary.get(id)!;
      const values =
        order === 'velocity'
          ? [motion.velocity.vx, motion.velocity.vy, motion.velocity.omega]
          : [motion.acceleration.ax, motion.acceleration.ay, motion.acceleration.alpha];
      for (let j = 0; j < 3; j++) {
        const term = coefficients[j] * values[j];
        value -= term;
        magnitude += Math.abs(term);
      }
    }
    rhs.push(value);
    roundoff.push(128 * Number.EPSILON * magnitude);
  }
  return { rhs, roundoff };
}
