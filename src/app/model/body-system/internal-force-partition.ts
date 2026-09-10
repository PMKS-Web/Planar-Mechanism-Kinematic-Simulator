import { BodyDocument } from './body-document';
import { BodyId, compareRecordIds, WORLD } from './body-id';
import {
  BodyConstraintRow,
  CompiledBodyPartition,
  CompiledBodySystem,
  ConstraintPair,
} from './compiled-body-system';
import { BodySolveFrame, solveFramePoint } from './body-solve-frame';
import { GroupPoses } from './body-constraint-rows';

/** These are material equilibrium frames at one common origin, never an alternative pose model. */
export function internalForcePartition(
  document: BodyDocument,
  system: CompiledBodySystem,
  frame: BodySolveFrame,
  poses: GroupPoses,
  groupId: BodyId
) {
  const group = system.groups.get(groupId)!,
    pose = poses.get(groupId)!;
  const joints = new Map(document.joints.map((joint) => [joint.id, joint]));
  const internal: BodyConstraintRow[] = [];
  const fixed = system.fixedRows
    .filter((row) => row.pair.groupA === groupId && row.pair.groupB === groupId)
    .map((row) => ({
      ...row,
      pair: {
        ...row.pair,
        anchorA: solveFramePoint(frame, groupId, row.pair.anchorA),
        anchorB: solveFramePoint(frame, groupId, row.pair.anchorB),
      },
    }));
  const rows = new Map([...frame.partition.rows, ...fixed].map((row) => [row.key, row]));
  for (const row of rows.values()) {
    if (row.pair.groupA !== groupId || row.pair.groupB !== groupId) continue;
    const joint = joints.get(row.jointId)!;
    internal.push({ ...row, pair: { ...row.pair, groupA: joint.bodyA, groupB: joint.bodyB } });
  }
  for (const joint of document.joints) {
    if (joint.kind !== 'weld' || !group.members.has(joint.bodyA) || !group.members.has(joint.bodyB))
      continue;
    // A full weld wrench may be referred to the common origin even when its authored ends differ.
    const pair: ConstraintPair = {
      groupA: joint.bodyA,
      groupB: joint.bodyB,
      anchorA: { x: 0, y: 0 },
      anchorB: { x: 0, y: 0 },
      axisA: 0,
      memberAngleA: 0,
      memberAngleB: 0,
    };
    for (const kind of ['coincidence-x', 'coincidence-y', 'angle'] as const)
      internal.push({ key: `${joint.id}:weld:${kind}`, jointId: joint.id, kind, pair, zero: 0 });
  }
  internal.sort((a, b) => compareRecordIds(a.key, b.key));
  const ids = [...group.members.keys()].sort(compareRecordIds);
  const partition: CompiledBodyPartition = {
    key: `internal:${groupId}`,
    unknowns: ids.filter((id) => id !== WORLD),
    boundary: ids.includes(WORLD) ? [WORLD] : [],
    materialIds: ids.filter((id) => id !== WORLD),
    rows: internal,
    drivers: [],
    limits: [],
  };
  return { partition, poses: new Map(ids.map((id) => [id, pose])) };
}
