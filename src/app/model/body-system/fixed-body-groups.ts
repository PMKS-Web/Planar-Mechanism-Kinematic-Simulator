import { BodyId, compareRecordIds } from './body-id';
import {
  BodyConstraintRow,
  CompiledBodyGroup,
  CompiledBodyPartition,
} from './compiled-body-system';
import { bodyRowsJacobian, bodyRowValue, GroupPoses } from './body-constraint-rows';
import { createBodySolveFrame } from './body-solve-frame';
import { bodyPositionScale } from './body-position-scale';
import { factorBodyRows } from './body-linear-algebra';

/** Passive relations to known ground can hold a frame without changing its material or weld identity. */
export function fixedBodyGroups(
  source: ReadonlyMap<BodyId, CompiledBodyGroup>,
  rows: readonly BodyConstraintRow[]
): ReadonlyMap<BodyId, CompiledBodyGroup> {
  const groups = new Map(source);
  const poses = new Map([...groups].map(([id, group]) => [id, group.pose]));
  const passive = rows.filter((row) => row.commandId === undefined);
  for (;;) {
    const found = [...groups.values()].filter(
      (group) => !group.fixed && heldByFrame(group.id, groups, passive, poses)
    );
    if (!found.length) return groups;
    for (const group of found) groups.set(group.id, { ...group, fixed: true });
  }
}

function heldByFrame(
  id: BodyId,
  groups: ReadonlyMap<BodyId, CompiledBodyGroup>,
  passive: readonly BodyConstraintRow[],
  poses: GroupPoses
): boolean {
  const rows = passive.filter(
    (row) =>
      (row.pair.groupA === id && groups.get(row.pair.groupB)!.fixed) ||
      (row.pair.groupB === id && groups.get(row.pair.groupA)!.fixed)
  );
  if (rows.length < 3) return false;
  const boundary = [...new Set(rows.flatMap((row) => [row.pair.groupA, row.pair.groupB]))]
    .filter((other) => other !== id)
    .sort(compareRecordIds);
  const partition: CompiledBodyPartition = {
    key: `fixed-test:${id}`,
    unknowns: [id],
    boundary,
    materialIds: [...groups.get(id)!.members.keys()],
    rows,
    drivers: [],
    limits: [],
  };
  const frame = createBodySolveFrame(partition, poses);
  const local = frame.partition;
  const scale = bodyPositionScale(local, frame.initialPoses);
  for (const [i, row] of local.rows.entries()) {
    const residual = Math.abs(bodyRowValue(row, frame.initialPoses) * scale.rows[i]);
    const tolerance = 1e-9 + (row.kind === 'angle' ? 0 : frame.inputPrecision * scale.rows[i]);
    if (!Number.isFinite(residual) || residual > tolerance) return false;
  }
  // A zero instantaneous rate in a moving linkage can be a turning point. Full rank
  // against already-fixed neighbors instead proves this body's pose is locally isolated.
  const matrix = bodyRowsJacobian(local.rows, frame.initialPoses, [id]).map((row, i) =>
    row.map((value, j) => value * scale.rows[i] * scale.columns[j])
  );
  return factorBodyRows(matrix, 3)?.rank === 3;
}
