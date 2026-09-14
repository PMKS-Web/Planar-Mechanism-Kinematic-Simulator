import { bodySlotChannels } from './body-mounted-skin';
import { BodyDocument } from './body-document';
import { BodyId, compareRecordIds } from './body-id';
import { MaterialBody } from './material-body';
import { add, localToWorld, rotate } from './body-frame';
import { compileWeldFrames } from './weld-frames';
import { bodyGroupPresentation } from './body-group-presentation';
import { nativeMaterialSkin } from './body-cylinder-skin';
import { buildCompoundPath, transformRigidPath, mergedChannels } from '../compound-link-path';

/** A weld has one painted contour; its member hit targets retain their material identities. */
export function bodyCompoundMarks(document: BodyDocument) {
  const frames = compileWeldFrames(document);
  if (!frames.ok) return [];
  return frames.groups.flatMap((group) => {
    const members = document.bodies
      .filter(
        (body): body is MaterialBody =>
          body.kind === 'material' && group.members.has(body.id) && !body.presentation.hidden
      )
      .sort((a, b) => compareRecordIds(a.id, b.id));
    if (members.length < 2) return [];
    const presentation = bodyGroupPresentation(document, group);
    if (presentation.presentation?.hidden) return [];
    const paths = members.map((body) =>
      transformRigidPath(
        nativeMaterialSkin(document, body),
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        body.pose,
        add(body.pose, rotate({ x: 1, y: 0 }, body.pose.angle))
      )
    );
    const points = members.flatMap((body) =>
      (body.geometry.kind === 'circle' ? [body.geometry.center] : body.geometry.vertices).map(
        (point) => localToWorld(body.pose, point)
      )
    );
    return [
      {
        key: group.key,
        members: members.map((body) => body.id) as readonly BodyId[],
        path:
          buildCompoundPath(paths, document.settings.objectScale * 0.15).path +
          ' ' +
          mergedChannels(
            members
              .map((body) =>
                transformRigidPath(
                  bodySlotChannels(document, body),
                  { x: 0, y: 0 },
                  { x: 1, y: 0 },
                  body.pose,
                  localToWorld(body.pose, { x: 1, y: 0 })
                )
              )
              .filter(Boolean)
          ),
        fill: presentation.presentation?.fill ?? members[0].presentation.fill,
        label: presentation.label ?? members[0].label,
        center: {
          x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
          y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
        },
      },
    ];
  });
}
