import { mountedBodySkin } from './body-mounted-skin';
import { BodyDocument } from './body-document';
import { MaterialBody } from './material-body';
import { bodyMaterialPath } from './body-material-marks';
import { barrelPath, rodBodyPath, CYLINDER, MARK } from '../joint-marks';
import { transformRigidPath } from '../compound-link-path';
import { add, rotate } from './body-frame';

/** The two material frames wear the established ram artwork; their dimensions stay authored. */
export function nativeMaterialSkin(document: BodyDocument, body: MaterialBody): string {
  return mountedBodySkin(document, body, materialSkin(document, body));
}
function materialSkin(document: BodyDocument, body: MaterialBody): string {
  const cylinder = document.assemblies.find((c) => c.barrel === body.id || c.rod === body.id);
  if (!cylinder) return bodyMaterialPath(body);
  const dimensions = cylinder.dimensions;
  const barrel = cylinder.barrel === body.id;
  const internal = document.joints.find((joint) => joint.id === cylinder.internalJoint)!;
  const angle = barrel ? internal.frameA.angle : internal.frameB.angle;
  const mount = document.attachments.find(
    (point) => point.id === (barrel ? cylinder.barrelMount : cylinder.rodMount)
  )!;
  const origin = barrel
    ? mount.point
    : add(mount.point, rotate({ x: -dimensions.rodLength, y: 0 }, angle));
  const r = dimensions.rodDiameter / (2 * CYLINDER.rodHalf);
  const path = barrel
    ? barrelPath(dimensions.bore / (2 * CYLINDER.barrelHalf), 0, dimensions.barrelLength)
    : rodBodyPath(
        r,
        dimensions.rodLength,
        Math.min(MARK.blockAlongHalf * r, dimensions.rodLength / 2)
      );
  // A local frame edit must not move the artwork away from the material's mount and bore.
  return transformRigidPath(
    path,
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    origin,
    add(origin, rotate({ x: 1, y: 0 }, angle))
  );
}
