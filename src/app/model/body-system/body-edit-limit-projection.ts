import { BodyEditModel } from './body-edit-model';
import { bodyEditCoordinate } from './body-edit-rows';
import { EditScalar, editSubtract } from './body-edit-scalar';
import { projectBodyEdit } from './body-edit-projection';

/** A pointer may stop at a physical bound; an exact field edit is still refused beyond it. */
export function projectLimitedBodyEdit(
  model: BodyEditModel,
  seed: readonly number[],
  rowsAt: (v: readonly number[]) => readonly EditScalar[]
): readonly number[] | undefined {
  const active = new Map<string, { index: number; value: number }>();
  const limits = model.document.limits.filter((l) => {
    const j = model.document.joints.find((j) => j.id === l.coordinate.jointId)!;
    return model.reached.has(j.bodyA) || model.reached.has(j.bodyB);
  });
  const coordinate = (v: readonly number[], index: number) => {
    const limit = limits[index],
      joint = model.document.joints.find((j) => j.id === limit.coordinate.jointId)!;
    return bodyEditCoordinate(model, v, joint, limit.coordinate.coordinate);
  };
  for (let round = 0; round <= limits.length * 2; round++) {
    const solved = projectBodyEdit(
      seed,
      (v) => {
        const rows = rowsAt(v);
        return [
          ...rows.slice(0, -2),
          ...Array.from(active.values(), (a) =>
            editSubtract(coordinate(v, a.index), model.at(v).constant(a.value))
          ),
          ...rows.slice(-2),
        ];
      },
      model.angularColumns
    );
    if (!solved) return undefined;
    let added = false;
    for (const [i, limit] of limits.entries()) {
      const scale = limit.coordinate.coordinate === 'travel' ? model.length : 1;
      const value = coordinate(solved, i).value,
        low = limit.lower / scale,
        high = limit.upper / scale;
      const bound = value < low - 1e-10 ? low : value > high + 1e-10 ? high : undefined;
      if (bound === undefined) continue;
      const key = `${i}:${bound}`;
      if (active.has(key)) return undefined;
      active.set(key, { index: i, value: bound });
      added = true;
      break;
    }
    if (!added) return solved;
  }
  return undefined;
}
