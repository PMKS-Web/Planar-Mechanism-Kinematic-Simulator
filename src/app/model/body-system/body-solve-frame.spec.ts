import { createBodySolveFrame, solveFramePoint, worldGroupPose } from './body-solve-frame';
import {
  nativeFourBar,
  nativeFourBarPoint,
} from '../../../test-utils/verification/native-body-fixtures';
import { compileBodyDocument } from './constraint-compiler';
import { WORLD } from './body-id';
import { relaxBodyPosition } from './body-position-solver';
import { localToWorld } from './body-frame';

describe('partition numerical frames', () => {
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
