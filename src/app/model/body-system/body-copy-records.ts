import { BodyDocument } from './body-document';
import { BodyInsertRecords } from './body-edit-types';
import { Point, relativePose, rotate } from './body-frame';
import { VertexId, WORLD } from './body-id';
import { BodyJoint, JointCoordinateRef, JointFrame } from './joint-record';
import { BodyGeometry, CenterEditAnchor } from './material-body';
import { BodyCopyIds, copiedId } from './body-copy-ids';

/** Only explicit ground endpoints stay on WORLD; all material and annotation references use the same map. */
export function copyBodyRecords(
  source: BodyDocument,
  ids: BodyCopyIds,
  offset: Point
): BodyInsertRecords {
  const move = <T extends Point>(p: T): T => ({ ...p, x: p.x + offset.x, y: p.y + offset.y });
  const bodyId = (id: typeof WORLD) => copiedId(ids.bodies, id);
  const anchor = (id: JointFrame['attachmentId']) => copiedId(ids.attachments, id);
  const frame = (f: JointFrame): JointFrame => ({ ...f, attachmentId: anchor(f.attachmentId) });
  const coordinate = (c: JointCoordinateRef): JointCoordinateRef => ({
    ...c,
    jointId: copiedId(ids.joints, c.jointId),
  });
  const editAnchor = (value: CenterEditAnchor): CenterEditAnchor =>
    typeof value === 'string' ? value : { attachmentId: anchor(value.attachmentId) };
  const poses = new Map(
    source.bodies.map((body) => [body.id, body.kind === 'world' ? body.pose : move(body.pose)])
  );
  return {
    bodies: source.bodies.flatMap((body) => {
      if (body.kind === 'world') return [];
      const vertex = (id: VertexId) => copiedId(ids.vertices.get(body.id)!, id);
      const geometry: BodyGeometry =
        body.geometry.kind === 'circle'
          ? body.geometry
          : ({
              ...body.geometry,
              vertices: body.geometry.vertices.map((point) => ({ ...point, id: vertex(point.id) })),
            } as BodyGeometry);
      const center = body.mass.center;
      return [
        {
          ...body,
          id: bodyId(body.id),
          pose: poses.get(body.id)!,
          geometry,
          mass: {
            ...body.mass,
            center:
              center.mode === 'automatic'
                ? center
                : {
                    ...center,
                    editAnchor: editAnchor(center.editAnchor),
                    ...(center.editAxis
                      ? {
                          editAxis: [
                            vertex(center.editAxis[0]),
                            vertex(center.editAxis[1]),
                          ] as const,
                        }
                      : {}),
                  },
          },
        },
      ];
    }),
    attachments: source.attachments.map((point) => ({
      ...point,
      id: anchor(point.id),
      bodyId: bodyId(point.bodyId),
      point: point.bodyId === WORLD ? move(point.point) : point.point,
      ...(point.vertexId
        ? { vertexId: copiedId(ids.vertices.get(point.bodyId)!, point.vertexId) }
        : {}),
    })),
    joints: source.joints.map((joint): BodyJoint => ({
      ...joint,
      id: copiedId(ids.joints, joint.id),
      bodyA: bodyId(joint.bodyA),
      bodyB: bodyId(joint.bodyB),
      frameA: frame(joint.frameA),
      frameB: frame(joint.frameB),
      ...(joint.kind === 'weld' && [joint.bodyA, joint.bodyB].includes(WORLD)
        ? { rest: relativePose(poses.get(joint.bodyA)!, poses.get(joint.bodyB)!) }
        : {}),
      ...('guideDisplay' in joint && joint.guideDisplay
        ? {
            guideDisplay: {
              ...joint.guideDisplay,
              bodyId: bodyId(joint.guideDisplay.bodyId),
              frame: frame(joint.guideDisplay.frame),
            },
          }
        : {}),
    })),
    junctions: source.junctions.map((pin) => ({
      ...pin,
      id: copiedId(ids.junctions, pin.id),
      hub: anchor(pin.hub),
      attachments: pin.attachments.map(anchor),
      joints: pin.joints.map((id) => copiedId(ids.joints, id)),
    })),
    assemblies: source.assemblies.map((assembly) => ({
      ...assembly,
      id: copiedId(ids.assemblies, assembly.id),
      barrel: bodyId(assembly.barrel),
      rod: bodyId(assembly.rod),
      barrelMount: anchor(assembly.barrelMount),
      rodMount: anchor(assembly.rodMount),
      internalJoint: copiedId(ids.joints, assembly.internalJoint),
      strokeLimit: copiedId(ids.limits, assembly.strokeLimit),
    })),
    drivers: source.drivers.map((driver) => ({
      ...driver,
      id: copiedId(ids.drivers, driver.id),
      coordinate: coordinate(driver.coordinate),
    })),
    limits: source.limits.map((limit) => ({
      ...limit,
      id: copiedId(ids.limits, limit.id),
      coordinate: coordinate(limit.coordinate),
    })),
    forces: source.forces.map((load) => ({
      ...load,
      id: copiedId(ids.forces, load.id),
      bodyId: bodyId(load.bodyId),
      ...(load.legacyGroupScope
        ? {
            legacyGroupScope: {
              members: load.legacyGroupScope.members.map((member) => {
                const delta =
                  member.bodyId === WORLD
                    ? rotate({ x: -offset.x, y: -offset.y }, -poses.get(load.bodyId)!.angle)
                    : { x: 0, y: 0 };
                return {
                  bodyId: bodyId(member.bodyId),
                  poseInReference: {
                    ...member.poseInReference,
                    x: member.poseInReference.x + delta.x,
                    y: member.poseInReference.y + delta.y,
                  },
                };
              }),
            },
          }
        : {}),
    })),
    groups: source.groups.map((group) => ({
      ...group,
      members: group.members.map(bodyId),
      frameBody: bodyId(group.frameBody),
      ...(group.mass
        ? {
            mass: {
              ...group.mass,
              ...(group.mass.center
                ? {
                    center: {
                      ...group.mass.center,
                      point:
                        group.frameBody === WORLD
                          ? move(group.mass.center.point)
                          : group.mass.center.point,
                      editAnchor: editAnchor(group.mass.center.editAnchor),
                    },
                  }
                : {}),
            },
          }
        : {}),
    })),
    holds: source.holds.map((hold) => ({
      ...hold,
      bodyId: bodyId(hold.bodyId),
      from: anchor(hold.from),
      to: anchor(hold.to),
    })),
    locks: source.locks.map(anchor),
  };
}
