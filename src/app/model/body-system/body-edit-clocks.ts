import { BodyDocument } from './body-document';
import type { BodyClockState } from './body-document-authority';
import { BodyEditPlan } from './body-edit-types';
import { bodyEditEffects, sameBodyRecord } from './body-edit-effects';
import { convertBodyUnits } from './body-unit-edit';
import { unitFactors } from './body-units';
import { compileBodyDocument } from './constraint-compiler';
import { DriverId } from './body-id';

export function clocksAfterBodyEdit(
  document: BodyDocument,
  clocks: readonly BodyClockState[],
  plan: BodyEditPlan
): BodyClockState[] {
  const converted = sameBodyRecord(document.units, plan.document.units)
    ? undefined
    : convertBodyUnits(document, plan.document.units);
  const reference = converted?.ok ? converted.document : document;
  const length = unitFactors(document.units).length / unitFactors(plan.document.units).length;
  // Fixed coordinates have clocks too; partition invalidation alone cannot convert their numbers.
  const previousClocks = converted?.ok
    ? clocks.map((clock) =>
        document.drivers.find((driver) => driver.id === clock.driverId)?.coordinate.coordinate ===
        'travel'
          ? { ...clock, anchor: clock.anchor * length, command: clock.command * length }
          : clock
      )
    : clocks;
  const invalidated = bodyEditEffects(reference, plan.document, 'motion').invalidatedPartitions;
  const affected = new Set<DriverId>();
  for (const source of [reference, plan.document]) {
    const compiled = compileBodyDocument(source);
    if (!compiled.ok) continue;
    for (const partition of compiled.system.partitions)
      if (invalidated.includes(partition.key))
        partition.drivers.forEach((driver) => affected.add(driver.id));
  }
  return plan.document.drivers.map((driver) => {
    const clock = previousClocks.find((item) => item.driverId === driver.id);
    if (
      clock &&
      !affected.has(driver.id) &&
      sameBodyRecord(
        reference.drivers.find((item) => item.id === driver.id),
        driver
      )
    )
      return clock;
    return {
      driverId: driver.id,
      anchor: driver.profile.initial,
      command: driver.profile.initial,
      time: 0,
      synced: clock?.synced ?? true,
    };
  });
}
