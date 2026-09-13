import { bodyMotionRecord } from './body-motion-record';
import { BodyDocument } from './body-document';
import { BodyEditEffects, BodySelectionRef, BodyRecordRef } from './body-edit-types';
import { BodyId, compareRecordIds, WORLD } from './body-id';
import { compileBodyDocument } from './constraint-compiler';
import { compileWeldFrames } from './weld-frames';

export function sameBodyRecord(a: unknown, b: unknown): boolean {
  return recordText(a) === recordText(b);
}
function recordText(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => compareRecordIds(a, b)))
      : item
  );
}
function records(
  document: BodyDocument,
  scope: 'all' | 'motion' = 'all'
): Map<string, { ref: BodyRecordRef; value: unknown }> {
  const entries: { ref: BodyRecordRef; value: unknown }[] = [];
  for (const field of ['settings', 'synthesis', 'view', 'units'] as const)
    if (document[field] !== undefined)
      entries.push({ ref: { kind: 'project', field }, value: document[field] });
  for (const [table, kind] of [
    ['bodies', 'body'],
    ['attachments', 'attachment'],
    ['joints', 'joint'],
    ['junctions', 'junction'],
    ['assemblies', 'assembly'],
    ['forces', 'force'],
    ['drivers', 'driver'],
    ['limits', 'limit'],
  ] as const)
    for (const value of document[table])
      entries.push({ ref: { kind, id: value.id } as BodyRecordRef, value });
  for (const group of document.groups) {
    const members = [...group.members].sort(compareRecordIds);
    entries.push({ ref: { kind: 'group', members }, value: { ...group, members } });
  }
  for (const hold of document.holds)
    entries.push({
      ref: { kind: 'hold', bodyId: hold.bodyId, from: hold.from, to: hold.to },
      value: hold,
    });
  for (const id of document.locks) entries.push({ ref: { kind: 'lock', id }, value: id });
  const kept =
    scope === 'all'
      ? entries
      : entries
          .map((entry) => ({ ...entry, value: bodyMotionRecord(entry.ref, entry.value) }))
          .filter((entry) => entry.value !== undefined);
  return new Map(kept.map((entry) => [recordText(entry.ref), entry]));
}
export function bodyEditEffects(
  before: BodyDocument,
  after: BodyDocument,
  scope: 'all' | 'motion' = 'all'
): BodyEditEffects {
  const old = records(before, scope),
    next = records(after, scope),
    added: BodyRecordRef[] = [],
    removed: BodyRecordRef[] = [],
    changed: BodyRecordRef[] = [];
  for (const [key, record] of old) {
    if (!next.has(key)) removed.push(record.ref);
    else if (!sameBodyRecord(record.value, next.get(key)!.value)) changed.push(record.ref);
  }
  for (const [key, record] of next) if (!old.has(key)) added.push(record.ref);
  const affected = new Set<BodyId>();
  for (const document of [before, after])
    for (const ref of [...added, ...removed, ...changed]) {
      switch (ref.kind) {
        case 'project':
          if (
            ref.field === 'units' ||
            (ref.field === 'settings' &&
              (before.settings.gravity !== after.settings.gravity ||
                before.settings.forceAnalysis !== after.settings.forceAnalysis))
          )
            document.bodies.forEach((body) => affected.add(body.id));
          break;
        case 'body':
          affected.add(ref.id);
          break;
        case 'group':
          ref.members.forEach((id) => affected.add(id));
          break;
        case 'hold':
          affected.add(ref.bodyId);
          break;
        case 'attachment':
        case 'lock': {
          const point = document.attachments.find((item) => item.id === ref.id);
          if (point) affected.add(point.bodyId);
          break;
        }
        case 'force': {
          const force = document.forces.find((item) => item.id === ref.id);
          if (force) affected.add(force.bodyId);
          break;
        }
        case 'assembly': {
          const assembly = document.assemblies.find((item) => item.id === ref.id);
          if (assembly) {
            affected.add(assembly.barrel);
            affected.add(assembly.rod);
          }
          break;
        }
        case 'joint':
        case 'driver':
        case 'limit': {
          const id =
            ref.kind === 'joint'
              ? ref.id
              : document[ref.kind === 'driver' ? 'drivers' : 'limits'].find(
                  (item) => item.id === ref.id
                )?.coordinate.jointId;
          const joint = document.joints.find((item) => item.id === id);
          if (joint) {
            affected.add(joint.bodyA);
            affected.add(joint.bodyB);
          }
          break;
        }
      }
    }
  affected.delete(WORLD);
  const partitions = new Set<string>();
  for (const document of [before, after]) {
    const compiled = compileBodyDocument(document);
    if (!compiled.ok) continue;
    for (const partition of compiled.system.partitions)
      if (
        partition.materialIds.some((id) => affected.has(id)) ||
        partition.boundary.some((group) =>
          [...compiled.system.groups.get(group)!.members.keys()].some((id) => affected.has(id))
        )
      )
        partitions.add(partition.key);
  }
  const order = (refs: BodyRecordRef[]) =>
    refs.sort((a, b) => compareRecordIds(recordText(a), recordText(b)));
  return {
    added: order(added),
    removed: order(removed),
    changed: order(changed),
    invalidatedBodies: [...affected].sort(compareRecordIds),
    invalidatedPartitions: [...partitions].sort(compareRecordIds),
  };
}
export function retainBodySelection(
  document: BodyDocument,
  selection: readonly BodySelectionRef[]
): BodySelectionRef[] {
  const live = records(document),
    frames = compileWeldFrames(document),
    result: BodySelectionRef[] = [];
  for (const ref of selection) {
    if (ref.kind !== 'group') {
      if (live.has(recordText(ref)) && !(ref.kind === 'body' && ref.id === WORLD)) result.push(ref);
    } else if (frames.ok) {
      const groups = new Set(ref.members.flatMap((id) => frames.groupOf.get(id) ?? []));
      if (groups.size !== 1) continue;
      const group = [...groups][0],
        members = [...group.members.keys()];
      const material = members.filter((id) => id !== WORLD);
      if (material.length > 1) result.push({ kind: 'group', members });
      else if (material.length === 1) result.push({ kind: 'body', id: material[0] });
    }
  }
  return [...new Map(result.map((ref) => [recordText(ref), ref])).values()];
}
