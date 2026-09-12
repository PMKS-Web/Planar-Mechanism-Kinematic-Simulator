import { checkProductionSyntax } from './legacy-production-syntax';
import { BodyDocument, GroupAnnotation, BodyLoad } from '../../model/body-system/body-document';
import { AttachmentId, BodyId, ForceId, WORLD } from '../../model/body-system/body-id';
import { worldToLocal, relativePose } from '../../model/body-system/body-frame';
import { Attachment } from '../../model/body-system/joint-record';
import { validateBodyEditDocument } from '../../model/body-system/body-edit-validation';
import { StringTranscoder } from './string-transcoder';
import { JOINT_TYPE } from './transcoder-data';
import { legacyMaterial, legacyBodyId } from './legacy-production-material';
import { legacyProductionSettings } from './legacy-production-settings';
import { legacyProductionConnections } from './legacy-production-connections';

export type ProductionDocumentRead =
  | { readonly ok: true; readonly document: BodyDocument }
  | {
      readonly ok: false;
      readonly reason: 'unsupported-production' | 'invalid-format' | 'too-large';
      readonly message: string;
    };
/** This boundary recognizes production 2.0.3 records, not arbitrary unversioned staging drawings. */
export function readLegacyProduction(payload: string): ProductionDocumentRead {
  if (payload.length > 1024 * 1024)
    return {
      ok: false,
      reason: 'too-large',
      message: 'This production drawing is too large to import.',
    };
  try {
    if (!checkProductionSyntax(payload))
      return {
        ok: false,
        reason: 'unsupported-production',
        message:
          'This link is not a supported production drawing. Rebuild development drawings in the native editor.',
      };
    const reader = new StringTranscoder();
    reader.decodeURL(payload);
    const pins = reader.getJoints(),
      links = reader.getLinks();
    if (pins.length > 1000 || links.length > 1000 || reader.getForces().length > 1000)
      throw new Error('Too many production records.');
    if (
      pins.some(
        (j) =>
          j.isSealed ||
          j.carrierID ||
          j.slotJointAID ||
          j.slotJointBID ||
          j.driveSpeed ||
          (j.type === JOINT_TYPE.PRISMATIC && (!j.isGrounded || j.isWelded))
      ) ||
      reader.getLockedIds().length ||
      reader.getHolds().length ||
      reader.getComAnchors().length ||
      reader.getSynthesisMarks().length ||
      reader.getPartColors().length ||
      links.some((l) =>
        l.subsetLinkIDs.some((id) => links.find((c) => c.id === id)!.subsetLinkIDs.length)
      )
    )
      return {
        ok: false,
        reason: 'unsupported-production',
        message:
          'This development drawing uses unreleased records. Rebuild it in the native editor.',
      };
    const base = legacyProductionSettings(reader),
      roots = links.filter((l) => l.isRoot);
    const leaves = links
      .filter((l) => !l.subsetLinkIDs.length)
      .sort((a, b) => a.id.localeCompare(b.id));
    const owner = new Map<string, string>();
    for (const root of roots)
      for (const id of root.subsetLinkIDs.length ? root.subsetLinkIDs : [root.id]) {
        if (owner.has(id)) throw new Error('A leaf belongs to two production bodies.');
        owner.set(id, root.id);
      }
    if (
      leaves.some((l) => !owner.has(l.id)) ||
      links.some((l) => new Set(l.jointIDs).size !== l.jointIDs.length)
    )
      throw new Error('Orphaned or repeated production material.');
    const materials = leaves.map((l) => legacyMaterial(l, pins, base.settings.objectScale * 0.15));
    const attachments: Attachment[] = [];
    const point = (bodyId: BodyId, pinId: string) => {
      const id =
        `production:point:${encodeURIComponent(bodyId)}:${encodeURIComponent(pinId)}` as AttachmentId;
      if (!attachments.some((p) => p.id === id)) {
        const pin = pins.find((p) => p.id === pinId)!;
        const pose =
          bodyId === WORLD ? base.bodies[0].pose : materials.find((b) => b.id === bodyId)!.pose;
        attachments.push({
          id,
          bodyId,
          point: worldToLocal(pose, pin),
          label: pin.name,
          trace: pin.showCurve,
        });
      }
      return id;
    };
    for (const leaf of leaves) for (const pin of leaf.jointIDs) point(legacyBodyId(leaf.id), pin);
    const connections = legacyProductionConnections(reader, materials, owner, point);
    const groups: GroupAnnotation[] = roots
      .filter((r) => r.subsetLinkIDs.length)
      .map((root) => {
        const members = root.subsetLinkIDs.map(legacyBodyId).sort(),
          frameBody = members[0];
        const body = materials.find((b) => b.id === frameBody)!;
        return {
          members,
          frameBody,
          label: root.name,
          presentation: { fill: root.color, hidden: false, showCenter: false },
          mass: {
            mass: root.mass,
            ...(root.moiIsCustom ? { inertia: root.massMoI } : {}),
            ...(root.comIsCustom
              ? {
                  center: {
                    point: worldToLocal(body.pose, { x: root.xCoM, y: root.yCoM }),
                    editAnchor: 'body' as const,
                  },
                }
              : {}),
          },
        };
      });
    const forces: BodyLoad[] = reader.getForces().map((force) => {
      const link = links.find((l) => l.id === force.linkID)!;
      const members = (link.subsetLinkIDs.length ? link.subsetLinkIDs : [link.id])
        .map(legacyBodyId)
        .sort();
      const body = materials.find((b) => b.id === members[0])!;
      const dx = force.endX - force.startX,
        dy = force.endY - force.startY,
        length = Math.hypot(dx, dy);
      const sign = force.isFacingOut ? 1 : -1;
      if (!length && force.magnitude)
        throw new Error('A nonzero production load has no direction.');
      return {
        id: `production:force:${encodeURIComponent(force.id)}` as ForceId,
        bodyId: body.id,
        label: force.name,
        point: worldToLocal(body.pose, { x: force.startX, y: force.startY }),
        frame: force.isLocal ? 'body' : 'world',
        vector: {
          x: length ? (sign * force.magnitude * dx) / length : 0,
          y: length ? (sign * force.magnitude * dy) / length : 0,
        },
        couple: 0,
        ...(length ? { presentation: { length } } : {}),
        ...(members.length > 1
          ? {
              legacyGroupScope: {
                members: members.map((bodyId) => ({
                  bodyId,
                  poseInReference: relativePose(
                    body.pose,
                    materials.find((b) => b.id === bodyId)!.pose
                  ),
                })),
              },
            }
          : {}),
      };
    });
    const document: BodyDocument = {
      ...base,
      bodies: [...base.bodies, ...materials],
      attachments,
      ...connections,
      groups,
      forces,
    };
    const invalid = validateBodyEditDocument(document);
    if (invalid) throw new Error(JSON.stringify(invalid));
    return { ok: true, document };
  } catch (error) {
    return {
      ok: false,
      reason: 'invalid-format',
      message: 'This production drawing is invalid or has unsupported connectivity.',
    };
  }
}
