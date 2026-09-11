import { validateProject } from './validate-project';
import { BodyDocument } from './body-document';
import { unitFactors } from './body-units';
import { DocumentIssue, ValidationContext } from './validation-context';
import { validateMaterial, validateAttachments } from './validate-material';
import { validateJoints, validateCoordinates } from './validate-joints';
import {
  validateLoads,
  validateHolds,
  validatePinTrees,
  validateAssemblies,
} from './validate-relations';
import { validateGroups } from './validate-groups';
export type { DocumentIssue } from './validation-context';

/** Checks authored data and references; feasibility and mobility belong to the compiled solver. */
export function validateBodyDocument(document: BodyDocument): readonly DocumentIssue[] {
  const issues: DocumentIssue[] = [];
  const issue = (code: string, path: string) => {
    issues.push({ code, path });
  };
  if (document.version !== 2) issue('unsupported-version', 'version');
  if (Object.values(unitFactors(document.units)).some((value) => !Number.isFinite(value)))
    issue('unsupported-unit', 'units');
  const tables = {
    bodies: document.bodies,
    attachments: document.attachments,
    joints: document.joints,
    junctions: document.junctions,
    assemblies: document.assemblies,
    drivers: document.drivers,
    limits: document.limits,
    forces: document.forces,
  };
  for (const [name, records] of Object.entries(tables)) {
    const ids = new Set<string>();
    for (const record of records) {
      if (!record.id || ids.has(record.id)) issue('duplicate-or-empty-id', `${name}.${record.id}`);
      ids.add(record.id);
    }
  }
  const context: ValidationContext = {
    document,
    issues,
    issue,
    bodies: new Map(document.bodies.map((body) => [body.id, body])),
    anchors: new Map(document.attachments.map((anchor) => [anchor.id, anchor])),
    joints: new Map(document.joints.map((joint) => [joint.id, joint])),
  };
  validateProject(context);
  validateMaterial(context);
  validateAttachments(context);
  validateJoints(context);
  validateCoordinates(context);
  validateLoads(context);
  validateHolds(context);
  validatePinTrees(context);
  validateAssemblies(context);
  validateGroups(context);
  return issues;
}
