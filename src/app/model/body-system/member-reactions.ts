import { BodyDocument } from './body-document';
import { BodyId, JointId } from './body-id';
import { CompiledBodySystem } from './compiled-body-system';
import { BodySolveFrame, solveFramePoint } from './body-solve-frame';
import { GroupPoses } from './body-constraint-rows';
import { BodyEfforts, solveBodyEfforts } from './body-efforts';
import { MemberForceLoads } from './member-force-loads';
import { internalForcePartition } from './internal-force-partition';
import {
  absoluteWrench,
  addWrenches,
  rowWrenches,
  scaleWrench,
  transportWrench,
  Wrench,
  ZERO_WRENCH,
} from './joint-wrenches';
import { rotate, scale } from './body-frame';

export type PairWrenchResult =
  | { readonly ok: false; readonly reason: 'indeterminate' }
  | {
      readonly ok: true;
      readonly bodyA: BodyId;
      readonly bodyB: BodyId;
      /** World-oriented SI wrenches about each named material body's own origin. */
      readonly a: Wrench;
      readonly b: Wrench;
      readonly basis: 'unique' | 'evenest';
    };
export type MemberReactions =
  | {
      readonly ok: false;
      readonly reason:
        | 'missing-rates'
        | 'invalid'
        | 'aggregate-properties'
        | 'load-owner'
        | 'external-reaction'
        | 'unbalanced';
    }
  | { readonly ok: true; readonly joints: ReadonlyMap<JointId, PairWrenchResult> };

/** Condensation removes internal efforts, not the material balances needed to recover them. */
export function recoverMemberReactions(
  document: BodyDocument,
  system: CompiledBodySystem,
  frame: BodySolveFrame,
  poses: GroupPoses,
  groupId: BodyId,
  loads: MemberForceLoads,
  external: BodyEfforts
): MemberReactions {
  if (!loads.ok) return loads;
  if (!external.ok) return { ok: false, reason: 'external-reaction' };
  const group = system.groups.get(groupId),
    pose = poses.get(groupId);
  if (!group || !pose || !frame.groupOffsets.has(groupId)) return { ok: false, reason: 'invalid' };
  const required = new Map([...loads.members].map(([id, entry]) => [id, entry.required]));
  const arithmetic = new Map([...loads.members].map(([id, entry]) => [id, entry.arithmeticScale]));
  const joints = new Map(document.joints.map((joint) => [joint.id, joint]));
  for (const row of frame.partition.rows) {
    const onA = row.pair.groupA === groupId,
      onB = row.pair.groupB === groupId;
    if (onA === onB) continue;
    const joint = joints.get(row.jointId),
      effort = external.efforts.get(row.key);
    if (!joint || !effort?.ok) return { ok: false, reason: 'external-reaction' };
    const id = onA ? joint.bodyA : joint.bodyB;
    if (!required.has(id)) continue;
    const reaction = rowWrenches(row, poses, effort.value);
    const wrench = onA ? reaction.a : reaction.b;
    required.set(id, addWrenches(required.get(id)!, scaleWrench(wrench, -1)));
    arithmetic.set(id, addWrenches(arithmetic.get(id)!, absoluteWrench(wrench)));
  }
  const internal = internalForcePartition(document, system, frame, poses, groupId);
  const solved = solveBodyEfforts(
    internal.partition,
    internal.poses,
    required,
    'unique',
    arithmetic
  );
  if (!solved.ok) return solved;
  const results = new Map<JointId, PairWrenchResult>();
  for (const row of internal.partition.rows) {
    const effort = solved.efforts.get(row.key)!;
    const previous = results.get(row.jointId);
    if (!effort.ok || previous?.ok === false) {
      results.set(row.jointId, { ok: false, reason: 'indeterminate' });
      continue;
    }
    const joint = joints.get(row.jointId)!;
    const pair = rowWrenches(row, internal.poses, effort.value);
    const atBody = (id: BodyId, wrench: Wrench) =>
      transportWrench(
        wrench,
        scale(rotate(solveFramePoint(frame, groupId, group.members.get(id)!), pose.angle), -1)
      );
    results.set(row.jointId, {
      ok: true,
      bodyA: joint.bodyA,
      bodyB: joint.bodyB,
      a: addWrenches(previous?.ok ? previous.a : ZERO_WRENCH, atBody(joint.bodyA, pair.a)),
      b: addWrenches(previous?.ok ? previous.b : ZERO_WRENCH, atBody(joint.bodyB, pair.b)),
      basis: external.sharedSupport ? 'evenest' : 'unique',
    });
  }
  return { ok: true, joints: results };
}
