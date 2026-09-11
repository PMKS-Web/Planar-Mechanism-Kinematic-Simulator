import { BodyDocument, GroupAnnotation } from './body-document';
import { compareRecordIds } from './body-id';
import { WeldFrameGroup } from './weld-frames';

/** The same deterministic fallback must serve both the grid and a continuing group's lineage. */
export function bodyGroupPresentation(
  document: BodyDocument,
  group: WeldFrameGroup
): Pick<GroupAnnotation, 'label' | 'presentation'> {
  const annotation = document.groups.find((item) => item.members.includes(group.frameBody));
  const material = document.bodies
    .filter((body) => body.kind === 'material' && group.members.has(body.id))
    .sort((a, b) => compareRecordIds(a.id, b.id))[0];
  return {
    ...(material?.kind === 'material'
      ? { label: material.label, presentation: material.presentation }
      : {}),
    ...(annotation?.label !== undefined ? { label: annotation.label } : {}),
    ...(annotation?.presentation ? { presentation: annotation.presentation } : {}),
  };
}
