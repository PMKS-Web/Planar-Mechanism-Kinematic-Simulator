import { cylinderCreationLayout, cylinderStrokeAlong } from '../cylinder';
import { CYLINDER } from '../joint-marks';
import { BodyDocument } from './body-document';
import { createBodyCylinder } from './cylinder-factory';
import { Point } from './body-frame';

/** The native records use the same initial overlap and mark proportions as a ram drawn in the public editor. */
export function createNativeCylinder(document: BodyDocument, from: Point, to: Point) {
  const layout = cylinderCreationLayout(from, to, document.settings.objectScale);
  const r = document.settings.objectScale * 0.15;
  const bounds = cylinderStrokeAlong(layout.barrelLength, r);
  const created = createBodyCylinder(
    document,
    { ...from, angle: layout.angleRad },
    {
      barrelLength: layout.barrelLength,
      rodLength: layout.rodLength,
      bore: 2 * CYLINDER.barrelHalf * r,
      rodDiameter: 2 * CYLINDER.rodHalf * r,
      stroke: bounds.max - bounds.min,
    },
    layout.pinFromMount - bounds.min
  );
  const joint = created.document.joints.find(
    (joint) => joint.id === created.assembly.internalJoint
  )!;
  const barrel = created.document.bodies.find((body) => body.id === created.assembly.barrel)!;
  return {
    ...created,
    document: {
      ...created.document,
      attachments: created.document.attachments.map((point) =>
        point.id === joint.frameA.attachmentId
          ? { ...point, point: { x: bounds.min, y: 0 } }
          : point
      ),
      bodies: created.document.bodies.map((body) =>
        body.id === created.assembly.rod && body.kind === 'material' && barrel.kind === 'material'
          ? {
              ...body,
              pose: { ...layout.pin, angle: layout.angleRad },
              presentation: { ...body.presentation, fill: barrel.presentation.fill },
            }
          : body
      ),
    },
  };
}
