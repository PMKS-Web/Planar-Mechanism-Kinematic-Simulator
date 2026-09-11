import { BodyDocument } from '../../model/body-system/body-document';
import { compareRecordIds } from '../../model/body-system/body-id';

/** Sort sets and record tables only. Vertex winding and other authored sequences retain order. */
export function canonicalBodyDocument(document: BodyDocument): string {
  const byId = <T extends { readonly id: string }>(records: readonly T[]) =>
    [...records].sort((a, b) => compareRecordIds(a.id, b.id));
  const ids = (values: readonly string[]) => [...values].sort(compareRecordIds);
  const normalized = {
    ...document,
    bodies: byId(document.bodies),
    attachments: byId(document.attachments),
    joints: byId(document.joints),
    junctions: byId(document.junctions).map((j) => ({
      ...j,
      attachments: ids(j.attachments),
      joints: ids(j.joints),
    })),
    assemblies: byId(document.assemblies),
    drivers: byId(document.drivers),
    limits: byId(document.limits),
    forces: byId(document.forces).map((f) => ({
      ...f,
      ...(f.legacyGroupScope
        ? {
            legacyGroupScope: {
              members: [...f.legacyGroupScope.members].sort((a, b) =>
                compareRecordIds(a.bodyId, b.bodyId)
              ),
            },
          }
        : {}),
    })),
    groups: document.groups
      .map((g) => ({ ...g, members: ids(g.members) }))
      .sort((a, b) => compareRecordIds(JSON.stringify(a.members), JSON.stringify(b.members))),
    holds: [...document.holds].sort((a, b) => compareRecordIds(stableJson(a), stableJson(b))),
    locks: ids(document.locks),
  };
  return stableJson(normalized);
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    return Object.fromEntries(Object.entries(item).sort(([a], [b]) => compareRecordIds(a, b)));
  });
}
