import { BodyDocument } from './body-document';
import { AssemblyId } from './body-id';
import { CylinderDimensions } from './cylinder-factory';
import { BodyEditRefusal } from './body-edit-types';
import { reshapeBodyCylinder } from './body-cylinder-shape';
import { bodyEditRefusal } from './joint-permission';
import { localToWorld } from './body-frame';
import { jointCoordinate } from './joint-coordinate';
import { compileWeldFrames } from './weld-frames';
import { createBodyEditModel } from './body-edit-model';
import { bodyEditCoordinate, bodyEditRows } from './body-edit-rows';
import { editSubtract } from './body-edit-scalar';
import { relaxBodyEdit } from './body-edit-relaxation';
import { editBodyGeometry } from './body-geometry-edit';

export interface BodyCylinderDimensionEdit {
  readonly kind: 'cylinder-dimensions';
  readonly assemblyId: AssemblyId;
  readonly dimensions: CylinderDimensions;
  readonly anchor?: 'barrel' | 'rod';
}
/** Dimension changes keep signed extension and a chosen outer attachment, while the connected mechanism settles. */
export function editBodyCylinderDimensions(
  source: BodyDocument,
  operation: BodyCylinderDimensionEdit
): { readonly ok: true; readonly document: BodyDocument } | BodyEditRefusal {
  const assembly = source.assemblies.find((a) => a.id === operation.assemblyId);
  if (!assembly) return bodyEditRefusal('missing-target');
  const d = operation.dimensions;
  if (
    !d ||
    Object.keys(d).length !== 5 ||
    ![d.barrelLength, d.rodLength, d.bore, d.rodDiameter, d.stroke].every(
      (v) => Number.isFinite(v) && v > 0
    ) ||
    d.rodDiameter >= d.bore ||
    d.rodLength > d.barrelLength ||
    d.stroke >= d.rodLength ||
    (operation.anchor !== undefined && !['barrel', 'rod'].includes(operation.anchor))
  )
    return bodyEditRefusal('invalid-command');
  const old = {
    ...assembly.dimensions,
    stroke: source.limits.find((l) => l.id === assembly.strokeLimit)!.upper,
  };
  const fields = Object.keys(old) as (keyof CylinderDimensions)[];
  if (fields.every((key) => d[key] === old[key])) return { ok: true, document: source };
  const internal = source.joints.find((j) => j.id === assembly.internalJoint)!;
  const poses = new Map(source.bodies.map((b) => [b.id, b.pose]));
  const points = new Map(source.attachments.map((a) => [a.id, a]));
  const travel = jointCoordinate(internal, 'travel', poses, points);
  const target = operation.anchor === 'rod' ? assembly.rodMount : assembly.barrelMount;
  const attachment = points.get(target)!,
    anchor = localToWorld(poses.get(attachment.bodyId)!, attachment.point);
  const driven = source.drivers.some(
    (driver) =>
      driver.coordinate.jointId === internal.id && driver.coordinate.coordinate === 'travel'
  );
  const frames = compileWeldFrames(source);
  if (!frames.ok) return bodyEditRefusal('invalid-document');
  const at = (fraction: number) => {
    const interpolate = (key: keyof CylinderDimensions) =>
      old[key] + (d[key] - old[key]) * fraction;
    const next: CylinderDimensions = {
      barrelLength: interpolate('barrelLength'),
      rodLength: interpolate('rodLength'),
      bore: interpolate('bore'),
      rodDiameter: interpolate('rodDiameter'),
      stroke: interpolate('stroke'),
    };
    const document = reshapeBodyCylinder(source, assembly, next);
    return (
      document &&
      createBodyEditModel(document, target, frames.groups, frames.groupOf, { rigid: true })
    );
  };
  let model = at(0);
  if (!model) return bodyEditRefusal('invalid-document');
  let values: readonly number[] = Array(model.width).fill(0),
    progress = 0;
  let step = Math.min(
    1,
    0.05 / Math.max(...fields.map((key) => Math.abs(d[key] - old[key]) / old[key]))
  );
  for (let round = 0; progress < 1 && round < 4096; round++) {
    const next = Math.min(1, progress + step),
      candidate = at(next)!;
    const rowsAt = (v: readonly number[], keepHeading: boolean) => {
      const view = candidate.at(v),
        point = view.point(target),
        c = view.constant;
      const rows = [
        ...bodyEditRows(candidate, v, source),
        editSubtract(point.x, c((anchor.x - candidate.origin.x) / candidate.length)),
        editSubtract(point.y, c((anchor.y - candidate.origin.y) / candidate.length)),
      ];
      if (keepHeading)
        rows.push(
          editSubtract(view.angle(attachment.bodyId), c(poses.get(attachment.bodyId)!.angle))
        );
      if (!driven)
        rows.push(
          editSubtract(
            bodyEditCoordinate(candidate, v, internal, 'travel'),
            c(travel / candidate.length)
          )
        );
      return rows;
    };
    // A free fabrication should not rotate merely because its off-axis material changes the least-motion metric.
    const solved =
      relaxBodyEdit(values, (v) => rowsAt(v, true), candidate.angularColumns) ??
      relaxBodyEdit(values, (v) => rowsAt(v, false), candidate.angularColumns);
    if (!solved || solved.some((value, i) => Math.abs(value - values[i]) > 0.2)) {
      step /= 2;
      if (step < 2 ** -24 || next === progress) return bodyEditRefusal('unsolved-edit');
      continue;
    }
    model = candidate;
    values = solved;
    progress = next;
  }
  if (progress !== 1) return bodyEditRefusal('unsolved-edit');
  let document = model.document;
  for (const op of model.operations(values)) {
    const result = editBodyGeometry(document, op);
    if (!result.ok) return result;
    document = result.document;
  }
  return { ok: true, document };
}
