import { editBodyMarks } from './body-edit-marks';
import { BodyDocument, GroupAnnotation } from './body-document';
import { BodyPropertyOperation } from './body-property-types';
import { BodyEditRefusal } from './body-edit-types';
import { WORLD } from './body-id';
import { bodyEditRefusal } from './joint-permission';
import { compileWeldFrames } from './weld-frames';
import { bodyGroupPresentation } from './body-group-presentation';
import { editBodyForce } from './body-force-edit';

const KINDS = [
  'body-properties',
  'group-properties',
  'force-properties',
  'force-owner',
  'attachment-properties',
  'label',
  'lock',
  'hold',
];
export function isBodyPropertyOperation(operation: {
  readonly kind: string;
}): operation is BodyPropertyOperation {
  return KINDS.includes(operation.kind);
}
export function editBodyProperties(
  document: BodyDocument,
  operation: BodyPropertyOperation
): { readonly ok: true; readonly document: BodyDocument } | BodyEditRefusal {
  if ('change' in operation) {
    const keys =
      operation.kind === 'body-properties' || operation.kind === 'group-properties'
        ? ['label', 'mass', 'presentation']
        : operation.kind === 'attachment-properties'
          ? ['label', 'trace', 'color']
          : ['label', 'point', 'vector', 'frame', 'couple', 'presentation'];
    if (Object.keys(operation.change).some((key) => !keys.includes(key)))
      return bodyEditRefusal('invalid-command');
  }
  if (operation.kind === 'lock' || operation.kind === 'hold')
    return editBodyMarks(document, operation);
  if (operation.kind === 'force-properties' || operation.kind === 'force-owner')
    return editBodyForce(document, operation);
  let next = document;
  switch (operation.kind) {
    case 'body-properties': {
      const body = document.bodies.find((item) => item.id === operation.bodyId);
      if (!body) return bodyEditRefusal('missing-target');
      if (body.id === WORLD || body.kind === 'world') return bodyEditRefusal('immutable-world');
      const change = operation.change;
      next = {
        ...document,
        bodies: document.bodies.map((item) =>
          item === body
            ? {
                ...body,
                ...(change.label !== undefined ? { label: change.label } : {}),
                ...(change.mass ? { mass: { ...body.mass, ...defined(change.mass) } } : {}),
                ...(change.presentation
                  ? { presentation: { ...body.presentation, ...defined(change.presentation) } }
                  : {}),
              }
            : item
        ),
      };
      break;
    }
    case 'group-properties': {
      const compiled = compileWeldFrames(document);
      if (!compiled.ok) return bodyEditRefusal('invalid-document');
      const group = compiled.groupOf.get(operation.members[0]);
      if (group?.members.size === 1 && group.members.has(WORLD))
        return bodyEditRefusal('immutable-world');
      if (
        !group ||
        group.members.size !== operation.members.length ||
        new Set(operation.members).size !== group.members.size ||
        operation.members.some((id) => !group.members.has(id))
      )
        return bodyEditRefusal('missing-target');
      const old = document.groups.find((item) => item.members.includes(group.frameBody));
      const change = operation.change;
      if (!Object.values(change).some((value) => value !== undefined)) break;
      if (
        !old &&
        change.mass === null &&
        change.label === undefined &&
        !Object.values(change.presentation ?? {}).some((value) => value !== undefined)
      )
        break;
      const annotation: GroupAnnotation = {
        ...old,
        members: [...group.members.keys()],
        frameBody: old?.frameBody ?? group.frameBody,
        ...(change.label !== undefined ? { label: change.label } : {}),
        ...(change.presentation
          ? {
              presentation: {
                ...bodyGroupPresentation(document, group).presentation!,
                ...defined(change.presentation),
              },
            }
          : {}),
        ...(change.mass !== undefined && change.mass !== null ? { mass: change.mass } : {}),
      };
      const { mass, ...withoutMass } = annotation;
      next = {
        ...document,
        groups: [
          ...document.groups.filter((item) => item !== old),
          change.mass === null ? withoutMass : annotation,
        ],
      };
      break;
    }
    case 'attachment-properties': {
      if (!document.attachments.some((point) => point.id === operation.attachmentId))
        return bodyEditRefusal('missing-target');
      next = {
        ...document,
        attachments: document.attachments.map((point) =>
          point.id === operation.attachmentId ? { ...point, ...defined(operation.change) } : point
        ),
      };
      break;
    }
    case 'label': {
      const table = operation.target.kind === 'joint' ? 'joints' : 'assemblies';
      if (!document[table].some((item) => item.id === operation.target.id))
        return bodyEditRefusal('missing-target');
      next = {
        ...document,
        [table]: document[table].map((item) =>
          item.id === operation.target.id ? { ...item, label: operation.label } : item
        ),
      };
      break;
    }
  }
  return { ok: true, document: next };
}
function defined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  ) as Partial<T>;
}
