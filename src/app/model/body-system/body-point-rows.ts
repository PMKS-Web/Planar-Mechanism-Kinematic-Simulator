import { Point } from './body-frame';
import { PointEditModel } from './body-point-model';
import {
  EditScalar,
  editAdd,
  editSubtract,
  editScale,
  editMultiply,
  editSin,
  editCos,
  editPointSubtract,
} from './body-edit-scalar';

/** The edit system differentiates the same joint semantics, plus CAD holds and positional goals. */
export function pointEditRows(
  model: PointEditModel,
  values: readonly number[],
  target: Point
): EditScalar[] {
  const { document, reached, length } = model,
    view = model.at(values),
    c = view.constant;
  const rows: EditScalar[] = [];
  const coordinate = (joint: (typeof document.joints)[number], kind: 'angle' | 'travel') => {
    const angle = editSubtract(view.angle(joint.bodyB), view.angle(joint.bodyA));
    if (joint.kind === 'weld') return c(0);
    if (kind === 'angle') return editSubtract(angle, c(joint.angleZero));
    const delta = editPointSubtract(
      view.point(joint.frameB.attachmentId),
      view.point(joint.frameA.attachmentId)
    );
    const axis = editAdd(view.angle(joint.bodyA), c(joint.frameA.angle));
    return editSubtract(
      editAdd(editMultiply(editCos(axis), delta.x), editMultiply(editSin(axis), delta.y)),
      c(joint.kind === 'revolute' ? 0 : joint.travelZero / length)
    );
  };
  for (const joint of document.joints) {
    if (joint.kind === 'weld' || (!reached.has(joint.bodyA) && !reached.has(joint.bodyB))) continue;
    const d = editPointSubtract(
      view.point(joint.frameB.attachmentId),
      view.point(joint.frameA.attachmentId)
    );
    if (joint.kind === 'revolute') rows.push(d.x, d.y);
    else {
      const angle = editAdd(view.angle(joint.bodyA), c(joint.frameA.angle));
      rows.push(
        editAdd(editMultiply(editScale(editSin(angle), -1), d.x), editMultiply(editCos(angle), d.y))
      );
      if (joint.kind === 'prismatic') rows.push(coordinate(joint, 'angle'));
    }
  }
  for (const driver of document.drivers) {
    const joint = document.joints.find((j) => j.id === driver.coordinate.jointId)!;
    if (reached.has(joint.bodyA) || reached.has(joint.bodyB))
      rows.push(
        editSubtract(
          coordinate(joint, driver.coordinate.coordinate),
          c(driver.profile.initial / (driver.coordinate.coordinate === 'travel' ? length : 1))
        )
      );
  }
  for (const hold of document.holds) {
    if (!reached.has(hold.bodyId)) continue;
    const d = editPointSubtract(view.point(hold.to), view.point(hold.from));
    if (hold.length !== undefined) {
      const normalized = hold.length / length;
      rows.push(
        editScale(
          editSubtract(editAdd(editMultiply(d.x, d.x), editMultiply(d.y, d.y)), c(normalized ** 2)),
          1 / (2 * normalized)
        )
      );
    }
    if (hold.angle !== undefined)
      rows.push(
        editAdd(editScale(d.x, -Math.sin(hold.angle)), editScale(d.y, Math.cos(hold.angle)))
      );
  }
  const pin = (p: ReturnType<typeof view.point>, x: number, y: number) =>
    rows.push(
      editSubtract(p.x, c((x - model.origin.x) / length)),
      editSubtract(p.y, c((y - model.origin.y) / length))
    );
  const initial = model.at(Array(model.width).fill(0));
  const pinInitial = (p: ReturnType<typeof view.point>, old: ReturnType<typeof view.point>) =>
    rows.push(editSubtract(p.x, c(old.x.value)), editSubtract(p.y, c(old.y.value)));
  for (const id of document.locks) pinInitial(view.point(id), initial.point(id));
  for (const force of document.forces) {
    if (!force.locked || !reached.has(force.bodyId)) continue;
    pinInitial(
      view.materialPoint(force.bodyId, force.point),
      initial.materialPoint(force.bodyId, force.point)
    );
    if (force.frame === 'body')
      rows.push(editSubtract(view.angle(force.bodyId), initial.angle(force.bodyId)));
  }
  pin(view.point(model.target), target.x, target.y);
  return rows;
}
