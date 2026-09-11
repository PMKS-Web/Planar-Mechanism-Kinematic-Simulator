import { BodyDocument } from './body-document';
import { BodyId, JointId } from './body-id';
import { Point, rotate, scale } from './body-frame';
import { CompiledBodySystem } from './compiled-body-system';
import { BodySolveFrame, solveFramePoint } from './body-solve-frame';
import { GroupPoses } from './body-constraint-rows';
import { BodyRatesResult } from './body-rates';
import { BodyEfforts } from './body-efforts';
import { memberForceLoads } from './member-force-loads';
import { recoverMemberReactions } from './member-reactions';
import {
  addWrenches,
  finiteWrench,
  rowWrenches,
  transportWrench,
  Wrench,
  MaterialWrenches,
} from './joint-wrenches';
import { ForceValue, PairWrench, forceAvailable, forceUnavailable } from './force-frame-result';

/** Joint records assign material ownership; a condensed group's representative does not. */
export function forceFrameJoints(
  document: BodyDocument,
  system: CompiledBodySystem,
  frame: BodySolveFrame,
  poses: GroupPoses,
  rates: BodyRatesResult | undefined,
  efforts: Extract<BodyEfforts, { ok: true }>,
  mode: 'static' | 'dynamic',
  gravity: Point,
  context: { readonly recoverBoundary?: boolean; readonly materialWrenches?: MaterialWrenches } = {}
):
  | { readonly ok: false; readonly reason: 'invalid' }
  | { readonly ok: true; readonly joints: ReadonlyMap<JointId, ForceValue<PairWrench>> } {
  const partition = frame.partition;
  const ids = new Set([...partition.unknowns, ...partition.boundary]);
  const joints = new Map<JointId, ForceValue<PairWrench>>();
  const records = new Map(document.joints.map((joint) => [joint.id, joint]));
  // A shared material frame can be held by pins instead of a WORLD weld. Its
  // supports need every attached clock's reactions, not just this partition's.
  if (!context.recoverBoundary)
    for (const row of system.fixedRows)
      if (ids.has(row.pair.groupA) || ids.has(row.pair.groupB))
        joints.set(row.jointId, forceUnavailable('frame-context'));
  for (const row of partition.rows) {
    if (row.pair.groupA === row.pair.groupB) continue;
    const joint = records.get(row.jointId);
    if (!joint) return { ok: false, reason: 'invalid' };
    const previous = joints.get(joint.id),
      effort = efforts.efforts.get(row.key);
    if (previous?.ok === false) continue;
    if (!effort?.ok) {
      joints.set(joint.id, forceUnavailable('indeterminate'));
      continue;
    }
    const pair = rowWrenches(row, poses, effort.value);
    const atBody = (id: BodyId, groupId: BodyId, wrench: Wrench) =>
      transportWrench(
        wrench,
        scale(
          rotate(
            solveFramePoint(frame, groupId, system.groups.get(groupId)!.members.get(id)!),
            poses.get(groupId)!.angle
          ),
          -1
        )
      );
    const a = atBody(joint.bodyA, row.pair.groupA, pair.a),
      b = atBody(joint.bodyB, row.pair.groupB, pair.b);
    const result = {
      bodyA: joint.bodyA,
      bodyB: joint.bodyB,
      a: previous?.ok ? addWrenches(previous.value.a, a) : a,
      b: previous?.ok ? addWrenches(previous.value.b, b) : b,
      basis: effort.basis,
    };
    joints.set(
      joint.id,
      finiteWrench(result.a) && finiteWrench(result.b)
        ? forceAvailable(result)
        : forceUnavailable('invalid')
    );
  }
  const owned = new Set(partition.unknowns);
  for (const id of ids) {
    const internal = document.joints.filter(
      (joint) => system.groupOf.get(joint.bodyA) === id && system.groupOf.get(joint.bodyB) === id
    );
    if (internal.length === 0) continue;
    if (!owned.has(id) && !context.recoverBoundary) {
      for (const joint of internal) joints.set(joint.id, forceUnavailable('frame-context'));
      continue;
    }
    const members = memberForceLoads(
      document,
      system,
      frame,
      poses,
      id,
      mode,
      gravity,
      rates,
      context.materialWrenches
    );
    const recovered = recoverMemberReactions(document, system, frame, poses, id, members, efforts);
    for (const joint of internal) {
      if (!recovered.ok) {
        joints.set(joint.id, forceUnavailable(recovered.reason));
        continue;
      }
      const result = recovered.joints.get(joint.id);
      if (!result?.ok) {
        joints.set(joint.id, forceUnavailable(result ? result.reason : 'invalid'));
        continue;
      }
      const { ok, ...pair } = result;
      joints.set(
        joint.id,
        finiteWrench(pair.a) && finiteWrench(pair.b)
          ? forceAvailable(pair)
          : forceUnavailable('invalid')
      );
    }
  }
  return { ok: true, joints };
}
