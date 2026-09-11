import { Point } from './body-frame';
import { BodyEditModel } from './body-edit-model';
import { bodyEditRows } from './body-edit-rows';
import { editSubtract } from './body-edit-scalar';

export function pointEditRows(model: BodyEditModel, values: readonly number[], target: Point) {
  const view = model.at(values),
    point = view.point(model.target);
  return [
    ...bodyEditRows(model, values),
    editSubtract(point.x, view.constant((target.x - model.origin.x) / model.length)),
    editSubtract(point.y, view.constant((target.y - model.origin.y) / model.length)),
  ];
}
