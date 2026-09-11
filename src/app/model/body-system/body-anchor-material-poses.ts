import { GroupPoses } from './body-constraint-rows';
import { CompiledBodySystem } from './compiled-body-system';
import { BodySolveFrame, worldGroupPose } from './body-solve-frame';
import { BodyId } from './body-id';
import { compose, Pose } from './body-frame';

/** Only this presentation boundary turns numerical SI frames back into authored material units. */
export function bodyAnchorMaterialPoses(
  system: CompiledBodySystem,
  frame: BodySolveFrame,
  poses: GroupPoses,
  length: number
): ReadonlyMap<BodyId, Pose> {
  const result = new Map<BodyId, Pose>();
  for (const id of frame.partition.unknowns) {
    const pose = worldGroupPose(frame, id, poses.get(id)!);
    for (const [bodyId, member] of system.groups.get(id)!.members) {
      const material = compose(pose, member);
      result.set(bodyId, { x: material.x / length, y: material.y / length, angle: material.angle });
    }
  }
  return result;
}
