import { BodyDocument } from './body-document';
import type { BodyClockState } from './body-document-authority';
import { BodyEditPlan } from './body-edit-types';
import { bodyEditEffects, sameBodyRecord } from './body-edit-effects';
import { compileBodyDocument } from './constraint-compiler';
import { DriverId } from './body-id';

export function clocksAfterBodyEdit(
  document: BodyDocument,
  clocks: readonly BodyClockState[],
  plan: BodyEditPlan
): BodyClockState[] {
  if (
    [...plan.effects.added, ...plan.effects.removed, ...plan.effects.changed].every(
      (ref) => ref.kind === 'project'
    )
  )
    return [...clocks];
  // Gravity invalidates every force result, but cannot restart an unrelated machine in a mixed batch.
  const invalidated = sameBodyRecord(document.settings, plan.document.settings)
    ? plan.effects.invalidatedPartitions
    : bodyEditEffects({ ...document, settings: plan.document.settings }, plan.document)
        .invalidatedPartitions;
  const affected = new Set<DriverId>();
  for (const source of [document, plan.document]) {
    const compiled = compileBodyDocument(source);
    if (!compiled.ok) continue;
    for (const partition of compiled.system.partitions)
      if (invalidated.includes(partition.key))
        partition.drivers.forEach((driver) => affected.add(driver.id));
  }
  return plan.document.drivers.map((driver) => {
    const clock = clocks.find((item) => item.driverId === driver.id);
    if (clock && !affected.has(driver.id)) return clock;
    return {
      driverId: driver.id,
      anchor: driver.profile.initial,
      command: driver.profile.initial,
      time: 0,
      synced: clock?.synced ?? true,
    };
  });
}
