import { BodyDocument } from './body-document';
import { BodyId, JointId, compareRecordIds, WORLD } from './body-id';
import { finitePoint, Point } from './body-frame';
import { CompiledBodySystem } from './compiled-body-system';
import { BodyForceFrame } from './force-frame-result';
import { SampleIdentity } from './sample-results';
import { finiteWrench, MaterialWrenches, Wrench } from './joint-wrenches';

export type FixedForceInputRefusal =
  'missing-sample' | 'duplicate-sample' | 'mixed-context' | 'external-reaction' | 'invalid';
export type FixedForceInputs =
  | { readonly ok: false; readonly reason: FixedForceInputRefusal }
  | {
      readonly ok: true;
      readonly samples: readonly SampleIdentity[];
      readonly materialWrenches: MaterialWrenches;
      readonly conditional: boolean;
    };

/** A fixed material needs every incident machine, but a pin acting directly on WORLD has no material balance. */
export function fixedForceInputs(
  document: BodyDocument,
  system: CompiledBodySystem,
  revision: number,
  frames: readonly BodyForceFrame[],
  mode: 'static' | 'dynamic',
  gravity: Point
): FixedForceInputs {
  if (!Number.isInteger(revision) || revision < 0 || !finitePoint(gravity))
    return { ok: false, reason: 'invalid' };
  const partitions = new Map(system.partitions.map((partition) => [partition.key, partition]));
  const supplied = new Map<string, BodyForceFrame>();
  for (const frame of frames) {
    if (supplied.has(frame.sample.partitionKey)) return { ok: false, reason: 'duplicate-sample' };
    if (
      !partitions.has(frame.sample.partitionKey) ||
      frame.sample.revision !== revision ||
      frame.mode !== mode ||
      frame.gravity.x !== gravity.x ||
      frame.gravity.y !== gravity.y
    )
      return { ok: false, reason: 'mixed-context' };
    supplied.set(frame.sample.partitionKey, frame);
  }
  const joints = new Map(document.joints.map((joint) => [joint.id, joint]));
  const materialWrenches = new Map<BodyId, Wrench[]>(),
    samples: SampleIdentity[] = [];
  let conditional = false;
  for (const partition of system.partitions) {
    const incident = new Map<JointId, BodyId>();
    for (const row of partition.rows) {
      const joint = joints.get(row.jointId);
      if (!joint) return { ok: false, reason: 'invalid' };
      for (const [groupId, bodyId] of [
        [row.pair.groupA, joint.bodyA],
        [row.pair.groupB, joint.bodyB],
      ] as const)
        if (bodyId !== WORLD && system.groups.get(groupId)!.fixed) incident.set(joint.id, bodyId);
    }
    if (!incident.size) continue;
    const frame = supplied.get(partition.key);
    if (!frame) return { ok: false, reason: 'missing-sample' };
    if (!frame.ok) return { ok: false, reason: 'external-reaction' };
    samples.push({ ...frame.sample });
    for (const [jointId, bodyId] of incident) {
      const pair = frame.joints.get(jointId),
        joint = joints.get(jointId)!;
      if (!pair?.ok) return { ok: false, reason: 'external-reaction' };
      if (pair.value.bodyA !== joint.bodyA || pair.value.bodyB !== joint.bodyB)
        return { ok: false, reason: 'invalid' };
      const wrench = bodyId === joint.bodyA ? pair.value.a : pair.value.b;
      if (!finiteWrench(wrench)) return { ok: false, reason: 'invalid' };
      const bodyWrenches = materialWrenches.get(bodyId) ?? [];
      bodyWrenches.push(wrench);
      materialWrenches.set(bodyId, bodyWrenches);
      conditional ||= pair.value.basis === 'evenest';
    }
  }
  return {
    ok: true,
    materialWrenches,
    samples: samples.sort((a, b) => compareRecordIds(a.partitionKey, b.partitionKey)),
    conditional,
  };
}
