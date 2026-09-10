import { LegacyLoadScope } from './body-document';
import { BodyId, compareRecordIds, WORLD } from './body-id';
import { compose, inverse, Pose, relativePose } from './body-frame';
import { WeldFrameGroup } from './weld-frames';

/** A legacy group load names a reference frame without inventing a unique material owner. */
export function captureLoadScope(
  group: WeldFrameGroup,
  reference: BodyId,
  members: readonly BodyId[]
): LegacyLoadScope {
  const frame = group.members.get(reference);
  if (
    !frame ||
    !members.includes(reference) ||
    new Set(members).size !== members.length ||
    members.some((id) => id === WORLD || !group.members.has(id))
  )
    throw new Error('Invalid legacy load scope');
  return {
    members: [...members].sort(compareRecordIds).map((bodyId) => ({
      bodyId,
      poseInReference: relativePose(frame, group.members.get(bodyId)!),
    })),
  };
}

/** Rebasing changes coordinates; it must not look like reshaping the imported fabrication. */
export function rebaseLoadScope(
  scope: LegacyLoadScope | undefined,
  reference: BodyId,
  rebased: BodyId,
  newFrameInOld: Pose
): LegacyLoadScope | undefined {
  if (!scope || !scope.members.some((member) => member.bodyId === rebased)) return scope;
  return {
    members: scope.members.map((member) => {
      let pose = member.poseInReference;
      if (reference === rebased) pose = compose(inverse(newFrameInOld), pose);
      if (member.bodyId === rebased) pose = compose(pose, newFrameInOld);
      return { ...member, poseInReference: pose };
    }),
  };
}
