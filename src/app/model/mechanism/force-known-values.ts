import { BodyLoad } from './solver-explanation';
import { referenceSystem, COM_REFERENCE, COM_TEX } from './force-reference';
import { forceBodyEquations } from './force-body-equations';
import { column, texName, texNumber, vector } from './worksheet-math';

type Body = ReturnType<typeof referenceSystem>['bodies'][number];
type Load = BodyLoad & { symbol: string };
type MomentArm = ReturnType<typeof forceBodyEquations>['crossProducts'][number];

export interface ForceKnownValue {
  symbol: string;
  value: string;
}

/** Values that enter this body's force balances, in the same frame and reference as its rows. */
export function forceKnownValues(
  body: Body,
  loads: Load[],
  momentArms: MomentArm[],
  dynamic: boolean
): ForceKnownValue[] {
  const id = texName(body.id);
  const ref = body.reference.id === COM_REFERENCE ? COM_TEX : texName(body.reference.id);
  const rows: ForceKnownValue[] = [];
  const armPoints = new Map(momentArms.map((arm) => [arm.point, [arm.dx, arm.dy]]));
  if (dynamic && body.reference.id !== COM_REFERENCE) {
    armPoints.set('CoM', [
      (body.center[0] - body.reference.point[0]) * body.lengthToM,
      (body.center[1] - body.reference.point[1]) * body.lengthToM,
    ]);
  }
  for (const [point, [x, y]] of armPoints) {
    const name = point === 'CoM' ? COM_TEX : texName(point);
    rows.push(
      {
        symbol: `r_{${name}/${ref},x}`,
        value: `${texNumber(x)}\\;\\mathrm m`,
      },
      {
        symbol: `r_{${name}/${ref},y}`,
        value: `${texNumber(y)}\\;\\mathrm m`,
      }
    );
  }

  if (body.massKg !== undefined)
    rows.push({
      symbol: `m_{${id}}`,
      value: `${texNumber(body.massKg)}\\;\\mathrm{kg}`,
    });
  if (body.inertiaKgM2 !== undefined)
    rows.push({
      symbol: `I_{${COM_TEX},${id}}`,
      value: `${texNumber(body.inertiaKgM2)}\\;\\mathrm{kg\\,m^2}`,
    });

  for (const load of loads.filter((one) => one.column === undefined)) {
    if (load.kind === 'weight') {
      rows.push(
        {
          symbol: load.symbol,
          value: `${texNumber(Math.hypot(...load.vector))}\\;\\mathrm N`,
        },
        {
          symbol: vector('W', id),
          value: `${column([load.vector[0], load.vector[1], 0])}\\;\\mathrm N`,
        }
      );
    } else if (load.couple === undefined) {
      const point = texName(load.applicationId ?? load.label);
      rows.push(
        {
          symbol: `${vector('F', point)}^{(${id})}`,
          value: `${column([load.vector[0], load.vector[1], 0])}\\;\\mathrm N`,
        },
        ...(['x', 'y'] as const).map((axis, i) => ({
          symbol: `F_{${point},${axis}}`,
          value: `${texNumber(load.vector[i])}\\;\\mathrm N`,
        }))
      );
    }
  }

  if (dynamic) {
    if (body.acceleration)
      rows.push(
        ...(['x', 'y'] as const).map((axis, i) => ({
          symbol: `a_{${COM_TEX},${axis}}`,
          value: `${texNumber(body.acceleration![i])}\\;\\mathrm{m/s^2}`,
        }))
      );
    if (body.angularAcceleration !== undefined)
      rows.push({
        symbol: `\\alpha_{${id}}`,
        value: `${texNumber(body.angularAcceleration)}\\;\\mathrm{rad/s^2}`,
      });
  }
  return rows;
}
