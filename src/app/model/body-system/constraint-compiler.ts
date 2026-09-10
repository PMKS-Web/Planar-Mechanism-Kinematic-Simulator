import { solverGroupFrames } from './solver-group-frames';
import { BodyDocument } from './body-document';
import { BodyId } from './body-id';
import { localToWorld, relativePose, scale } from './body-frame';
import { validateBodyDocument, DocumentIssue } from './body-validation';
import { unitFactors } from './body-units';
import { compileWeldGroups, groupPoseSI } from './weld-groups';
import { sameTransform } from './weld-frames';
import { CompiledBodyGroup, CompiledBodySystem, BodyConstraintRow } from './compiled-body-system';
import { compileJointRows } from './compile-joint-rows';
import { partitionBodyGroups } from './body-partitions';
import { fixedBodyGroups } from './fixed-body-groups';

export type BodyCompilation =
  | { readonly ok: false; readonly issues: readonly DocumentIssue[] }
  | { readonly ok: true; readonly system: CompiledBodySystem };

/** The analysis boundary owns unit conversion and never repairs the document's design pose. */
export function compileBodyDocument(document: BodyDocument): BodyCompilation {
  const issues = validateBodyDocument(document);
  if (issues.length) return { ok: false, issues };
  const welded = compileWeldGroups(document);
  if (!welded.ok) return { ok: false, issues: [{ code: welded.code, path: 'groups' }] };
  const length = unitFactors(document.units).length;
  const materialFrames = new Map<BodyId, CompiledBodyGroup>();
  const groupOf = new Map<BodyId, BodyId>();
  for (const group of welded.groups) {
    const compiled: CompiledBodyGroup = {
      id: group.frameBody,
      fixed: group.fixed,
      pose: groupPoseSI(group, document.units),
      members: new Map(
        [...group.members].map(([id, pose]) => [id, { ...scale(pose, length), angle: pose.angle }])
      ),
      mass: group.mass,
      materialMass: group.materialMass,
    };
    materialFrames.set(compiled.id, compiled);
    for (const [id, transform] of group.members) {
      const body = document.bodies.find((candidate) => candidate.id === id)!;
      if (!sameTransform(relativePose(group.pose, body.pose), transform, [group.pose, body.pose]))
        return { ok: false, issues: [{ code: 'inconsistent-weld-pose', path: `bodies.${id}` }] };
      groupOf.set(id, compiled.id);
    }
  }
  const materialAnchors = new Map(
    document.attachments.map((anchor) => {
      const groupId = groupOf.get(anchor.bodyId)!;
      const member = materialFrames.get(groupId)!.members.get(anchor.bodyId)!;
      return [
        anchor.id,
        {
          id: anchor.id,
          bodyId: anchor.bodyId,
          groupId,
          point: localToWorld(member, scale(anchor.point, length)),
        },
      ];
    })
  );
  const referenced = new Set(
    document.joints
      .filter((joint) => joint.kind !== 'weld')
      .flatMap((joint) => [joint.frameA.attachmentId, joint.frameB.attachmentId])
  );
  const { groups: numericalGroups, attachments } = solverGroupFrames(
    materialFrames,
    materialAnchors,
    referenced
  );
  const { rows, coordinates, drivers, limits } = compileJointRows(
    document,
    numericalGroups,
    groupOf,
    attachments
  );
  const groups = fixedBodyGroups(numericalGroups, rows);
  const fixed = (row: BodyConstraintRow) =>
    groups.get(row.pair.groupA)!.fixed && groups.get(row.pair.groupB)!.fixed;
  return {
    ok: true,
    system: {
      groups,
      groupOf,
      attachments,
      coordinates,
      partitions: partitionBodyGroups(groups, rows, drivers, limits),
      fixedRows: rows.filter(fixed),
      fixedDrivers: drivers.filter((driver) => fixed(driver.row)),
      fixedLimits: limits.filter((limit) => fixed(limit.row)),
    },
  };
}
