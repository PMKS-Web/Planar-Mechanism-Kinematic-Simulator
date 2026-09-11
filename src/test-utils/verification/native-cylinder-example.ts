import { BodyDocument, BodyDriver } from '../../app/model/body-system/body-document';
import { BodyId, AttachmentId } from '../../app/model/body-system/body-id';
import { CylinderAssembly } from '../../app/model/body-system/assembly-record';
import { Point } from '../../app/model/body-system/body-frame';

export interface HandScalar {
  readonly value: number;
  readonly velocity: number;
  readonly acceleration: number;
}
export interface HandPoint {
  readonly point: Point;
  readonly velocity: Point;
  readonly acceleration: Point;
}
export interface HandBody extends HandPoint {
  readonly angle: HandScalar;
}
export interface NativeCylinderExample {
  readonly document: BodyDocument;
  readonly assembly: CylinderAssembly;
  readonly driver: BodyDriver;
  readonly witness: AttachmentId;
  readonly bodyCount: number;
  readonly jointCount: number;
  readonly unknownCount: number;
  readonly commands: readonly number[];
  readonly hand: (
    command: number,
    velocity: number,
    acceleration: number
  ) => ReadonlyMap<BodyId, HandBody>;
}
export const handScalar = (value: number, velocity = 0, acceleration = 0): HandScalar => ({
  value,
  velocity,
  acceleration,
});
export const handPoint = (x: number, y: number, vx = 0, vy = 0, ax = 0, ay = 0): HandPoint => ({
  point: { x, y },
  velocity: { x: vx, y: vy },
  acceleration: { x: ax, y: ay },
});

/** Direct rigid-point differentiation; expected motion never reads a solved angle or position. */
export function handOffset(base: HandPoint, angle: HandScalar, offset: Point): HandBody {
  const c = Math.cos(angle.value),
    s = Math.sin(angle.value),
    x = c * offset.x - s * offset.y,
    y = s * offset.x + c * offset.y;
  const w = angle.velocity,
    a = angle.acceleration;
  return {
    ...handPoint(
      base.point.x + x,
      base.point.y + y,
      base.velocity.x - w * y,
      base.velocity.y + w * x,
      base.acceleration.x - a * y - w * w * x,
      base.acceleration.y + a * x - w * w * y
    ),
    angle,
  };
}
