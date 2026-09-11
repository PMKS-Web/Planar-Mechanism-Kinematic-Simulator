import { BodyEditModel } from './body-edit-model';
import { BodyJoint, JointCoordinate } from './joint-record';
import { bodyEditCoordinate, bodyEditRows } from './body-edit-rows';
import { evenestBodyRows } from './evenest-body-rows';
import { editSubtract } from './body-edit-scalar';
import { relaxBodyEdit } from './body-edit-relaxation';
import { resolvedScalarInterval, ScalarIntervalPoint } from './scalar-interval-shape';

interface EditIntervalPoint {
  readonly command: number;
  readonly values: readonly number[];
  readonly limits: readonly ScalarIntervalPoint[];
}

/** Loose sketches need the same interior-stop scrutiny even when their edit metric supplies extra freedoms. */
export function clearBodyEditInterval(
  model: BodyEditModel,
  joint: BodyJoint,
  coordinate: JointCoordinate,
  before: readonly number[],
  after: readonly number[]
): boolean {
  if (!model.document.limits.length) return true;
  const limits = model.document.limits.map((limit) => ({
    ...limit,
    joint: model.document.joints.find((item) => item.id === limit.coordinate.jointId)!,
    scale: limit.coordinate.coordinate === 'travel' ? model.length : 1,
  }));
  let probes = 0;
  const point = (values: readonly number[]): EditIntervalPoint => {
    if (++probes > 512) throw new Error('Unresolved edit interval');
    const goal = bodyEditCoordinate(model, values, joint, coordinate);
    const rows = [...bodyEditRows(model, values), goal];
    const tangent = evenestBodyRows(
      rows.map((row) => row.gradient),
      rows.map((_, i) => (i === rows.length - 1 ? 1 : 0)),
      model.width
    );
    if (!tangent) throw new Error('Unresolved edit tangent');
    return {
      command: goal.value,
      values,
      limits: limits.map((limit) => {
        const row = bodyEditCoordinate(model, values, limit.joint, limit.coordinate.coordinate);
        return {
          value: row.value,
          slope: row.gradient.reduce((sum, v, i) => sum + v * tangent[i], 0),
        };
      }),
    };
  };
  const fits = (sample: EditIntervalPoint) =>
    sample.limits.every(
      (value, i) =>
        Number.isFinite(value.value) &&
        Number.isFinite(value.slope) &&
        value.value >= limits[i].lower / limits[i].scale - 1e-10 &&
        value.value <= limits[i].upper / limits[i].scale + 1e-10
    );
  const middle = (left: EditIntervalPoint, right: EditIntervalPoint) => {
    const command = (left.command + right.command) / 2;
    if (command === left.command || command === right.command)
      throw new Error('Unresolved edit interval');
    const values = relaxBodyEdit(
      left.values,
      (v) => [
        ...bodyEditRows(model, v),
        editSubtract(
          bodyEditCoordinate(model, v, joint, coordinate),
          model.at(v).constant(command)
        ),
      ],
      model.angularColumns
    );
    if (!values) throw new Error('Unresolved edit interval');
    return point(values);
  };
  const extremaFit = (a: EditIntervalPoint, b: EditIntervalPoint, index: number) => {
    if (a.limits[index].slope * b.limits[index].slope >= 0) return true;
    let left = a,
      right = b;
    for (let cut = 0; cut < 48; cut++) {
      const m = middle(left, right);
      if (!fits(m)) return false;
      if (m.limits[index].slope === 0 || Math.abs(right.command - left.command) <= 1e-11)
        return true;
      if (m.limits[index].slope * left.limits[index].slope > 0) left = m;
      else right = m;
    }
    return false;
  };
  const walk = (left: EditIntervalPoint, right: EditIntervalPoint, depth: number): boolean => {
    if (!fits(left) || !fits(right)) return false;
    if (left.command === right.command) return true;
    const m = middle(left, right);
    if (!fits(m)) return false;
    const h = right.command - left.command;
    if (
      limits.every((_, i) =>
        resolvedScalarInterval(left.limits[i], m.limits[i], right.limits[i], h, 1)
      )
    )
      return limits.every((_, i) => extremaFit(left, m, i) && extremaFit(m, right, i));
    return depth < 24 && walk(left, m, depth + 1) && walk(m, right, depth + 1);
  };
  try {
    return walk(point(before), point(after), 0);
  } catch {
    return false;
  }
}
