import { AttachmentId, BodyId } from './body-id';
import { add, localToWorld, Point, scale, subtract } from './body-frame';
import { CompiledAttachment, CompiledBodyGroup } from './compiled-body-system';
import { ResolvedMass } from './body-properties';

/** Place numerical origins near constraint geometry without rebasing any authored material. */
export function solverGroupFrames(
  sourceGroups: ReadonlyMap<BodyId, CompiledBodyGroup>,
  sourceAnchors: ReadonlyMap<AttachmentId, CompiledAttachment>,
  referenced: ReadonlySet<AttachmentId>
) {
  const origins = new Map<BodyId, Point>();
  const groups = new Map<BodyId, CompiledBodyGroup>();
  for (const [id, group] of sourceGroups) {
    const anchors = [...sourceAnchors.values()].filter(
      (anchor) => anchor.groupId === id && referenced.has(anchor.id)
    );
    const origin =
      group.fixed || anchors.length === 0
        ? { x: 0, y: 0 }
        : mean(anchors.map((anchor) => anchor.point));
    origins.set(id, origin);
    const shiftMass = (mass: ResolvedMass): ResolvedMass => ({
      ...mass,
      center: mass.center && subtract(mass.center, origin),
      displayCenter: subtract(mass.displayCenter, origin),
    });
    groups.set(id, {
      ...group,
      pose: { ...localToWorld(group.pose, origin), angle: group.pose.angle },
      members: new Map(
        [...group.members].map(([member, pose]) => [
          member,
          { ...subtract(pose, origin), angle: pose.angle },
        ])
      ),
      mass: shiftMass(group.mass),
      materialMass: shiftMass(group.materialMass),
    });
  }
  const attachments = new Map(
    [...sourceAnchors].map(([id, anchor]) => [
      id,
      {
        ...anchor,
        point: subtract(anchor.point, origins.get(anchor.groupId)!),
      },
    ])
  );
  return { groups, attachments };
}

function mean(points: readonly Point[]): Point {
  const origin = points[0];
  return add(
    origin,
    scale(
      points.reduce((sum, point) => add(sum, subtract(point, origin)), { x: 0, y: 0 }),
      1 / points.length
    )
  );
}
