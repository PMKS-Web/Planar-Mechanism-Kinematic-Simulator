import { RealLink } from './link';
import { uniformMassProperties } from './mass-properties';
import { parallelAxis } from './parallel-axis';

/** The axis is parallel to the centroidal axis, perpendicular to the drawing.
 * This is a read-only change of reference, never a replacement for the inertia
 * supplied to the force solver. `factor` converts mass times model length² to
 * stored inertia, just as in uniformMassProperties. */
export function inertiaAboutPoint(body: RealLink, point: { x: number; y: number }, factor: number) {
  const result = parallelAxis(body.mass, body.CoM, body.massMoI, point, factor);
  const geometry = { dx: result.dx, dy: result.dy, distanceSq: result.distanceSq };
  if (
    ![body.mass, body.massMoI, body.CoM.x, body.CoM.y, point.x, point.y, factor].every(
      Number.isFinite
    ) ||
    body.mass < 0 ||
    body.massMoI < 0 ||
    factor <= 0 ||
    !Number.isFinite(result.inertia)
  )
    return {
      available: false as const,
      ...geometry,
      reason:
        'A parallel-axis calculation needs finite coordinates, nonnegative mass and inertia, and a positive unit conversion.',
    };
  if (body.mass === 0 && body.massMoI !== 0)
    return {
      available: false as const,
      ...geometry,
      reason: 'A body with zero mass cannot have a nonzero mass moment of inertia.',
    };
  const unsupported = unsupportedCenter(body, factor);
  if (unsupported)
    return {
      available: false as const,
      ...geometry,
      reason: `The custom center of mass${unsupported === body ? '' : ` of member ${unsupported.name || unsupported.id}`} differs from the uniform centroid. Set a matching custom inertia or reset the center of mass before applying the parallel-axis theorem to these properties.`,
    };
  return { available: true as const, ...result };
}

/** An automatic compound inherits unsupported member pairings; a supplied
 * compound inertia is instead the author's assertion about the whole body. */
function unsupportedCenter(body: RealLink, factor: number): RealLink | undefined {
  if (body.moiIsCustom) return undefined;
  const uniform = uniformMassProperties(body, factor);
  const offsetSq = (body.CoM.x - uniform.com.x) ** 2 + (body.CoM.y - uniform.com.y) ** 2;
  if (body.comIsCustom && offsetSq > 1e-12) return body;
  for (const part of body.subset) {
    if (part instanceof RealLink) {
      const unsupported = unsupportedCenter(part, factor);
      if (unsupported) return unsupported;
    }
  }
  return undefined;
}
