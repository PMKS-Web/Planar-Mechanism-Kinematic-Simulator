import { BodyDocument } from './body-document';
import { CompiledBodySystem } from './compiled-body-system';
import { Point } from './body-frame';
import { fixedForceComponents } from './fixed-force-components';
import { fixedForceProjection } from './fixed-force-projection';
import { fixedForceFrame } from './fixed-force-frame';
import { bodyRowsJacobian } from './body-constraint-rows';
import { bodyPositionScale } from './body-position-scale';
import { factorBodyRows } from './body-linear-algebra';

/** Fixed support geometry cannot change with clock selection, so its sharing policy is selected once. */
export function fixedSupportPolicies(
  document: BodyDocument,
  system: CompiledBodySystem,
  gravity: Point,
  overrides: ReadonlyMap<string, 'unique' | 'evenest'> = new Map()
): ReadonlyMap<string, 'unique' | 'evenest'> | undefined {
  const components = fixedForceComponents(document, system);
  if (
    [...overrides].some(
      ([key, policy]) =>
        !components.some((component) => component.key === key) ||
        !['unique', 'evenest'].includes(policy)
    )
  )
    return undefined;
  const policies = new Map<string, 'unique' | 'evenest'>();
  for (const component of components) {
    let policy: 'unique' | 'evenest' = 'unique';
    const projected = fixedForceProjection(document, system, component, gravity);
    if (projected.ok) {
      const frame = fixedForceFrame(projected.document, projected.system),
        part = frame.partition;
      const scaling = bodyPositionScale(part, frame.initialPoses);
      const rows = bodyRowsJacobian(part.rows, frame.initialPoses, part.unknowns).map((row, i) =>
        row.map((value, j) => value * scaling.rows[i] * scaling.columns[j])
      );
      const rank = factorBodyRows(rows, part.unknowns.length * 3)?.rank;
      const external = part.rows.filter((row) => row.pair.groupA !== row.pair.groupB).length;
      // Internal weld cycles stay indeterminate; only redundant external support rows qualify.
      if (rank === part.unknowns.length * 3 && external > rank) policy = 'evenest';
    }
    policies.set(component.key, overrides.get(component.key) ?? policy);
  }
  return policies;
}
