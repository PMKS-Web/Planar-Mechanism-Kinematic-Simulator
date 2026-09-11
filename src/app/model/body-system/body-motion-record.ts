import { BodyRecordRef } from './body-edit-types';
import { Body } from './material-body';
import { Attachment, BodyJoint } from './joint-record';

/** Display, mass, loads and edit marks cannot re-parameterize a machine's motion clock. */
export function bodyMotionRecord(ref: BodyRecordRef, value: unknown): unknown {
  switch (ref.kind) {
    case 'project':
      return ref.field === 'units' ? value : undefined;
    case 'body': {
      const body = value as Body;
      return body.kind === 'world'
        ? body
        : { id: body.id, kind: body.kind, pose: body.pose, geometry: body.geometry };
    }
    case 'attachment': {
      const point = value as Attachment;
      return { id: point.id, bodyId: point.bodyId, point: point.point };
    }
    case 'joint': {
      const { label, ...joint } = value as BodyJoint;
      if ('guideDisplay' in joint) {
        const { guideDisplay, ...physical } = joint;
        return physical;
      }
      return joint;
    }
    case 'driver':
    case 'limit':
      return value;
    default:
      return undefined;
  }
}
