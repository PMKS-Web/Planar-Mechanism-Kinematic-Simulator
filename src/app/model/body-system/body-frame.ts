export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Pose extends Point {
  readonly angle: number;
}

export const IDENTITY_POSE: Pose = Object.freeze({ x: 0, y: 0, angle: 0 });

export function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function subtract(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(a: Point, factor: number): Point {
  return { x: a.x * factor, y: a.y * factor };
}

export function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y;
}

export function cross(a: Point, b: Point): number {
  return a.x * b.y - a.y * b.x;
}

export function perpendicular(a: Point): Point {
  return { x: -a.y, y: a.x };
}

export function rotate(a: Point, angle: number): Point {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: c * a.x - s * a.y, y: s * a.x + c * a.y };
}

export function localToWorld(frame: Pose, point: Point): Point {
  return add(frame, rotate(point, frame.angle));
}

export function worldToLocal(frame: Pose, point: Point): Point {
  return rotate(subtract(point, frame), -frame.angle);
}

/** Angles remain unwrapped: removing turns here would erase a continuation branch. */
export function compose(frame: Pose, local: Pose): Pose {
  return { ...localToWorld(frame, local), angle: frame.angle + local.angle };
}

export function inverse(frame: Pose): Pose {
  return { ...rotate(scale(frame, -1), -frame.angle), angle: -frame.angle };
}

export function relativePose(frame: Pose, other: Pose): Pose {
  return { ...worldToLocal(frame, other), angle: other.angle - frame.angle };
}

export function finitePoint(point: Point): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

export function finitePose(pose: Pose): boolean {
  return finitePoint(pose) && Number.isFinite(pose.angle);
}
