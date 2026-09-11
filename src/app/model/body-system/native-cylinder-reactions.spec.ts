import { nativeAxialCylinderExample } from '../../../test-utils/verification/native-axial-cylinder-example';
import { nativeWeldedCylinder } from '../../../test-utils/verification/native-welded-cylinder-fixture';
import {
  NativeCylinderExample,
  handOffset,
} from '../../../test-utils/verification/native-cylinder-example';
import { compileBodyDocument } from './constraint-compiler';
import { admitBodyPartition } from './body-admission';
import { initialBodyContinuation, advanceBodyCommand } from './body-continuation';
import { solveBodyForceFrame } from './body-force-frame';
import { ForceValue, jointBodyWrench } from './force-frame-result';
import { newRecordId, WORLD } from './body-id';
import { cross, dot, scale } from './body-frame';

const loadVector = { x: 2, y: -3 },
  couple = 0.6;
function value<T>(result: ForceValue<T>): T {
  if (!result.ok) throw new Error(result.reason);
  return result.value;
}
function* samples(example: NativeCylinderExample) {
  const witness = example.document.attachments.find((a) => a.id === example.witness)!;
  const document = {
    ...example.document,
    forces: [
      {
        id: newRecordId<'force'>(),
        bodyId: witness.bodyId,
        point: witness.point,
        vector: loadVector,
        couple,
        frame: 'world' as const,
        label: 'hand-checked off-axis load',
      },
    ],
  };
  const compiled = compileBodyDocument(document);
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues));
  const system = compiled.system,
    admitted = admitBodyPartition(system, system.partitions[0]);
  if (!admitted.ok) throw new Error(admitted.reason);
  let state = initialBodyContinuation(admitted);
  for (const [index, command] of example.commands.entries()) {
    const step = advanceBodyCommand(admitted, state, command);
    if (!step.ok) throw new Error(step.reason);
    state = step.state;
    const frame = solveBodyForceFrame(
      document,
      system,
      admitted.frame,
      {
        sample: {
          revision: 1,
          index,
          time: index,
          command,
          direction: 1,
          partitionKey: admitted.frame.partition.key,
        },
        pose: { ok: true, poses: state.poses, commands: new Map([[example.driver.id, command]]) },
      },
      { mode: 'static', gravity: { x: 0, y: 0 } }
    );
    if (!frame.ok) throw new Error(frame.reason);
    expect(frame.externalNullity).toBe(0);
    yield { system, frame, command, expected: example.hand(command, 1, 0), witness };
  }
}
describe('hand-derived reactions of native cylinder examples', () => {
  it('balances the axial carriage transverse load and guide couple, with moments about the same world point', () => {
    for (const heading of [0.4, -1.1]) {
      const example = nativeAxialCylinderExample('revolute', heading);
      const carriage = example.document.attachments.find((a) => a.id === example.witness)!.bodyId;
      const guide = example.document.joints.find(
        (j) => j.kind === 'prismatic' && j.bodyA === WORLD
      )!;
      const u = { x: Math.cos(heading), y: Math.sin(heading) },
        n = { x: -u.y, y: u.x };
      for (const { frame, expected, witness } of samples(example)) {
        const hand = expected.get(carriage)!,
          arm = handOffset(
            { point: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, acceleration: { x: 0, y: 0 } },
            hand.angle,
            witness.point
          ).point;
        const reaction = value(jointBodyWrench(frame, guide.id, carriage)),
          world = value(jointBodyWrench(frame, guide.id, WORLD));
        expect(dot(reaction.force, n)).toBeCloseTo(-dot(loadVector, n), 9);
        expect(dot(reaction.force, u)).toBeCloseTo(0, 9);
        expect(reaction.moment).toBeCloseTo(-cross(arm, loadVector) - couple, 9);
        expect(world.moment + reaction.moment + cross(hand.point, reaction.force)).toBeCloseTo(
          0,
          9
        );
        expect(value(frame.drivers.get(example.driver.id)!).value).toBeCloseTo(
          -dot(loadVector, u),
          9
        );
      }
    }
  });
  it('keeps a coincident third body pinned and gives only the rod-bracket weld the balancing couple', () => {
    for (const reverse of [false, true]) {
      const example = nativeWeldedCylinder(reverse);
      const bracket = example.document.attachments.find((a) => a.id === example.witness)!.bodyId;
      const boom = example.document.bodies.find(
        (b) => b.kind === 'material' && b.label === 'pinned boom'
      )!.id;
      const weld = example.document.joints.find((j) => j.kind === 'weld')!;
      const pin = example.document.joints.find(
        (j) => j.kind === 'revolute' && j.bodyA === bracket && j.bodyB === boom
      )!;
      let relativeAngle: number | undefined,
        changed = false;
      for (const { system, frame, expected, witness } of samples(example)) {
        expect(system.groupOf.get(bracket)).toBe(system.groupOf.get(example.assembly.rod));
        expect(system.groupOf.get(bracket)).not.toBe(system.groupOf.get(boom));
        const hand = expected.get(bracket)!,
          beam = expected.get(boom)!;
        const direction = { x: Math.cos(beam.angle.value), y: Math.sin(beam.angle.value) };
        const point = handOffset(hand, hand.angle, witness.point).point;
        // The unloaded boom is a two-force member. Whole-machine moment balance about (0,0)
        // determines its axial load before any weld reaction is read from the solver.
        const tension = -(cross(point, loadVector) + couple) / cross(hand.point, direction);
        const fromBoom = scale(direction, tension),
          reaction = value(jointBodyWrench(frame, weld.id, bracket));
        expect(reaction.force.x).toBeCloseTo(-loadVector.x - fromBoom.x, 9);
        expect(reaction.force.y).toBeCloseTo(-loadVector.y - fromBoom.y, 9);
        const arm = { x: point.x - hand.point.x, y: point.y - hand.point.y };
        expect(reaction.moment).toBeCloseTo(-cross(arm, loadVector) - couple, 9);
        const pinned = value(jointBodyWrench(frame, pin.id, bracket));
        expect(pinned.force.x).toBeCloseTo(fromBoom.x, 9);
        expect(pinned.force.y).toBeCloseTo(fromBoom.y, 9);
        expect(pinned.moment).toBeCloseTo(0, 9);
        const angle = hand.angle.value - beam.angle.value;
        if (relativeAngle === undefined) relativeAngle = angle;
        else changed ||= Math.abs(angle - relativeAngle) > 0.01;
      }
      expect(changed).toBe(true);
    }
  });
});
