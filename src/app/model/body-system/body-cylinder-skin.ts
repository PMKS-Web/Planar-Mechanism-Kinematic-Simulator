import { BodyDocument } from './body-document';
import { MaterialBody } from './material-body';
import { bodyMaterialPath } from './body-material-marks';

/** The open bore is artwork on the barrel's frame; it never clips or owns the bracket beside it. */
export function nativeMaterialSkin(document: BodyDocument, body: MaterialBody): string {
  const cylinder = document.assemblies.find((c) => c.barrel === body.id);
  if (!cylinder) return bodyMaterialPath(body);
  const length = cylinder.dimensions.barrelLength,
    outer = cylinder.dimensions.bore / 2;
  const inner = Math.max(cylinder.dimensions.rodDiameter / 2, outer * 0.65),
    cap = outer * 0.65;
  return `M 0 ${-outer} H ${length} V ${-inner} H ${cap} V ${inner} H ${length} V ${outer} H 0 Z`;
}
