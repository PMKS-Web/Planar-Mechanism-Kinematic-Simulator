import { RealLink } from './link';
import { uniformMassProperties } from './mass-properties';

/** The axis is parallel to the centroidal axis, perpendicular to the drawing.
 * This is a read-only change of reference, never a replacement for the inertia
 * supplied to the force solver. `factor` converts mass times model length² to
 * stored inertia, just as in uniformMassProperties. */
export function inertiaAboutPoint(body: RealLink, point: { x: number; y: number }, factor: number) {
  const uniform = uniformMassProperties(body, factor);
  const offsetSq = (body.CoM.x - uniform.com.x) ** 2 + (body.CoM.y - uniform.com.y) ** 2;
  if (body.comIsCustom && !body.moiIsCustom && offsetSq > 1e-12) {
    return {
      available: false as const,
      reason:
        'The custom center of mass differs from the uniform centroid. Set a matching custom inertia or reset the center of mass before applying the parallel-axis theorem to these properties.',
    };
  }
  const dx = body.CoM.x - point.x;
  const dy = body.CoM.y - point.y;
  const distanceSq = dx ** 2 + dy ** 2;
  const shift = body.mass * distanceSq * factor;
  return { available: true as const, dx, dy, distanceSq, shift, inertia: body.massMoI + shift };
}
