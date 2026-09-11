import { BodyDocument } from '../../app/model/body-system/body-document';
import { BodyId } from '../../app/model/body-system/body-id';
import { CompiledBodySystem } from '../../app/model/body-system/compiled-body-system';
import { BodySolveFrame, solveFramePoint } from '../../app/model/body-system/body-solve-frame';
import { GroupPoses } from '../../app/model/body-system/body-constraint-rows';
import { BodyMotion } from '../../app/model/body-system/body-rates';
import { bodyPointRates } from '../../app/model/body-system/body-point-rates';
import { resolveMass } from '../../app/model/body-system/body-properties';
import { localToWorld, Point, add } from '../../app/model/body-system/body-frame';
import { HandBody, handOffset } from './native-cylinder-example';

/** Meter-scale fixtures use 1e-8 absolute/relative error; no tolerance is fitted to observed answers. */
export const close = (actual: number, expected: number) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1e-8 * (1 + Math.abs(expected)));
const pointClose = (actual: Point, expected: Point) => {
  close(actual.x, expected.x);
  close(actual.y, expected.y);
};
export const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;

export function checkCylinderHandMotion(
  document: BodyDocument,
  system: CompiledBodySystem,
  frame: BodySolveFrame,
  poses: GroupPoses,
  motions: ReadonlyMap<BodyId, BodyMotion>,
  expected: ReadonlyMap<BodyId, HandBody>
): number {
  let kineticPower = 0;
  for (const [id, hand] of expected) {
    const groupId = system.groupOf.get(id)!,
      group = system.groups.get(groupId)!,
      pose = poses.get(groupId)!;
    const member = group.members.get(id)!,
      motion = motions.get(groupId)!;
    close(Math.sin(pose.angle + member.angle - hand.angle.value), 0);
    close(Math.cos(pose.angle + member.angle - hand.angle.value), 1);
    close(motion.velocity.omega, hand.angle.velocity);
    close(motion.acceleration.alpha, hand.angle.acceleration);
    for (const local of [
      { x: 0, y: 0 },
      { x: 0.7, y: 0.6 },
      { x: -0.2, y: 0.5 },
    ]) {
      const offset = solveFramePoint(frame, groupId, localToWorld(member, local));
      const actual = bodyPointRates(pose, offset, motion)!,
        point = handOffset(hand, hand.angle, local);
      pointClose(add(localToWorld(pose, offset), frame.origin), point.point);
      pointClose(actual.velocity, point.velocity);
      pointClose(actual.acceleration, point.acceleration);
    }
    const body = document.bodies.find((body) => body.id === id)!;
    if (body.kind !== 'material') throw new Error('Expected material');
    const mass = resolveMass(body, document.units),
      center = handOffset(hand, hand.angle, mass.center ?? { x: 0, y: 0 });
    kineticPower +=
      mass.mass * dot(center.velocity, center.acceleration) +
      mass.inertia * hand.angle.velocity * hand.angle.acceleration;
  }
  return kineticPower;
}
