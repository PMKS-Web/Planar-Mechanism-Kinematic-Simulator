import { BodyDocument } from '../../model/body-system/body-document';
import {
  AttachmentId,
  BodyId,
  DriverId,
  JointId,
  JunctionId,
  WORLD,
} from '../../model/body-system/body-id';
import { relativePose } from '../../model/body-system/body-frame';
import { BodyJoint, PinJunction } from '../../model/body-system/joint-record';
import { MaterialBody } from '../../model/body-system/material-body';
import { JOINT_TYPE, LINK_TYPE } from './transcoder-data';
import { GenericTranscoder } from './transcoder-interface';
import { legacyBodyId } from './legacy-production-material';
import { legacyProductionSettings } from './legacy-production-settings';

export function legacyProductionConnections(
  reader: GenericTranscoder,
  bodies: readonly MaterialBody[],
  owner: ReadonlyMap<string, string>,
  point: (body: BodyId, pin: string) => AttachmentId
): Pick<BodyDocument, 'joints' | 'junctions' | 'drivers'> {
  const joints: BodyJoint[] = [],
    junctions: PinJunction[] = [],
    drivers: BodyDocument['drivers'][number][] = [];
  const pins = reader.getJoints(),
    links = reader.getLinks().filter((l) => !l.subsetLinkIDs.length);
  const pose = (id: BodyId) =>
    id === WORLD ? { x: 0, y: 0, angle: 0 } : bodies.find((b) => b.id === id)!.pose;
  let serial = 0;
  const edge = (kind: BodyJoint['kind'], a: BodyId, b: BodyId, pin: string, axis = 0) => {
    const pair = {
      id: `production:joint:${serial++}` as JointId,
      label: pins.find((p) => p.id === pin)!.name,
      bodyA: a,
      bodyB: b,
      frameA: { attachmentId: point(a, pin), angle: axis },
      frameB: { attachmentId: point(b, pin), angle: axis },
    };
    const joint: BodyJoint =
      kind === 'weld'
        ? { ...pair, kind, rest: relativePose(pose(a), pose(b)) }
        : kind === 'revolute'
          ? { ...pair, kind, angleZero: 0 }
          : {
              ...pair,
              kind,
              angleZero: 0,
              travelZero: 0,
              guideDisplay: { bodyId: a, frame: pair.frameA },
            };
    joints.push(joint);
    return joint;
  };
  for (const pin of [...pins].sort((a, b) => a.id.localeCompare(b.id))) {
    const incident = links
      .filter((l) => l.jointIDs.includes(pin.id))
      .sort((a, b) => a.id.localeCompare(b.id));
    let driven: BodyJoint | undefined;
    if (pin.type === JOINT_TYPE.PRISMATIC) {
      if (
        incident.length !== 1 ||
        incident[0].type !== LINK_TYPE.PISTON ||
        incident[0].jointIDs.length !== 2
      )
        throw new Error('Unsupported production slider.');
      const block = incident[0],
        mate = pins.find((j) => j.id === block.jointIDs.find((id) => id !== pin.id))!;
      if (
        mate.type !== JOINT_TYPE.REVOLUTE ||
        mate.isGrounded ||
        mate.x !== pin.x ||
        mate.y !== pin.y ||
        block.subsetLinkIDs.length
      )
        throw new Error('Unsupported production carriage.');
      driven = edge('prismatic', WORLD, legacyBodyId(block.id), pin.id, pin.angleRadians);
    } else {
      if (
        incident.some(
          (l) =>
            l.type === LINK_TYPE.PISTON &&
            !l.jointIDs.some((id) => pins.find((p) => p.id === id)!.type === JOINT_TYPE.PRISMATIC)
        )
      )
        throw new Error('Unsupported production Slide.');
      const starts: BodyId[] = pin.isGrounded ? [WORLD] : [],
        members: AttachmentId[] = [],
        edges: JointId[] = [];
      const byRoot = new Map<string, typeof incident>();
      for (const leaf of incident) {
        const key = owner.get(leaf.id)!;
        byRoot.set(key, [...(byRoot.get(key) ?? []), leaf]);
      }
      for (const parts of byRoot.values()) {
        const hub = legacyBodyId(parts[0].id);
        starts.push(hub);
        for (const leaf of parts.slice(1)) {
          if (!pin.isWelded) continue;
          edges.push(edge('weld', hub, legacyBodyId(leaf.id), pin.id).id);
        }
        // An unwelded common pin inside a compound still preserves its binary coincidence.
        if (!pin.isWelded) starts.push(...parts.slice(1).map((l) => legacyBodyId(l.id)));
        members.push(...parts.map((l) => point(legacyBodyId(l.id), pin.id)));
      }
      if (pin.isGrounded) members.unshift(point(WORLD, pin.id));
      for (const body of starts.slice(1)) {
        const joint = edge('revolute', starts[0], body, pin.id);
        edges.push(joint.id);
        driven ??= joint;
      }
      if (members.length >= 2)
        junctions.push({
          id: `production:pin:${encodeURIComponent(pin.id)}` as JunctionId,
          hub: point(starts[0], pin.id),
          attachments: members,
          joints: edges,
        });
      if (!incident.length) point(WORLD, pin.id);
      if (pin.isInput && (!pin.isGrounded || starts.length !== 2))
        throw new Error('Ambiguous production drive.');
    }
    if (pin.isInput) {
      if (!driven) throw new Error('Missing production drive.');
      const coordinate = pin.type === JOINT_TYPE.PRISMATIC ? 'travel' : 'angle';
      drivers.push({
        id: `production:drive:${encodeURIComponent(pin.id)}` as DriverId,
        coordinate: { jointId: driven.id, coordinate },
        profile: {
          kind: 'constant-speed',
          initial: 0,
          speed:
            coordinate === 'angle'
              ? legacyProductionSettings(reader).settings.defaultDrive.angular
              : 5,
        },
      });
    }
  }
  return { joints, junctions, drivers };
}
