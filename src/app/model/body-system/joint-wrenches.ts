import { BodyConstraintRow } from './compiled-body-system';
import { bodyRowBlocks, GroupPoses } from './body-constraint-rows';
import { add, cross, Point, scale } from './body-frame';
import { BodyTwist } from './body-row-quadratic';
import { BodyId } from './body-id';

/** SI force and counterclockwise moment about the explicitly named body/group origin. */
export interface Wrench {
  readonly force: Point;
  readonly moment: number;
}
/** SI wrenches at material origins; retaining terms separately preserves cancellation provenance. */
export type MaterialWrenches = ReadonlyMap<BodyId, readonly Wrench[]>;
export const ZERO_WRENCH: Wrench = Object.freeze({
  force: Object.freeze({ x: 0, y: 0 }),
  moment: 0,
});

/** Jᵀ carries the lever-arm term for a guide whose two reference points are separated. */
export function rowWrenches(
  row: BodyConstraintRow,
  poses: GroupPoses,
  effort: number
): { readonly a: Wrench; readonly b: Wrench } {
  const [a, b] = bodyRowBlocks(row, poses);
  const wrench = (block: readonly number[]): Wrench => ({
    force: { x: block[0] * effort, y: block[1] * effort },
    moment: block[2] * effort,
  });
  return { a: wrench(a), b: wrench(b) };
}

/** offset points from the new moment reference to the old one; force is unchanged. */
export function transportWrench(wrench: Wrench, offset: Point): Wrench {
  return { force: wrench.force, moment: wrench.moment + cross(offset, wrench.force) };
}

export function addWrenches(a: Wrench, b: Wrench): Wrench {
  return { force: add(a.force, b.force), moment: a.moment + b.moment };
}

export function scaleWrench(wrench: Wrench, factor: number): Wrench {
  return { force: scale(wrench.force, factor), moment: wrench.moment * factor };
}

export function wrenchPower(wrench: Wrench, twist: BodyTwist): number {
  return wrench.force.x * twist.vx + wrench.force.y * twist.vy + wrench.moment * twist.omega;
}

export function finiteWrench(wrench: Wrench): boolean {
  return [wrench.force.x, wrench.force.y, wrench.moment].every(Number.isFinite);
}

/** Component magnitudes retain the arithmetic scale when opposing load terms cancel. */
export function absoluteWrench(wrench: Wrench): Wrench {
  return {
    force: { x: Math.abs(wrench.force.x), y: Math.abs(wrench.force.y) },
    moment: Math.abs(wrench.moment),
  };
}
