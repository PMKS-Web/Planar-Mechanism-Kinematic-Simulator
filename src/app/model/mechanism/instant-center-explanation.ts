import { RealLink } from '../link';
import { MODEL_SCALE } from '../render-scale';
import { centerId, finiteCenter } from './instant-center-solver';
import { instantCenterRatesAt } from './instant-center-kinematics';
import { Mechanism } from './mechanism';

/** Worked substitutions from the independent IC solution, in the drawing's length unit. */
export function explainInstantCenter(mechanism: Mechanism, index: number, linkId: string) {
  const result = instantCenterRatesAt(mechanism, index);
  const link = mechanism.links[index]?.find((candidate) => candidate.id === linkId);
  if (!result || !(link instanceof RealLink)) return undefined;
  const body = result.geometry.bodyOf.get(linkId)!;
  const center = result.geometry.centers.find((c) => c.id === centerId('ground', body));
  const origin = center && finiteCenter(result.geometry, center);
  const omega = result.linkAngVel.get(linkId);
  const velocity = result.linkVel.get(linkId)?.map((v) => v / MODEL_SCALE);
  const radius = origin && {
    x: (link.CoM.x - origin.x) / MODEL_SCALE,
    y: (link.CoM.y - origin.y) / MODEL_SCALE,
  };
  const ratio = result.geometry.centers.flatMap((pair) => {
    if (!origin || !pair.bodies.includes(body) || pair.bodies.includes('ground')) return [];
    const point = finiteCenter(result.geometry, pair);
    const other = pair.bodies.find((id) => id !== body)!;
    const otherCenter = result.geometry.centers.find((c) => c.id === centerId('ground', other));
    const otherOrigin = otherCenter && finiteCenter(result.geometry, otherCenter);
    const otherLink = mechanism.links[index].find(
      (l) => result.geometry.bodyOf.get(l.id) === other
    );
    const otherOmega = otherLink && result.linkAngVel.get(otherLink.id);
    if (!point || !otherOrigin || otherOmega === undefined) return [];
    const dx = (point.x - origin.x) / MODEL_SCALE;
    const dy = (point.y - origin.y) / MODEL_SCALE;
    if (Math.hypot(dx, dy) < (result.geometry.scale / MODEL_SCALE) * 1e-8) return [];
    const vx = (-otherOmega * (point.y - otherOrigin.y)) / MODEL_SCALE;
    const vy = (otherOmega * (point.x - otherOrigin.x)) / MODEL_SCALE;
    return [
      {
        pair,
        other,
        otherOmega,
        dx,
        dy,
        vx,
        vy,
        omega: (-dy * vx + dx * vy) / (dx * dx + dy * dy),
      },
    ];
  })[0];
  return {
    result,
    body,
    center,
    omega,
    velocity,
    radius,
    ratio,
    origin: origin && { x: origin.x / MODEL_SCALE, y: origin.y / MODEL_SCALE },
    point: { x: link.CoM.x / MODEL_SCALE, y: link.CoM.y / MODEL_SCALE },
  };
}
