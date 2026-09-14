import { BodyDocument } from './body-document';
import { compileWeldGroups } from './weld-groups';
import { localToWorld, scale } from './body-frame';
import { unitFactors } from './body-units';

/** A compound has one mass center, including an explicit group override. */
export function bodyCenterMarks(document: BodyDocument) {
  const groups = compileWeldGroups(document);
  if (!groups.ok) return [];
  const length = unitFactors(document.units).length;
  return groups.groups
    .filter((group) => group.mass.mass > 0)
    .map((group) => ({
      key: group.key,
      point: localToWorld(group.pose, scale(group.mass.displayCenter, 1 / length)),
    }));
}
