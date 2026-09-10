import { BodyId, compareRecordIds } from './body-id';
import {
  BodyConstraintRow,
  CompiledBodyDriver,
  CompiledBodyGroup,
  CompiledBodyLimit,
  CompiledBodyPartition,
} from './compiled-body-system';

/** Sharing a fixed frame is sample availability, not a connection between independent clocks. */
export function partitionBodyGroups(
  groups: ReadonlyMap<BodyId, CompiledBodyGroup>,
  rows: readonly BodyConstraintRow[],
  drivers: readonly CompiledBodyDriver[],
  limits: readonly CompiledBodyLimit[]
): readonly CompiledBodyPartition[] {
  const movable = [...groups.values()]
    .filter((group) => !group.fixed)
    .map((group) => group.id)
    .sort(compareRecordIds);
  const adjacency = new Map(movable.map((id) => [id, new Set<BodyId>()]));
  for (const row of rows) {
    const { groupA, groupB } = row.pair;
    if (!adjacency.has(groupA) || !adjacency.has(groupB)) continue;
    adjacency.get(groupA)!.add(groupB);
    adjacency.get(groupB)!.add(groupA);
  }
  const visited = new Set<BodyId>();
  const partitions: CompiledBodyPartition[] = [];
  for (const start of movable) {
    if (visited.has(start)) continue;
    const queue = [start];
    visited.add(start);
    for (let i = 0; i < queue.length; i++)
      for (const next of adjacency.get(queue[i])!)
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
    const unknowns = queue.sort(compareRecordIds);
    const owns = new Set(unknowns);
    const incident = (row: BodyConstraintRow) =>
      owns.has(row.pair.groupA) || owns.has(row.pair.groupB);
    const ownRows = rows.filter(incident);
    const boundary = new Set<BodyId>();
    for (const row of ownRows)
      for (const id of [row.pair.groupA, row.pair.groupB]) if (!owns.has(id)) boundary.add(id);
    partitions.push({
      key: JSON.stringify(unknowns),
      unknowns,
      boundary: [...boundary].sort(compareRecordIds),
      materialIds: unknowns
        .flatMap((id) => [...groups.get(id)!.members.keys()])
        .sort(compareRecordIds),
      rows: ownRows,
      drivers: drivers.filter((driver) => incident(driver.row)),
      limits: limits.filter((limit) => incident(limit.row)),
    });
  }
  return partitions;
}
