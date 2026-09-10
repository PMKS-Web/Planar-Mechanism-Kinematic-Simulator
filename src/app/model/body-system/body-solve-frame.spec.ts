import { createBodySolveFrame, solveFramePoint, worldGroupPose } from './body-solve-frame';
import {
  nativeFourBar,
  nativeFourBarPoint,
} from '../../../test-utils/verification/native-body-fixtures';
import { compileBodyDocument } from './constraint-compiler';
import { WORLD } from './body-id';
import { relaxBodyPosition } from './body-position-solver';
import { localToWorld, rotate } from './body-frame';
import { admitBodyPartition } from './body-admission';
import { initialBodyContinuation, advanceBodyCommand } from './body-continuation';
import { rebaseBody } from './rebase-body';

describe('partition numerical frames', () => {
  it('preserves native continuation under size, world rotation and material-frame changes', () => {
    for (const size of [1e-9, 1, 1e6])
      for (const rotation of [-1.1, 0.9]) {
        const { document, witness } = nativeFourBar({
          ground: 4 * size,
          crank: size,
          coupler: 3 * size,
          rocker: 2 * size,
        });
        let changed = {
          ...document,
          bodies: document.bodies.map((body) =>
            body.kind === 'world'
              ? body
              : {
                  ...body,
                  pose: { ...rotate(body.pose, rotation), angle: body.pose.angle + rotation },
                }
          ),
          attachments: document.attachments.map((anchor) =>
            anchor.bodyId !== WORLD
              ? anchor
              : {
                  ...anchor,
                  point: rotate(anchor.point, rotation),
                }
          ),
          joints: document.joints.map((joint) => {
            if (joint.kind !== 'revolute') throw new Error('Four-bar fixture changed');
            return {
              ...joint,
              angleZero:
                joint.angleZero +
                (joint.bodyA === WORLD ? rotation : joint.bodyB === WORLD ? -rotation : 0),
              frameA: {
                ...joint.frameA,
                angle: joint.frameA.angle + (joint.bodyA === WORLD ? rotation : 0),
              },
              frameB: {
                ...joint.frameB,
                angle: joint.frameB.angle + (joint.bodyB === WORLD ? rotation : 0),
              },
            };
          }),
        } as typeof document;
        for (const body of document.bodies)
          if (body.kind !== 'world')
            changed = rebaseBody(changed, body.id, { x: 2.3 * size, y: -1.7 * size, angle: 0.3 });
        const compiled = compileBodyDocument(changed);
        if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues));
        const system = compiled.system;
        const admitted = admitBodyPartition(system, system.partitions[0]);
        if (!admitted.ok) throw new Error(`size ${size}: ${admitted.reason}`);
        let state = initialBodyContinuation(admitted);
        for (const command of [0.4, 1.3, -0.2, 0]) {
          const next = advanceBodyCommand(admitted, state, command);
          if (!next.ok) throw new Error(next.reason);
          state = next.state;
          const a = system.attachments.get(witness)!;
          const point = localToWorld(
            state.poses.get(a.groupId)!,
            solveFramePoint(admitted.frame, a.groupId, a.point)
          );
          const expected = rotate(nativeFourBarPoint(0.7 + command), rotation);
          expect((point.x + admitted.frame.origin.x) / size).toBeCloseTo(expected.x, 8);
          expect((point.y + admitted.frame.origin.y) / size).toBeCloseTo(expected.y, 8);
        }
      }
  });

  it('keeps correction feasible far from the drawing origin', () => {
    const { document, driver, witness } = nativeFourBar();
    for (const offset of [0, 1e6, 1e9]) {
      const translated = {
        ...document,
        bodies: document.bodies.map((body) =>
          body.kind === 'world'
            ? body
            : {
                ...body,
                pose: { ...body.pose, x: body.pose.x + offset, y: body.pose.y - offset },
              }
        ),
        attachments: document.attachments.map((anchor) =>
          anchor.bodyId !== WORLD
            ? anchor
            : {
                ...anchor,
                point: { x: anchor.point.x + offset, y: anchor.point.y - offset },
              }
        ),
      };
      const compiled = compileBodyDocument(translated);
      if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues));
      const system = compiled.system,
        partition = system.partitions[0];
      const poses = new Map([...system.groups].map(([id, group]) => [id, group.pose]));
      const frame = createBodySolveFrame(partition, poses);
      const result = relaxBodyPosition(
        frame.partition,
        frame.initialPoses,
        new Map([[driver.id, 0.4]])
      );
      expect(result.ok, `offset ${offset}: ${JSON.stringify(result)}`).toBe(true);
      if (!result.ok) throw new Error(result.reason);
      const anchor = system.attachments.get(witness)!;
      const point = localToWorld(
        result.poses.get(anchor.groupId)!,
        solveFramePoint(frame, anchor.groupId, anchor.point)
      );
      const world = worldGroupPose(frame, anchor.groupId, result.poses.get(anchor.groupId)!);
      const displayPoint = localToWorld(world, anchor.point);
      const expected = nativeFourBarPoint(1.1);
      expect(displayPoint.x - offset).toBeCloseTo(expected.x, 5);
      expect(displayPoint.y + offset).toBeCloseTo(expected.y, 5);
      expect(point.x + (frame.origin.x - offset)).toBeCloseTo(expected.x, 5);
      expect(point.y + (frame.origin.y + offset)).toBeCloseTo(expected.y, 5);
    }
  });
});
