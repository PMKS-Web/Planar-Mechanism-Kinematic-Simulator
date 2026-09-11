import { ForceDocument } from './force-document';
import { CompiledBodyPartition, CompiledBodySystem } from './compiled-body-system';
import { compareRecordIds, WORLD } from './body-id';
import { scale } from './body-frame';
import { unitFactors } from './body-units';
import { createBodySolveFrame } from './body-solve-frame';

/** A fixed foundation keeps the same numerical frame for support policy and equilibrium. */
export function fixedForceFrame(document: ForceDocument, system: CompiledBodySystem) {
  const groups = [...system.groups.values()]
    .filter((group) => group.fixed)
    .sort((a, b) => compareRecordIds(a.id, b.id));
  const unknowns = groups.filter((group) => group.id !== WORLD).map((group) => group.id);
  const partition: CompiledBodyPartition = {
    key: 'fixed-forces',
    unknowns,
    boundary: [WORLD],
    materialIds: unknowns.flatMap((id) => [...system.groups.get(id)!.members.keys()]),
    rows: system.fixedRows,
    drivers: system.fixedDrivers,
    limits: system.fixedLimits,
  };
  // A WORLD-only weld group has no moving origin to choose. Refer its force
  // balance to nearby material instead of subtracting moments about a distant zero.
  const reference = document.bodies
    .filter(
      (body) => body.kind === 'material' && system.groups.get(system.groupOf.get(body.id)!)?.fixed
    )
    .sort((a, b) => compareRecordIds(a.id, b.id))[0];
  const frame = createBodySolveFrame(
    partition,
    new Map(groups.map((group) => [group.id, group.pose])),
    reference && scale(reference.pose, unitFactors(document.units).length)
  );
  return frame;
}
