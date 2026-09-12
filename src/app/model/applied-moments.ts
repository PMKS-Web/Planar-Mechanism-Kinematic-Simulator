import { RealLink } from './link';
import { forceMoment } from './force-moment';
import { siUnitFactorsForLength, NEWTONS_PER_KGF } from './unit-conversions';
import { LengthUnit } from './unit-enums';
import { MODEL_SCALE } from './render-scale';
import { Force } from './force';

/** Applied loads only. This is not a solver reaction result or a full balance.
 * The editable pose uses MODEL_SCALE; solved frames already use project lengths. */
export function appliedMoments(
  body: RealLink,
  point: { x: number; y: number },
  length: LengthUnit,
  gravity: boolean
) {
  const units = siUnitFactorsForLength(length);
  const distanceFactor = units.distanceToM / MODEL_SCALE;
  const rows = body.forces.map((force) => ({
    name: force.name || force.id,
    force: force as Force | undefined,
    application: force.startCoord,
    ...forceMoment(
      force.startCoord,
      point,
      force.mag * Math.cos(force.angleRad) * units.forceToN,
      force.mag * Math.sin(force.angleRad) * units.forceToN,
      distanceFactor
    ),
  }));
  if (gravity)
    rows.push({
      name: 'Gravity at G',
      force: undefined,
      application: body.CoM,
      ...forceMoment(
        body.CoM,
        point,
        0,
        -body.mass * units.massToKg * NEWTONS_PER_KGF,
        distanceFactor
      ),
    });
  return { rows, total: rows.reduce((sum, row) => sum + row.moment, 0) };
}
