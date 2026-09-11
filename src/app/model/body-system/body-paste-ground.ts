import { BodyDocument, GroupAnnotation } from './body-document';
import { BodyInsertRecords, BodyEditRefusal } from './body-edit-types';
import { BodyPropertyOperation } from './body-property-types';
import { localToWorld, worldToLocal, IDENTITY_POSE } from './body-frame';
import { WORLD } from './body-id';
import { WeldFrameGroup } from './weld-frames';
import { resolveMass } from './body-properties';
import { bodyEditRefusal } from './joint-permission';

/** Zero-inertia material can join an aggregate without inventing a distribution of its custom properties. */
export function pastedGroundProperties(
  destination: BodyDocument,
  target: WeldFrameGroup,
  records: BodyInsertRecords,
  incoming: GroupAnnotation | undefined
): { readonly ok: true; readonly properties: readonly BodyPropertyOperation[] } | BodyEditRefusal {
  if (!incoming?.mass || !Object.values(incoming.mass).some((value) => value !== undefined))
    return { ok: true, properties: [] };
  const existing = destination.groups.find((group) => group.members.includes(WORLD));
  if (
    (existing?.mass && Object.values(existing.mass).some((value) => value !== undefined)) ||
    [...target.members.keys()].some((id) => {
      const body = destination.bodies.find((item) => item.id === id)!;
      if (body.kind === 'world') return false;
      const mass = resolveMass(body, destination.units);
      return mass.mass !== 0 || mass.inertia !== 0;
    })
  )
    return bodyEditRefusal('aggregate-properties', [{ kind: 'group', members: incoming.members }]);
  const frameBody = existing?.frameBody ?? target.frameBody;
  const frame = destination.bodies.find((body) => body.id === frameBody)!.pose;
  const sourceFrame =
    records.bodies?.find((body) => body.id === incoming.frameBody)?.pose ?? IDENTITY_POSE;
  const mass = incoming.mass;
  return {
    ok: true,
    properties: [
      {
        kind: 'group-properties',
        members: [...new Set([...target.members.keys(), ...incoming.members])],
        change: {
          mass: {
            ...mass,
            ...(mass.center
              ? {
                  center: {
                    ...mass.center,
                    point: worldToLocal(frame, localToWorld(sourceFrame, mass.center.point)),
                  },
                }
              : {}),
          },
        },
      },
    ],
  };
}
