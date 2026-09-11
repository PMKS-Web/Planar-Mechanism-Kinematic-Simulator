import { bodyGroupPresentation } from './body-group-presentation';
import { BodyDocument, GroupAnnotation } from './body-document';
import { BodyEditRefusal } from './body-edit-types';
import { BodyId, compareRecordIds } from './body-id';
import { localToWorld, worldToLocal } from './body-frame';
import { resolveMass } from './body-properties';
import { bodyEditRefusal } from './joint-permission';
import { compileWeldFrames, WeldFrameGroup } from './weld-frames';

/** A derived component can change identity without taking its members' paint or mass with it. */
export function bodyGroupLineage(
  before: BodyDocument,
  candidate: BodyDocument,
  target?: BodyId
): { readonly ok: true; readonly groups: readonly GroupAnnotation[] } | BodyEditRefusal {
  const old = compileWeldFrames(before),
    next = compileWeldFrames(candidate);
  if (!old.ok || !next.ok) return bodyEditRefusal('invalid-document');
  const inherited = new Map<string, GroupAnnotation>();
  for (const annotation of before.groups) {
    const successors = new Set(annotation.members.flatMap((id) => next.groupOf.get(id) ?? []));
    if (!successors.size) continue;
    if (successors.size > 1) {
      if (hasOverride(annotation))
        return bodyEditRefusal('aggregate-properties', [
          { kind: 'group', members: annotation.members },
        ]);
      continue;
    }
    const successor = [...successors][0];
    if (annotation.mass && hasOverride(annotation)) {
      const prior = new Set(annotation.members);
      const changed = [
        ...annotation.members.filter((id) => !successor.members.has(id)),
        ...[...successor.members.keys()].filter((id) => !prior.has(id)),
      ];
      if (changed.some((id) => hasMaterialInertia(prior.has(id) ? before : candidate, id)))
        return bodyEditRefusal('aggregate-properties', [
          { kind: 'group', members: annotation.members },
        ]);
      if (inherited.get(successor.key)?.mass)
        return bodyEditRefusal('aggregate-properties', [
          { kind: 'group', members: [...successor.members.keys()] },
        ]);
      const frameBody = successor.members.has(annotation.frameBody)
        ? annotation.frameBody
        : successor.frameBody;
      const center = annotation.mass.center;
      const oldFrame = before.bodies.find((body) => body.id === annotation.frameBody)!.pose;
      const newFrame = candidate.bodies.find((body) => body.id === frameBody)!.pose;
      inherited.set(successor.key, {
        members: [...successor.members.keys()],
        frameBody,
        mass: {
          ...annotation.mass,
          ...(center && frameBody !== annotation.frameBody
            ? {
                center: {
                  ...center,
                  point: worldToLocal(newFrame, localToWorld(oldFrame, center.point)),
                },
              }
            : {}),
        },
      });
    }
  }
  const groups: GroupAnnotation[] = [];
  for (const group of next.groups) {
    const predecessors = [
      ...new Set([...group.members.keys()].flatMap((id) => old.groupOf.get(id) ?? [])),
    ];
    const winner = predecessors.sort((a, b) => preferred(a, b, target))[0];
    const annotation =
      winner && before.groups.find((item) => item.members.includes(winner.frameBody));
    const staysTogether =
      winner &&
      [...winner.members.keys()].every(
        (id) => !next.groupOf.has(id) || next.groupOf.get(id) === group
      );
    const presentation =
      (group.members.size > 1 || winner?.key === group.key) && staysTogether && winner
        ? winner.key !== group.key
          ? bodyGroupPresentation(before, winner)
          : annotation
            ? {
                ...(annotation.label !== undefined ? { label: annotation.label } : {}),
                ...(annotation.presentation ? { presentation: annotation.presentation } : {}),
              }
            : {}
        : {};
    const mass =
      inherited.get(group.key) ??
      (winner?.key === group.key && annotation?.mass
        ? { members: annotation.members, frameBody: annotation.frameBody, mass: annotation.mass }
        : undefined);
    if (mass || Object.keys(presentation).length)
      groups.push({
        ...mass,
        members: [...group.members.keys()],
        frameBody:
          mass?.frameBody ??
          (annotation && group.members.has(annotation.frameBody)
            ? annotation.frameBody
            : group.frameBody),
        ...presentation,
      });
  }
  // New disjoint assemblies may bring their own annotations in the same insertion transaction.
  for (const annotation of candidate.groups) {
    if (before.groups.includes(annotation)) continue;
    groups.push(annotation);
  }
  return { ok: true, groups };
}

function preferred(a: WeldFrameGroup, b: WeldFrameGroup, target?: BodyId): number {
  if (target && a.members.has(target) !== b.members.has(target))
    return a.members.has(target) ? -1 : 1;
  return b.members.size - a.members.size || compareRecordIds(a.frameBody, b.frameBody);
}
function hasMaterialInertia(document: BodyDocument, id: BodyId): boolean {
  const body = document.bodies.find((item) => item.id === id);
  if (!body || body.kind === 'world') return false;
  const mass = resolveMass(body, document.units);
  return mass.mass !== 0 || mass.inertia !== 0;
}

function hasOverride(annotation: GroupAnnotation): boolean {
  return !!annotation.mass && Object.values(annotation.mass).some((value) => value !== undefined);
}
