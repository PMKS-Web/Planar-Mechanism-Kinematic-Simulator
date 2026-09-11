import { BodyId, compareRecordIds } from './body-id';
import {
  BodyConstraintRow,
  CompiledBodyGroup,
  CompiledBodyPartition,
} from './compiled-body-system';
import { bodyRowsJacobian, bodyRowValue, GroupPoses } from './body-constraint-rows';
import { createBodySolveFrame } from './body-solve-frame';
import { bodyPositionScale } from './body-position-scale';
import { bodyNullSpace, factorBodyRows } from './body-linear-algebra';
import { partitionBodyGroups } from './body-partitions';

/** Passive rigidity changes clock connectivity, never material ownership or weld identity. */
export function fixedBodyGroups(
  source: ReadonlyMap<BodyId, CompiledBodyGroup>,
  rows: readonly BodyConstraintRow[]
): ReadonlyMap<BodyId, CompiledBodyGroup> {
  const groups = new Map(source);
  const poses = new Map([...groups].map(([id, group]) => [id, group.pose]));
  const passive = rows.filter((row) => row.commandId === undefined);
  for (;;) {
    const partitions = partitionBodyGroups(groups, passive, [], []);
    const individual = partitions.flatMap((partition) =>
      partition.unknowns.flatMap((id) =>
        isolatedCore({ ...partition, unknowns: [id] }, groups, poses)
      )
    );
    const found = individual.length
      ? individual
      : partitions.flatMap((partition) => isolatedCore(partition, groups, poses));
    if (!found.length) return groups;
    for (const id of found) groups.set(id, { ...groups.get(id)!, fixed: true });
  }
}

function isolatedCore(
  source: CompiledBodyPartition,
  groups: ReadonlyMap<BodyId, CompiledBodyGroup>,
  poses: GroupPoses
): readonly BodyId[] {
  let unknowns = [...source.unknowns];
  while (unknowns.length) {
    const candidate = new Set(unknowns);
    const included = (id: BodyId) => candidate.has(id) || groups.get(id)!.fixed;
    const rows = source.rows.filter(
      (row) => included(row.pair.groupA) && included(row.pair.groupB)
    );
    const boundary = [...new Set(rows.flatMap((row) => [row.pair.groupA, row.pair.groupB]))]
      .filter((id) => !candidate.has(id))
      .sort(compareRecordIds);
    const partition = { ...source, unknowns, boundary, rows };
    const frame = createBodySolveFrame(partition, poses),
      local = frame.partition;
    const scale = bodyPositionScale(local, frame.initialPoses);
    const matrix = bodyRowsJacobian(local.rows, frame.initialPoses, unknowns).map((row, i) =>
      row.map((value, j) => value * scale.rows[i] * scale.columns[j])
    );
    const factor = factorBodyRows(matrix, unknowns.length * 3);
    if (!factor) return [];
    if (factor.rank === factor.width) {
      const consistent = local.rows.every((row, i) => {
        const residual = Math.abs(bodyRowValue(row, frame.initialPoses) * scale.rows[i]);
        const tolerance = 1e-9 + (row.kind === 'angle' ? 0 : frame.inputPrecision * scale.rows[i]);
        return Number.isFinite(residual) && residual <= tolerance;
      });
      return consistent ? unknowns : [];
    }
    // A turning rocker may be instantaneously still. Removing moving neighbors and
    // their rows forces the survivor to prove rigidity without borrowing that instant.
    // This cutoff selects candidates only; full rank and consistency above certify them.
    const nullSpace = bodyNullSpace(factor);
    const remaining = unknowns.filter((_, i) =>
      nullSpace.every(
        (vector) => Math.hypot(vector[3 * i], vector[3 * i + 1], vector[3 * i + 2]) <= 1e-8
      )
    );
    if (remaining.length === unknowns.length) return [];
    unknowns = remaining;
  }
  return [];
}
