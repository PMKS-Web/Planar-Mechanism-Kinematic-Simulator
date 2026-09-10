import { BodyDocument } from './body-document';
import { BodyId, compareRecordIds, JointId, WORLD } from './body-id';
import { compose, finitePose, IDENTITY_POSE, inverse, Pose } from './body-frame';

export interface WeldFrameGroup {
  readonly key: string;
  readonly frameBody: BodyId;
  readonly fixed: boolean;
  /** Document-length units and unwrapped radians, independent of analysis mass units. */
  readonly pose: Pose;
  /** Member-local frames expressed in the group frame, in document-length units. */
  readonly members: ReadonlyMap<BodyId, Pose>;
}

export type WeldFrameFailure = {
  readonly ok: false;
  readonly code: 'weld-cycle' | 'missing-body' | 'invalid-frame';
  readonly jointId?: JointId;
};
export type WeldFrameCompilation =
  | WeldFrameFailure
  | {
      readonly ok: true;
      readonly groups: readonly WeldFrameGroup[];
      readonly groupOf: ReadonlyMap<BodyId, WeldFrameGroup>;
    };

interface Edge {
  readonly to: BodyId;
  readonly transform: Pose;
  readonly jointId: JointId;
}

/** Condensation changes solver coordinates; it never replaces a material record. */
export function compileWeldFrames(document: BodyDocument): WeldFrameCompilation {
  if (
    document.bodies.some((body) => !finitePose(body.pose)) ||
    document.joints.some((joint) => joint.kind === 'weld' && !finitePose(joint.rest))
  )
    return { ok: false, code: 'invalid-frame' };
  const bodies = new Map(document.bodies.map((body) => [body.id, body]));
  const edges = new Map<BodyId, Edge[]>(document.bodies.map((body) => [body.id, []]));
  for (const joint of [...document.joints].sort((a, b) => compareRecordIds(a.id, b.id))) {
    if (joint.kind !== 'weld') continue;
    if (!bodies.has(joint.bodyA) || !bodies.has(joint.bodyB)) {
      return { ok: false, code: 'missing-body', jointId: joint.id };
    }
    edges.get(joint.bodyA)!.push({ to: joint.bodyB, transform: joint.rest, jointId: joint.id });
    edges
      .get(joint.bodyB)!
      .push({ to: joint.bodyA, transform: inverse(joint.rest), jointId: joint.id });
  }
  const groups: WeldFrameGroup[] = [];
  const groupOf = new Map<BodyId, WeldFrameGroup>();
  const order = [...bodies.keys()].sort((a, b) =>
    a === b ? 0 : a === WORLD ? -1 : b === WORLD ? 1 : compareRecordIds(a, b)
  );
  for (const root of order) {
    if (groupOf.has(root)) continue;
    const transforms = new Map<BodyId, Pose>([[root, IDENTITY_POSE]]);
    const queue = [root];
    for (let i = 0; i < queue.length; i++) {
      const from = queue[i];
      for (const edge of edges.get(from)!) {
        const candidate = compose(transforms.get(from)!, edge.transform);
        if (!finitePose(candidate))
          return { ok: false, code: 'invalid-frame', jointId: edge.jointId };
        const previous = transforms.get(edge.to);
        if (previous) {
          if (!sameTransform(previous, candidate))
            return { ok: false, code: 'weld-cycle', jointId: edge.jointId };
        } else {
          transforms.set(edge.to, candidate);
          queue.push(edge.to);
        }
      }
    }
    const members = new Map([...transforms].sort(([a], [b]) => compareRecordIds(a, b)));
    const group: WeldFrameGroup = {
      key: JSON.stringify([...members.keys()]),
      frameBody: root,
      fixed: root === WORLD,
      pose: bodies.get(root)!.pose,
      members,
    };
    groups.push(group);
    for (const id of members.keys()) groupOf.set(id, group);
  }
  return { ok: true, groups, groupOf };
}

/** Rest angles share one unwrapped pose set; a turn mismatch changes relative coordinates. */
export function sameTransform(a: Pose, b: Pose): boolean {
  const size = Math.max(1, Math.hypot(a.x, a.y), Math.hypot(b.x, b.y));
  return Math.hypot(a.x - b.x, a.y - b.y) <= 1e-10 * size && Math.abs(a.angle - b.angle) <= 1e-10;
}
