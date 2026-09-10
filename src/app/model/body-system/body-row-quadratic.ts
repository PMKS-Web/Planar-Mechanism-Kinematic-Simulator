import { BodyId } from './body-id';
import { add, dot, perpendicular, scale, subtract } from './body-frame';
import { GroupPoses, pairGeometry } from './body-constraint-rows';
import { BodyConstraintRow } from './compiled-body-system';

export interface BodyTwist {
  readonly vx: number;
  readonly vy: number;
  readonly omega: number;
}
export type GroupTwists = ReadonlyMap<BodyId, BodyTwist>;

/** Velocity-only part of F̈; prescribed accelerations belong to J ẍ, never to this term. */
export function bodyRowQuadratic(
  row: BodyConstraintRow,
  poses: GroupPoses,
  twists: GroupTwists
): number {
  const va = twists.get(row.pair.groupA),
    vb = twists.get(row.pair.groupB);
  if (!va || !vb) throw new Error('Missing body velocity');
  if (row.kind === 'angle') return 0;
  const { a, b, d, u, n } = pairGeometry(row.pair, poses);
  const k = subtract(scale(a, va.omega ** 2), scale(b, vb.omega ** 2));
  if (row.kind === 'coincidence-x') return k.x;
  if (row.kind === 'coincidence-y') return k.y;
  const v = subtract(
    add({ x: vb.vx, y: vb.vy }, scale(perpendicular(b), vb.omega)),
    add({ x: va.vx, y: va.vy }, scale(perpendicular(a), va.omega))
  );
  return row.kind === 'lateral'
    ? dot(n, k) - 2 * va.omega * dot(u, v) - va.omega ** 2 * dot(n, d)
    : dot(u, k) + 2 * va.omega * dot(n, v) - va.omega ** 2 * dot(u, d);
}
