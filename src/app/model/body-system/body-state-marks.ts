import { BodyDocument } from './body-document';
import { geometryCenter } from './body-center-geometry';
import { localToWorld } from './body-frame';
import { bodyForceEnds } from './body-force-edit';
import { bodyJointMarks } from './body-joint-marks';

/** Locks describe authored positions, independently of whether that material is currently selected. */
export function bodyLockMarks(document: BodyDocument) {
  const marks = bodyJointMarks(document)
    .filter((mark) => {
      if (mark.attachmentId && document.locks.includes(mark.attachmentId)) return true;
      return document.joints.some(
        (j) =>
          mark.jointIds.includes(j.id) &&
          [j.frameA.attachmentId, j.frameB.attachmentId].some((id) => document.locks.includes(id))
      );
    })
    .map((mark) => ({ key: mark.key, point: mark.point }));
  for (const body of document.bodies)
    if (body.kind === 'material' && body.locked)
      marks.push({ key: body.id, point: localToWorld(body.pose, geometryCenter(body.geometry)) });
  for (const force of document.forces)
    if (force.locked) marks.push({ key: force.id, point: bodyForceEnds(document, force)[0] });
  return marks;
}
